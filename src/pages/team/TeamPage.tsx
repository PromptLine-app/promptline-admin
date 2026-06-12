import { useEffect, useState } from 'react';
import { supabase, supabaseAuth } from '@/config/supabase';
import { AdminOnly } from '@/auth/AdminOnly';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/Toast';
import { useRealtime } from '@/hooks/useRealtime';
import type { AdminUser, AdminRole } from '@/types/domain';
import { FiPlus } from 'react-icons/fi';

/** Cryptographically-strong random password — the new member never uses it;
 *  they set their own via the reset email we send. */
const generateTempPassword = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + 'Aa1!';
};

export const TeamPage = () => {
  const { toast } = useToast();
  const [team, setTeam] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('admin');

  const fetchTeam = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTeam(data || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  useRealtime({ table: 'admin_users', event: '*', onUpdate: fetchTeam });

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName) return;
    
    setAddLoading(true);
    try {
      // 1. Create user in auth.users with a throwaway strong password. The member
      //    sets their real password via the reset email below — no shared secret.
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newEmail,
        password: generateTempPassword(),
        email_confirm: true,
        user_metadata: { full_name: newName }
      });

      // User might already exist in auth.users, but we don't have a reliable way to fetch them
      // without extra queries, so we just bubble the error for now unless it's "already exists"
      if (authError && !authError.message.includes('already exists')) {
        throw authError;
      }

      const authUserId = authData.user?.id;
      if (!authUserId) throw new Error('Could not retrieve user ID or user already exists.');

      // 2. Insert into public.admin_users
      const { error: dbError } = await supabase.from('admin_users').insert({
        auth_user_id: authUserId,
        email: newEmail,
        full_name: newName,
        role: newRole,
        is_active: true
      });

      if (dbError) throw dbError;

      // 3. Email an invite (password-reset link) so they set their own password.
      const { error: inviteError } = await supabaseAuth.auth.resetPasswordForEmail(newEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (inviteError) {
        console.error('Invite email failed:', inviteError);
        toast(`${newName} was added, but the invite email failed to send. They can use "Forgot password".`, 'error');
      } else {
        toast(`Added ${newName} as ${newRole}. An invite email was sent to set their password.`);
      }
      setShowAddModal(false);
      setNewEmail('');
      setNewName('');
      setNewRole('admin');
      fetchTeam();
    } catch (error: any) {
      console.error('Error adding member:', error);
      toast(error.message || 'Failed to add team member.', 'error');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveMember = async (user: AdminUser) => {
    if (!window.confirm(`Are you sure you want to completely remove ${user.full_name}? They will lose all access.`)) return;
    
    try {
      // 1. Delete from admin_users (removes dashboard access)
      const { error: dbError } = await supabase.from('admin_users').delete().eq('id', user.id);
      if (dbError) throw dbError;
      
      // 2. Cleanup from auth.users to truly remove their account
      await supabase.auth.admin.deleteUser(user.auth_user_id);
      
      // 3. Cleanup the public.users record
      await supabase.from('users').delete().eq('user_auth_id', user.auth_user_id);

      toast(`Successfully removed ${user.full_name}.`);
      fetchTeam();
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast(error.message || 'Failed to remove team member.', 'error');
    }
  };

  const handleChangeRole = async (user: AdminUser, newRole: AdminRole) => {
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ role: newRole })
        .eq('id', user.id);
        
      if (error) throw error;
      toast(`Changed ${user.full_name}'s role to ${newRole}.`);
      fetchTeam();
    } catch (error: any) {
      console.error('Error changing role:', error);
      toast(error.message || 'Failed to update role.', 'error');
    }
  };

  const columns: ColumnDef<AdminUser>[] = [
    {
      header: 'Name',
      id: 'full_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 500 }}>{row.full_name || 'Unnamed'}</p>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>{row.email}</p>
        </div>
      ),
    },
    {
      header: 'Role',
      id: 'role',
      cell: (row) => <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{row.role}</span>,
    },
    {
      header: 'Status',
      id: 'is_active',
      cell: (row) => row.is_active ? <StatusBadge status="active" /> : <StatusBadge status="suspended" label="Inactive" />,
    },
    {
      header: 'Added On',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      header: 'Actions',
      id: 'actions',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select 
            className="form-input" 
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.85rem', width: '100px', minHeight: '32px' }}
            value={row.role}
            onChange={(e) => handleChangeRole(row, e.target.value as AdminRole)}
          >
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <button 
            className="btn btn--ghost" 
            style={{ color: 'var(--error-color)', padding: '0.2rem 0.5rem', fontSize: '0.85rem', minHeight: '32px' }}
            onClick={() => handleRemoveMember(row)}
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-content">
      <PageHeader 
        title="Team Management" 
        subtitle="Manage administrative access to the PromptLine dashboard"
        actions={
          <AdminOnly>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
              <FiPlus /> Add Member
            </button>
          </AdminOnly>
        }
      />

      <div className="dashboard-section">
        {loading ? (
          <div className="page-card"><p>Loading team members...</p></div>
        ) : (
          <DataTable
            data={team}
            columns={columns}
            emptyMessage="No team members found."
          />
        )}
      </div>

      {showAddModal && (
        <div className="dialog-overlay" onClick={() => setShowAddModal(false)}>
          <div className="dialog-panel" onClick={e => e.stopPropagation()}>
            <h3>Add Team Member</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              Provision a new dashboard account. They'll receive an email with a secure link to set their own password.
            </p>
            
            <form onSubmit={handleAddMember}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="jane@promptline.app"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Role</label>
                <select 
                  className="form-input" 
                  value={newRole} 
                  onChange={e => setNewRole(e.target.value as AdminRole)}
                >
                  <option value="admin">Admin (Full Access)</option>
                  <option value="viewer">Viewer (Read Only)</option>
                </select>
              </div>

              <div className="dialog-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={addLoading}>
                  {addLoading ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
