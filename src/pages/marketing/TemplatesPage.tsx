import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import type { EmailTemplate } from '@/types/domain';
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiEye, FiSave,
  FiMonitor, FiSmartphone, FiTag, FiFileText,
} from 'react-icons/fi';

const CATEGORIES = ['general', 'follow_up', 'demo', 'announcement'] as const;
const COMMON_VARS = ['{{name}}', '{{company}}', '{{sender_name}}', '{{monthly_loss}}', '{{phone}}', '{{industry}}'];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const categoryLabel = (c: string) => {
  const map: Record<string, string> = {
    general: 'General', follow_up: 'Follow-up', demo: 'Demo Invite', announcement: 'Announcement',
  };
  return map[c] ?? c;
};

const categoryColor = (c: string) => {
  const map: Record<string, string> = {
    general: 'hsl(var(--primary))', follow_up: 'hsl(142 71% 45%)', demo: 'hsl(260 80% 60%)', announcement: 'hsl(38 92% 50%)',
  };
  return map[c] ?? 'hsl(var(--muted-foreground))';
};

type EditorMode = 'list' | 'edit' | 'preview';

const defaultTemplate: Partial<EmailTemplate> = {
  name: '',
  category: 'general',
  subject: '',
  body_html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">\n  <p>Hi {{name}},</p>\n  <p>Your message here...</p>\n  <p>Best regards,<br><strong>{{sender_name}}</strong><br>PromptLine</p>\n</div>',
  variables: ['{{name}}', '{{sender_name}}'],
  is_active: true,
};

