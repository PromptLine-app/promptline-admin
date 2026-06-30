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

type ContactSubmission = {
  id: string;
  full_name: string;
  business_name: string;
  business_email: string;
  business_phone: string;
  query_summary: string;
  created_at: string;
};

type ContactFollowupRecord = {
  submission_id: string;
  status: string;
  follow_up_count: number;
  notes: string | null;
  last_contacted_at: string | null;
};

type CombinedContact = ContactSubmission & {
  followup: ContactFollowupRecord | null;
};

const EMAIL_TEMPLATES = [
  {
    id: 'thanks_for_reaching_out',
    name: 'Thanks for reaching out',
    subject: 'Thanks for reaching out to PromptLine!',
    body: "Hi {name},\n\nThank you for reaching out to us. We received your request regarding \"{businessName}\".\n\nCould we schedule a brief 15-minute call to discuss how PromptLine can help your business?\n\nLet me know what time works best for you.\n\nBest,\nPromptLine Team",
  },
  {
    id: 'following_up_contact',
    name: 'Following up',
    subject: 'Following up on your inquiry with PromptLine',
    body: "Hi {name},\n\nI'm following up on your recent inquiry about PromptLine for \"{businessName}\". Are you still interested in setting up an AI phone assistant?\n\nIf you have any questions, feel free to reply directly to this email.\n\nBest,\nPromptLine Team",
  },
];

