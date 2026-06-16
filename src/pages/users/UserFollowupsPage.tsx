import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useAuth } from '@/auth/useAuth';
import { adminApi } from '@/lib/adminApi';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import { FiRefreshCw, FiMail, FiEdit2, FiX } from 'react-icons/fi';

type RegisteredUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
};

type FollowupRecord = {
  user_id: string;
  status: string;
  follow_up_count: number;
  notes: string | null;
  last_contacted_at: string | null;
};

type CombinedUser = RegisteredUser & {
  followup: FollowupRecord | null;
};

const EMAIL_TEMPLATES = [
  {
    id: 'help_getting_started',
    name: 'Need help getting started?',
    subject: 'Need help getting started with PromptLine?',
    body: "Hi {name},\n\nI noticed you created an account with us recently but haven't set up your business yet. I'm reaching out to see if you ran into any issues or if there's anything I can help you with.\n\nLet me know!\n\nBest,\nPromptLine Team",
  },
  {
    id: 'checking_in',
    name: 'Checking in',
    subject: 'Checking in on your PromptLine account',
    body: "Hi {name},\n\nJust checking in to see how things are going. Are you still interested in setting up an AI phone assistant for your business?\n\nIf you have any questions, feel free to reply directly to this email.\n\nBest,\nPromptLine Team",
  },
];

