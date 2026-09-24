import { useEffect, useState, useCallback } from 'react';
import { supabase, supabaseAuth } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import type { MarketingSender, EmailTemplate, EmailContact } from '@/types/domain';
import {
  FiSend, FiUser, FiMail, FiFileText, FiX, FiEye,
} from 'react-icons/fi';

type Variable = { key: string; label: string };
const VARIABLES: Variable[] = [
  { key: '{{name}}', label: 'Name' },
  { key: '{{company}}', label: 'Company' },
  { key: '{{monthly_loss}}', label: 'Monthly Loss' },
  { key: '{{phone}}', label: 'Phone' },
  { key: '{{industry}}', label: 'Industry' },
];

export const SendEmailPage = () => {
  const { toast } = useToast();
  const [senders, setSenders] = useState<MarketingSender[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [contacts, setContacts] = useState<EmailContact[]>([]);

  const [selectedSender, setSelectedSender] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [recipientMode, setRecipientMode] = useState<'contact' | 'custom'>('custom');
  const [selectedContact, setSelectedContact] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [isTest, setIsTest] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      const [{ data: sData }, { data: tData }, { data: cData }] = await Promise.all([
        supabase.from('marketing_senders').select('*').eq('is_active', true).eq('is_connected', true),
        supabase.from('email_templates').select('*').eq('is_active', true).order('is_starter', { ascending: false }),
        supabase.from('email_contacts').select('id, full_name, email, company, monthly_loss, industry, phone').eq('status', 'active').order('full_name'),
      ]);
      setSenders((sData ?? []) as MarketingSender[]);
      setTemplates((tData ?? []) as EmailTemplate[]);
      setContacts((cData ?? []) as EmailContact[]);
    };
    load();
  }, []);

  const handleTemplateChange = (id: string) => {
    setSelectedTemplate(id);
    const tmpl = templates.find(t => t.id === id);
    if (tmpl) { setSubject(tmpl.subject); setBodyHtml(tmpl.body_html); }
  };

  const handleContactChange = (contactId: string) => {
    setSelectedContact(contactId);
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      setVariables(prev => ({
        ...prev,
        '{{name}}': contact.full_name,
        '{{company}}': contact.company ?? '',
        '{{monthly_loss}}': contact.monthly_loss ? `$${contact.monthly_loss.toLocaleString()}` : '',
        '{{phone}}': contact.phone ?? '',
        '{{industry}}': contact.industry ?? '',
      }));
    }
  };

  const resolvedSubject = () => {
    let s = subject;
    Object.entries(variables).forEach(([k, v]) => { s = s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v); });
    s = s.replace('{{sender_name}}', senders.find(s2 => s2.id === selectedSender)?.display_name ?? '');
    return isTest ? `[TEST] ${s}` : s;
  };

  const resolvedBody = () => {
    let b = bodyHtml;
    Object.entries(variables).forEach(([k, v]) => { b = b.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v); });
    b = b.replace(/\{\{sender_name\}\}/g, senders.find(s => s.id === selectedSender)?.display_name ?? '');
    b = b.replace(/\{\{sender_email\}\}/g, senders.find(s => s.id === selectedSender)?.email ?? '');
    return b;
  };

  const getRecipientEmail = () => recipientMode === 'contact' ? contacts.find(c => c.id === selectedContact)?.email ?? '' : customEmail;
  const getRecipientName = () => recipientMode === 'contact' ? contacts.find(c => c.id === selectedContact)?.full_name ?? '' : customName;

  const handleSend = async () => {
    if (!selectedSender) { toast('Please select a sender', 'error'); return; }
    if (!getRecipientEmail()) { toast('Please provide a recipient email', 'error'); return; }
    if (!subject.trim()) { toast('Please add an email subject', 'error'); return; }
    if (!bodyHtml.trim()) { toast('Please add the email body', 'error'); return; }

    setSending(true);
    try {
      const { data: sessionData } = await supabaseAuth.auth.getSession();
      const token = sessionData.session?.access_token;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-marketing-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          sender_id: selectedSender,
          recipient_email: getRecipientEmail(),
          recipient_name: getRecipientName(),
          template_id: selectedTemplate || undefined,
          contact_id: recipientMode === 'contact' ? selectedContact : undefined,
          custom_subject: !selectedTemplate ? subject : undefined,
          custom_body_html: !selectedTemplate ? bodyHtml : undefined,
          variables: { ...variables, '{{name}}': getRecipientName() || variables['{{name}}'] || '' },
          is_test: isTest,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to send email');

      toast(`Email sent to ${getRecipientEmail()}!`, 'success');
      setSelectedContact('');
      setCustomEmail('');
      setCustomName('');
      setVariables({});
      setIsTest(false);
    } catch (err) {
      reportError(err, { where: 'SendEmailPage.send' });
      toast(err instanceof Error ? err.message : 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    return !q || c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="page-content">
      <PageHeader
        title="Compose & Send Email"
        subtitle="Send personalized marketing emails from your connected sender accounts"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn--secondary" onClick={() => setShowPreview(true)} disabled={!bodyHtml}>
              <FiEye style={{ marginRight: '0.3rem' }} /> Preview
            </button>
            <button className="btn btn--primary" onClick={handleSend} disabled={sending}>
              <FiSend style={{ marginRight: '0.4rem' }} />
              {sending ? 'Sending…' : isTest ? 'Send Test Email' : 'Send Email'}
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
        {/* Left — compose */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Sender */}
          <div className="page-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiUser /> Sender
            </h3>
            {senders.length === 0 ? (
              <div style={{ padding: '1rem', background: 'hsl(38 92% 50% / 0.1)', borderRadius: 8, fontSize: '0.875rem', color: 'hsl(38 60% 35%)' }}>
                No connected sender accounts. Go to <strong>Settings → Senders</strong> to connect an account.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {senders.map(sender => (
                  <button key={sender.id} onClick={() => setSelectedSender(sender.id)} style={{
                    flex: 1, padding: '0.75rem', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${selectedSender === sender.id ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                    background: selectedSender === sender.id ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--secondary))',
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', margin: '0 auto 0.5rem',
                      background: selectedSender === sender.id ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                      display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700,
                    }}>{sender.display_name[0]}</div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.1rem' }}>{sender.display_name}</p>
                    <p className="text-muted" style={{ fontSize: '0.7rem' }}>{sender.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recipient */}
          <div className="page-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiMail /> Recipient
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button className={`btn btn--sm ${recipientMode === 'contact' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setRecipientMode('contact')}>From Contacts</button>
              <button className={`btn btn--sm ${recipientMode === 'custom' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setRecipientMode('custom')}>Custom Email</button>
            </div>

            {recipientMode === 'contact' ? (
              <div>
                <input className="form-input" style={{ marginBottom: '0.5rem' }} placeholder="Search contacts..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
                <select className="form-input" value={selectedContact} onChange={e => handleContactChange(e.target.value)}>
                  <option value="">— Select a contact —</option>
                  {filteredContacts.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name} — {c.email}{c.company ? ` (${c.company})` : ''}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="form-label">Email Address *</label>
                  <input className="form-input" type="email" placeholder="john@example.com" value={customEmail} onChange={e => setCustomEmail(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Recipient Name</label>
                  <input className="form-input" placeholder="John Smith" value={customName} onChange={e => setCustomName(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="page-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiFileText /> Content
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Use Template (optional)</label>
              <select className="form-input" value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)}>
                <option value="">— Write custom email —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Subject *</label>
              <input className="form-input" placeholder="e.g. Your ROI Report, {{name}}" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Email Body (HTML) *</label>
              <textarea
                className="form-input"
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', height: 300, resize: 'vertical', marginTop: '0.5rem' }}
                value={bodyHtml} onChange={e => setBodyHtml(e.target.value)}
                placeholder="<p>Hi {{name}},</p>..."
              />
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="page-card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Variable Values</h4>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>Fill in values to replace placeholders:</p>
            {VARIABLES.map(v => (
              <div key={v.key} style={{ marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{v.key}</label>
                <input className="form-input" style={{ fontSize: '0.8rem' }} placeholder={v.label} value={variables[v.key] ?? ''} onChange={e => setVariables(prev => ({ ...prev, [v.key]: e.target.value }))} />
              </div>
            ))}
          </div>

          <div className="page-card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Options</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} />
              Send as test (prefixes "[TEST]" to subject)
            </label>
          </div>

          {selectedSender && getRecipientEmail() && (
            <div className="page-card" style={{ padding: '1.25rem', background: 'hsl(var(--primary) / 0.05)', border: '1px solid hsl(var(--primary) / 0.2)' }}>
              <h4 style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'hsl(var(--primary))' }}>Ready to Send</h4>
              <p style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}><strong>From:</strong> {senders.find(s => s.id === selectedSender)?.email}</p>
              <p style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}><strong>To:</strong> {getRecipientEmail()}</p>
              <p style={{ fontSize: '0.8rem', wordBreak: 'break-word' }}><strong>Subject:</strong> {resolvedSubject()}</p>
            </div>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="modal-backdrop" onClick={() => setShowPreview(false)}>
          <div className="modal" style={{ maxWidth: 680, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Email Preview</h3>
              <button className="icon-button" onClick={() => setShowPreview(false)}><FiX /></button>
            </div>
            <div style={{ background: 'hsl(var(--secondary))', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>
              <p className="text-muted" style={{ fontSize: '0.75rem' }}>Subject:</p>
              <p style={{ fontWeight: 600 }}>{resolvedSubject()}</p>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid hsl(var(--border))' }}>
              <iframe srcDoc={resolvedBody()} style={{ width: '100%', minHeight: 400, border: 'none' }} title="Email preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