export const ContactRequestsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<CombinedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<CombinedContact | null>(null);
  
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

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rawSubmissions, error: submissionsError } = await supabase.from('contact_submissions').select('*');
      if (submissionsError) throw submissionsError;

      const { data: followups, error: followupsError } = await supabase
        .from('admin_contact_followups')
        .select('*');
        
      if (followupsError) throw followupsError;

      const followupMap = new Map<string, ContactFollowupRecord>();
      (followups || []).forEach((f) => followupMap.set(f.submission_id, f));

      const combined: CombinedContact[] = (rawSubmissions || [])
        .map((s) => ({
          ...s,
          followup: followupMap.get(s.id) || null,
        }))
        .filter((s) => s.followup?.status !== 'Resolved');

      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setContacts(combined);
    } catch (error) {
      reportError(error, { where: 'ContactRequestsPage.fetchContacts' });
      console.error('Error fetching contact requests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; setState runs after await, not during render
    fetchContacts();
  }, [fetchContacts]);

  const openContactModal = (c: CombinedContact) => {
    setSelectedContact(c);
    setNotes(c.followup?.notes || '');
    setStatus(c.followup?.status || 'Pending');
    updateEmailPreview(EMAIL_TEMPLATES[0].id, c);
    setModalTab('email');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedContact(null);
  };

  const updateEmailPreview = (templateId: string, targetContact: CombinedContact | null = selectedContact) => {
    setSelectedTemplate(templateId);
    const tmpl = EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl && targetContact) {
      const name = targetContact.full_name?.split(' ')[0] || 'there';
      const bName = targetContact.business_name || 'your business';
      setEmailSubject(tmpl.subject.replace('{name}', name).replace('{businessName}', bName));
      setEmailBody(tmpl.body.replace('{name}', name).replace('{businessName}', bName));
    }
  };

  const handleSendEmail = async () => {
    if (!selectedContact || !selectedContact.business_email) return;
    
    setSendingEmail(true);
    try {
      await adminApi('/api/admin/send-followup', 'POST', {
        to: selectedContact.business_email,
        subject: emailSubject,
        body: emailBody,
        body_type: 'Text',
      });

      const newCount = (selectedContact.followup?.follow_up_count || 0) + 1;
      const { error: dbError } = await supabase
        .from('admin_contact_followups')
        .upsert({
          submission_id: selectedContact.id,
          status: 'Contacted',
          follow_up_count: newCount,
          last_contacted_at: new Date().toISOString(),
          notes: notes,
        });

      if (dbError) throw dbError;

      await supabase.from('admin_activity_log').insert({
        action: 'sent_contact_followup_email',
        admin_user_id: user?.id,
        details: { target_email: selectedContact.business_email, template: selectedTemplate }
      });

      await fetchContacts();
      closeModal();
      toast(`Email sent to ${selectedContact.business_email}.`);
    } catch (error) {
      reportError(error, { where: 'ContactRequestsPage.handleSendEmail' });
      console.error('Error sending email:', error);
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      toast(`Failed to send email: ${msg}`, 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedContact) return;
    
    setSavingNotes(true);
    try {
      const { error: dbError } = await supabase
        .from('admin_contact_followups')
        .upsert({
          submission_id: selectedContact.id,
          status: status,
          notes: notes,
          follow_up_count: selectedContact.followup?.follow_up_count || 0,
        });

      if (dbError) throw dbError;

      await fetchContacts();
      closeModal();
      toast('Notes and status updated successfully.');
    } catch (error) {
      reportError(error, { where: 'ContactRequestsPage.handleSaveNotes' });
      console.error('Error saving notes:', error);
      toast('Failed to save notes.', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDiscardContact = async (contactToDiscard: CombinedContact) => {
    if (!window.confirm(`Are you sure you want to discard ${contactToDiscard.business_email} from the follow-up list?`)) return;
    
    try {
      const { error: dbError } = await supabase
        .from('admin_contact_followups')
        .upsert({
          submission_id: contactToDiscard.id,
          status: 'Resolved',
          follow_up_count: contactToDiscard.followup?.follow_up_count || 0,
        });

      if (dbError) throw dbError;

      await fetchContacts();
      toast(`Discarded ${contactToDiscard.business_email}.`);
    } catch (error) {
      reportError(error, { where: 'ContactRequestsPage.handleDiscardContact' });
      console.error('Error discarding contact:', error);
      toast('Failed to discard contact.', 'error');
    }
  };

  const columns: ColumnDef<CombinedContact>[] = [
    {
      header: 'Name',
      id: 'name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{row.full_name || 'No Name Provided'}</p>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>{row.business_email}</p>
          {row.business_phone && <p className="text-muted" style={{ fontSize: '0.8rem' }}>{row.business_phone}</p>}
        </div>
      ),
    },
    {
      header: 'Business',
      id: 'business',
      cell: (row) => row.business_name || '-',
    },
    {
      header: 'Submitted',
      id: 'submitted',
      cell: (row) => new Date(row.created_at).toLocaleDateString(),
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
      id: 'followups',
      cell: (row) => row.followup?.follow_up_count || 0,
    },
    {
      header: 'Last Contacted',
      id: 'last_contacted',
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
            onClick={(e) => { e.stopPropagation(); openContactModal(row); }}
          >
            Follow Up
          </button>
          <button 
            className="btn btn--ghost btn--sm" 
            style={{ color: 'var(--error-color)' }}
            onClick={(e) => { e.stopPropagation(); handleDiscardContact(row); }}
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
        title="Contact Requests" 
        subtitle="Users who submitted a request via the Contact Us form."
        actions={
          <button onClick={fetchContacts} className="btn btn--secondary" disabled={loading}>
            <FiRefreshCw className={loading ? 'fa-spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="page-card">
        {loading ? (
          <p className="text-muted">Loading contact requests...</p>
        ) : (
          <DataTable
            columns={columns}
            data={contacts}
            emptyMessage="No contact requests found."
          />
        )}
      </div>

      {isModalOpen && selectedContact && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'hsl(var(--card))', width: '100%', maxWidth: '500px',
            borderRadius: '12px', padding: '24px', border: '1px solid hsl(var(--border))',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div className="stack gap-md">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Follow Up: {selectedContact.full_name || 'No Name'}</h2>
                  <p className="text-muted">{selectedContact.business_email}</p>
                </div>
                <button onClick={closeModal} className="btn btn--secondary btn--sm" style={{ padding: '0.4rem' }}>
                  <FiX />
                </button>
              </div>

              {/* Added a section to display the query summary from the customer */}
              <div style={{ padding: '12px', backgroundColor: 'hsl(var(--background))', borderRadius: '8px', border: '1px solid hsl(var(--border))', marginTop: '8px' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Customer's Message:</p>
                <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{selectedContact.query_summary || 'No message provided.'}</p>
              </div>

              <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--border))', marginBottom: '1rem', marginTop: '0.5rem' }}>
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
                      disabled={sendingEmail || !emailBody || !emailSubject}
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
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Internal Notes</label>
                    <textarea 
                      rows={6} 
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add internal notes about this contact request..."
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