export const UserFollowupsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<CombinedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<CombinedUser | null>(null);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'email' | 'notes'>('email');
  
  // Email state
  const [selectedTemplate, setSelectedTemplate] = useState(EMAIL_TEMPLATES[0].id);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // Notes state
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Pending');
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all users from public.users
      const { data: rawUsers, error: usersError } = await supabase.from('users').select('*');
      if (usersError) throw usersError;

      // 2. Fetch follow up records
      const { data: followups, error: followupsError } = await supabase
        .from('admin_user_followups')
        .select('*');
        
      if (followupsError) throw followupsError;

      const followupMap = new Map<string, FollowupRecord>();
      (followups || []).forEach((f) => followupMap.set(f.user_id, f));

      // 3. Combine and explicitly filter out ANY user with 'Resolved' status
      const combined: CombinedUser[] = (rawUsers || [])
        .map((u) => ({
          ...u,
          followup: followupMap.get(u.id) || null,
        }))
        .filter((u) => u.followup?.status !== 'Resolved'); // <--- The magic filter

      // Sort by latest created first
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setUsers(combined);
    } catch (error) {
      reportError(error, { where: 'UserFollowupsPage.fetchUsers' });
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openUserModal = (u: CombinedUser) => {
    setSelectedUser(u);
    setNotes(u.followup?.notes || '');
    setStatus(u.followup?.status || 'Pending');
    updateEmailPreview(EMAIL_TEMPLATES[0].id, u);
    setModalTab('email');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const updateEmailPreview = (templateId: string, targetUser: CombinedUser | null = selectedUser) => {
    setSelectedTemplate(templateId);
    const tmpl = EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl && targetUser) {
      const name = targetUser.full_name?.split(' ')[0] || 'there';
      setEmailSubject(tmpl.subject.replace('{name}', name));
      setEmailBody(tmpl.body.replace('{name}', name));
    }
  };

  const handleSendEmail = async () => {
    if (!selectedUser || !selectedUser.email) return;
    
    setSendingEmail(true);
    try {
      // 1. Send the email via the /api/admin/send-followup serverless route.
      // The send-ms-email edge function authorizes against czqth's
      // SUPABASE_SERVICE_ROLE_KEY, which must never reach the browser — the
      // server route holds that key and brokers the call after re-checking the
      // caller is an active admin.
      await adminApi('/api/admin/send-followup', 'POST', {
        to: selectedUser.email,
        subject: emailSubject,
        body: emailBody,
        body_type: 'Text',
      });

      // 2. Update follow-up tracking
      const newCount = (selectedUser.followup?.follow_up_count || 0) + 1;
      const { error: dbError } = await supabase
        .from('admin_user_followups')
        .upsert({
          user_id: selectedUser.id,
          status: 'Contacted',
          follow_up_count: newCount,
          last_contacted_at: new Date().toISOString(),
          notes: notes, // Preserve existing notes
        });

      if (dbError) throw dbError;

      // 3. Log admin activity
      await supabase.from('admin_activity_log').insert({
        action: 'sent_followup_email',
        admin_user_id: user?.id,
        details: { target_user: selectedUser.email, template: selectedTemplate }
      });

      // Refresh list
      await fetchUsers();
      closeModal();
      toast(`Email sent to ${selectedUser.email}.`);
    } catch (error: any) {
      reportError(error, { where: 'UserFollowupsPage.handleSendEmail' });
      console.error('Error sending email:', error);
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      
      // Push error to system logs
      await supabase.from('system_error_logs').insert({
        category: 'email',
        level: 'error',
        error_message: msg,
        details: { context: 'Sending follow-up email', to: selectedUser.email, template: selectedTemplate }
      });

      toast(`Failed to send email: ${msg}`, 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedUser) return;
    
    setSavingNotes(true);
    try {
      const { error: dbError } = await supabase
        .from('admin_user_followups')
        .upsert({
          user_id: selectedUser.id,
          status: status,
          notes: notes,
          follow_up_count: selectedUser.followup?.follow_up_count || 0, // preserve count
        });

      if (dbError) throw dbError;

      await fetchUsers();
      closeModal();
      toast('Notes saved.');
    } catch (error) {
      reportError(error, { where: 'UserFollowupsPage.handleSaveNotes' });
      console.error('Error saving notes:', error);
      toast('Failed to save notes.', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDiscardUser = async (userToDiscard: CombinedUser) => {
    if (!window.confirm(`Are you sure you want to discard ${userToDiscard.email} from the follow-up list?`)) return;
    
    try {
      const { error: dbError } = await supabase
        .from('admin_user_followups')
        .upsert({
          user_id: userToDiscard.id,
          status: 'Resolved',
          follow_up_count: userToDiscard.followup?.follow_up_count || 0,
        });

      if (dbError) throw dbError;

      await fetchUsers();
      toast(`Discarded ${userToDiscard.email}.`);
    } catch (error) {
      reportError(error, { where: 'UserFollowupsPage.handleDiscardUser' });
      console.error('Error discarding user:', error);
      toast('Failed to discard user.', 'error');
    }
  };

  const columns: ColumnDef<CombinedUser>[] = [
    {
      header: 'User',
      id: 'full_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{row.full_name || 'No Name Provided'}</p>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>{row.email}</p>
          {row.phone && <p className="text-muted" style={{ fontSize: '0.8rem' }}>{row.phone}</p>}
        </div>
      ),
    },
    { 
      header: 'Signed Up', 
      id: 'created_at', 
      cell: (row) => new Date(row.created_at).toLocaleDateString() 
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => {
        const currentStatus = row.followup?.status || 'Pending';
        return <StatusBadge status={currentStatus === 'Pending' ? 'pending' : currentStatus === 'Contacted' ? 'active' : 'suspended'} label={currentStatus} />;
      },
    },
    {
      header: 'Follow-ups',
      id: 'follow_up_count',
      cell: (row) => row.followup?.follow_up_count || 0,
    },
    {
      header: 'Last Contacted',
      id: 'last_contacted_at',
      cell: (row) => row.followup?.last_contacted_at ? new Date(row.followup.last_contacted_at).toLocaleDateString() : '—',
    },
    {
      header: 'Actions',
      id: 'actions',
      sortable: false,
      cell: (row) => (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button 
            className="btn btn--secondary btn--sm" 
            onClick={(e) => { e.stopPropagation(); openUserModal(row); }}
          >
            Follow Up
          </button>
          <button 
            className="btn btn--ghost btn--sm" 
            style={{ color: 'var(--error-color)' }}
            onClick={(e) => { e.stopPropagation(); handleDiscardUser(row); }}
            title="Mark as resolved and remove from this list"
          >
            Discard
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Incomplete Signups"
        subtitle="Users who registered but have not created a business yet."
        actions={
          <button onClick={fetchUsers} className="btn btn--secondary" disabled={loading}>
            <FiRefreshCw className={loading ? 'fa-spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="page-card">
        {loading ? (
          <p className="text-muted">Loading users...</p>
        ) : (
          <DataTable
            data={users}
            columns={columns}
            emptyMessage="All registered users have created a business!"
          />
        )}
      </div>

      {isModalOpen && selectedUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'hsl(var(--card))', width: '100%', maxWidth: '500px',
            borderRadius: '12px', padding: '24px', border: '1px solid hsl(var(--border))',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)'
          }}>
          <div className="stack gap-md">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Follow Up: {selectedUser.full_name || selectedUser.email}</h2>
                <p className="text-muted">{selectedUser.email}</p>
              </div>
              <button onClick={closeModal} className="btn btn--secondary btn--sm" style={{ padding: '0.4rem' }}>
                <FiX />
              </button>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--border))', marginBottom: '1rem' }}>
              <button 
                onClick={() => setModalTab('email')}
                style={{ 
                  padding: '0.5rem 1rem', 
                  background: 'none', 
                  border: 'none', 
                  borderBottom: modalTab === 'email' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  cursor: 'pointer',
                  fontWeight: modalTab === 'email' ? 600 : 400,
                  color: 'inherit'
                }}
              >
                <FiMail style={{ marginRight: '0.5rem' }}/> Send Email
              </button>
              <button 
                onClick={() => setModalTab('notes')}
                style={{ 
                  padding: '0.5rem 1rem', 
                  background: 'none', 
                  border: 'none', 
                  borderBottom: modalTab === 'notes' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  cursor: 'pointer',
                  fontWeight: modalTab === 'notes' ? 600 : 400,
                  color: 'inherit'
                }}
              >
                <FiEdit2 style={{ marginRight: '0.5rem' }}/> Status & Notes
              </button>
            </div>

            {modalTab === 'email' ? (
              <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email Template</label>
                  <select 
                    value={selectedTemplate} 
                    onChange={(e) => updateEmailPreview(e.target.value)}
                    style={{ padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'inherit' }}
                  >
                    {EMAIL_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Subject</label>
                  <input 
                    type="text" 
                    value={emailSubject} 
                    onChange={(e) => setEmailSubject(e.target.value)} 
                    style={{ padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'inherit', width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Message Body</label>
                  <textarea 
                    rows={8} 
                    value={emailBody} 
                    onChange={(e) => setEmailBody(e.target.value)} 
                    style={{ padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'inherit', fontFamily: 'inherit', resize: 'vertical', width: '100%' }}
                  />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button 
                    className="btn btn--primary" 
                    onClick={handleSendEmail} 
                    disabled={sendingEmail || !selectedUser.email}
                  >
                    {sendingEmail ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Status</label>
                  <select 
                    value={status} 
                    onChange={(e) => setStatus(e.target.value)}
                    style={{ padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'inherit' }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Following Up">Following Up</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Internal Notes</label>
                  <textarea 
                    rows={6} 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this follow up..."
                    style={{ padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'inherit', fontFamily: 'inherit', resize: 'vertical', width: '100%' }}
                  />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button 
                    className="btn btn--primary" 
                    onClick={handleSaveNotes} 
                    disabled={savingNotes}
                  >
                    {savingNotes ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

    </div>
  );
};