export const TemplatesPage = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<EditorMode>('list');
  const [selected, setSelected] = useState<Partial<EmailTemplate>>(defaultTemplate);
  const [saving, setSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('is_starter', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates((data ?? []) as EmailTemplate[]);
    } catch (err) {
      reportError(err, { where: 'TemplatesPage.load' });
      toast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleEdit = (tmpl: EmailTemplate) => {
    setSelected({ ...tmpl });
    setMode('edit');
  };

  const handleNew = () => {
    setSelected({ ...defaultTemplate, id: undefined });
    setMode('edit');
  };

  const handleSave = async () => {
    if (!selected.name?.trim()) { toast('Template name is required', 'error'); return; }
    if (!selected.subject?.trim()) { toast('Subject is required', 'error'); return; }
    if (!selected.body_html?.trim()) { toast('Email body is required', 'error'); return; }

    setSaving(true);
    try {
      const payload = {
        name: selected.name.trim(),
        category: selected.category ?? 'general',
        subject: selected.subject.trim(),
        body_html: selected.body_html,
        body_text: selected.body_text ?? null,
        variables: selected.variables ?? [],
        is_active: selected.is_active ?? true,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (selected.id) {
        ({ error } = await supabase.from('email_templates').update(payload).eq('id', selected.id));
      } else {
        ({ error } = await supabase.from('email_templates').insert({ ...payload, is_starter: false }));
      }
      if (error) throw error;

      toast('Template saved!', 'success');
      setMode('list');
      await loadTemplates();
    } catch (err) {
      reportError(err, { where: 'TemplatesPage.save' });
      toast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('email_templates').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      toast('Template archived', 'success');
      setDeleteId(null);
      await loadTemplates();
    } catch (err) {
      reportError(err, { where: 'TemplatesPage.delete' });
      toast('Failed to archive template', 'error');
    }
  };

  const insertVar = (varKey: string) => {
    setSelected(s => ({ ...s, body_html: (s.body_html ?? '') + varKey }));
  };

  /* ---- PREVIEW ---- */
  const previewHtml = (selected.body_html ?? '')
    .replace(/\{\{name\}\}/g, 'John Smith')
    .replace(/\{\{company\}\}/g, 'ABC Plumbing')
    .replace(/\{\{sender_name\}\}/g, 'Ranjit')
    .replace(/\{\{monthly_loss\}\}/g, '$4,200')
    .replace(/\{\{phone\}\}/g, '+1 (555) 000-0000')
    .replace(/\{\{industry\}\}/g, 'Plumbing');

  /* ---- LIST VIEW ---- */
  if (mode === 'list') {
    return (
      <div className="page-content">
        <PageHeader
          title="Email Templates"
          subtitle="Create and manage your marketing email templates"
          actions={
            <button className="btn btn--primary" onClick={handleNew}>
              <FiPlus style={{ marginRight: '0.4rem' }} /> New Template
            </button>
          }
        />

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="page-card skeleton" style={{ height: 160 }} />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="page-card" style={{ padding: '3rem', textAlign: 'center' }}>
            <FiFileText size={48} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }} />
            <h3>No templates yet</h3>
            <p className="text-muted">Create your first email template to get started.</p>
            <button className="btn btn--primary" style={{ marginTop: '1rem' }} onClick={handleNew}>
              <FiPlus style={{ marginRight: '0.4rem' }} /> Create Template
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {templates.map(tmpl => (
              <div key={tmpl.id} className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600,
                          background: `${categoryColor(tmpl.category)}1a`, color: categoryColor(tmpl.category),
                        }}
                      >
                        {categoryLabel(tmpl.category)}
                      </span>
                      {tmpl.is_starter && (
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                          Starter
                        </span>
                      )}
                    </div>
                    <h3 style={{ fontWeight: 600, fontSize: '1rem', margin: 0 }}>{tmpl.name}</h3>
                  </div>
                </div>
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>📧 {tmpl.subject}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {(tmpl.variables ?? []).slice(0, 4).map(v => (
                    <span key={v} style={{ padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.7rem', background: 'hsl(var(--secondary))', fontFamily: 'monospace' }}>{v}</span>
                  ))}
                </div>
                <p className="text-muted" style={{ fontSize: '0.75rem' }}>Updated {fmtDate(tmpl.updated_at)}</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button className="btn btn--secondary btn--sm" style={{ flex: 1 }} onClick={() => { setSelected({ ...tmpl }); setMode('preview'); }}>
                    <FiEye style={{ marginRight: '0.3rem' }} /> Preview
                  </button>
                  <button className="btn btn--secondary btn--sm" style={{ flex: 1 }} onClick={() => handleEdit(tmpl)}>
                    <FiEdit2 style={{ marginRight: '0.3rem' }} /> Edit
                  </button>
                  {!tmpl.is_starter && (
                    <button
                      className="btn btn--sm"
                      style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))', border: 'none' }}
                      onClick={() => setDeleteId(tmpl.id)}
                    >
                      <FiTrash2 />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirmation */}
        {deleteId && (
          <div className="modal-backdrop" onClick={() => setDeleteId(null)}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: '0.5rem' }}>Archive Template?</h3>
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>This will hide the template from the list. You can re-enable it from the database.</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn btn--secondary" onClick={() => setDeleteId(null)}>Cancel</button>
                <button className="btn btn--primary" style={{ background: 'hsl(var(--destructive))' }} onClick={() => handleDelete(deleteId)}>Archive</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---- PREVIEW VIEW ---- */
  if (mode === 'preview') {
    return (
      <div className="page-content">
        <PageHeader
          title={`Preview: ${selected.name}`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className={`btn btn--sm ${previewDevice === 'desktop' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setPreviewDevice('desktop')}>
                <FiMonitor />
              </button>
              <button className={`btn btn--sm ${previewDevice === 'mobile' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setPreviewDevice('mobile')}>
                <FiSmartphone />
              </button>
              <button className="btn btn--secondary" onClick={() => setMode('list')}>
                <FiX style={{ marginRight: '0.3rem' }} /> Close
              </button>
            </div>
          }
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: previewDevice === 'mobile' ? 375 : '100%',
            maxWidth: previewDevice === 'desktop' ? 680 : 375,
            border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)',
            overflow: 'hidden',
            boxShadow: 'var(--elevation-2)',
          }}>
            <div style={{ background: 'hsl(var(--secondary))', padding: '0.75rem 1rem', borderBottom: '1px solid hsl(var(--border))' }}>
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>Subject:</p>
              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{selected.subject}</p>
            </div>
            <div style={{ background: '#fff' }}>
              <iframe
                srcDoc={previewHtml}
                style={{ width: '100%', minHeight: 500, border: 'none' }}
                title="Email preview"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- EDIT VIEW ---- */
  return (
    <div className="page-content">
      <PageHeader
        title={selected.id ? `Edit: ${selected.name}` : 'New Template'}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn--secondary" onClick={() => { setMode('preview'); }}>
              <FiEye style={{ marginRight: '0.3rem' }} /> Preview
            </button>
            <button className="btn btn--secondary" onClick={() => setMode('list')}>
              <FiX style={{ marginRight: '0.3rem' }} /> Cancel
            </button>
            <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
              <FiSave style={{ marginRight: '0.3rem' }} /> {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem' }}>
        {/* Main editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Name + Category */}
          <div className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Template Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. ROI Follow-up #2"
                  value={selected.name ?? ''}
                  onChange={e => setSelected(s => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">Category</label>
                <select
                  className="form-input"
                  value={selected.category ?? 'general'}
                  onChange={e => setSelected(s => ({ ...s, category: e.target.value as any }))}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Email Subject *</label>
              <input
                className="form-input"
                placeholder="e.g. Your ROI Report, {{name}}"
                value={selected.subject ?? ''}
                onChange={e => setSelected(s => ({ ...s, subject: e.target.value }))}
              />
            </div>
          </div>

          {/* HTML Body Editor */}
          <div className="page-card" style={{ padding: '1.5rem' }}>
            <label className="form-label">Email Body (HTML) *</label>
            <textarea
              className="form-input"
              style={{
                fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6,
                height: 420, resize: 'vertical', marginTop: '0.5rem',
              }}
              value={selected.body_html ?? ''}
              onChange={e => setSelected(s => ({ ...s, body_html: e.target.value }))}
              spellCheck={false}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Variable Inserter */}
          <div className="page-card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiTag /> Variables
            </h4>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              Click to insert into the body. These will be replaced when sending.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {COMMON_VARS.map(v => (
                <button
                  key={v}
                  className="btn btn--secondary btn--sm"
                  style={{ justifyContent: 'flex-start', fontFamily: 'monospace', fontSize: '0.75rem' }}
                  onClick={() => insertVar(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Tracked Variables */}
          <div className="page-card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Tracked Variables</h4>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Comma-separated list of variables used in this template:
            </p>
            <input
              className="form-input"
              style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
              placeholder="{{name}}, {{company}}"
              value={(selected.variables ?? []).join(', ')}
              onChange={e => setSelected(s => ({
                ...s,
                variables: e.target.value.split(',').map(v => v.trim()).filter(Boolean),
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

