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
import { adminApi } from '@/lib/adminApi';
import { reportError } from '@/lib/sentry';

export const TeamPage = () => {
  const { toast } = useToast();
  const [team, setTeam] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
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
      reportError(error, { where: 'TeamPage.fetchTeam' });
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
    if (!newEmail || !newName || !newPassword) return;
    
    setAddLoading(true);
    try {
      // 1. Create the auth user + admin_users row on the server
      await adminApi('/api/admin/team', 'POST', {
        email: newEmail,
        fullName: newName,
        password: newPassword,
        role: newRole,
      });

      toast(`Added ${newName} as ${newRole}.`);
      setShowAddModal(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('admin');
      fetchTeam();
    } catch (error: any) {
      reportError(error, { where: 'TeamPage.handleAddMember' });
      console.error('Error adding member:', error);
      toast(error.message || 'Failed to add team member.', 'error');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveMember = async (user: AdminUser) => {
    if (!window.confirm(`Are you sure you want to completely remove ${user.full_name}? They will lose all access.`)) return;
    
    try {
      // Remove the admin_users row, the auth user, and the public.users record on
      // the server (deleteUser needs the service-role key).
      await adminApi('/api/admin/team', 'DELETE', {
        id: user.id,
        authUserId: user.auth_user_id,
      });

      toast(`Successfully removed ${user.full_name}.`);
      fetchTeam();
    } catch (error: any) {
      reportError(error, { where: 'TeamPage.handleRemoveMember' });
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
      reportError(error, { where: 'TeamPage.handleChangeRole' });
      console.error('Error changing role:', error);
      toast(error.message || 'Failed to update role.', 'error');
    }
  };

  const handleChangePortalAccess = async (user: AdminUser, accessType: string) => {
    try {
      const updates = {
        has_business_access: accessType === 'business_only' || accessType === 'both',
        has_infra_access: accessType === 'infra_only' || accessType === 'both',
      };
      const { error } = await supabase
        .from('admin_users')
        .update(updates)
        .eq('id', user.id);
        
      if (error) throw error;
      toast(`Updated portal access for ${user.full_name}.`);
      fetchTeam();
    } catch (error: any) {
      console.error('Error changing portal access:', error);
      toast(error.message || 'Failed to update portal access.', 'error');
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
      header: 'Portal Access',
      id: 'portal_access',
      cell: (row) => {
        const accessType = row.has_business_access && row.has_infra_access 
          ? 'both' 
          : row.has_infra_access 
            ? 'infra_only' 
            : 'business_only';
            
        return (
          <select 
            className="form-input" 
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.85rem', width: '130px', minHeight: '32px' }}
            value={accessType}
            onChange={(e) => handleChangePortalAccess(row, e.target.value)}
          >
            <option value="business_only">Business Only</option>
            <option value="infra_only">Infra Only</option>
            <option value="both">Both Portals</option>
          </select>
        );
      },
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
              Provision a new dashboard account and set their initial password.
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

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Temporary Password</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter a secure password..."
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
