import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/Toast';
import { AdminOnly } from '@/auth/AdminOnly';
import { FiSend } from 'react-icons/fi';
import {
  fetchPipeline,
  sendEmail,
  updateFollowup,
  STAGE_LABELS,
  type PipelineEntry,
  type PipelineStage,
  type LeadStatus,
  type TemplateChoice,
} from '@/lib/leadsApi';

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'engaged', 'converted', 'dismissed'];
const STAGE_ORDER: PipelineStage[] = ['lead', 'stalled', 'no_twilio', 'no_calls', 'at_risk', 'churned'];

const errMsg = (e: unknown): string | null => (e instanceof Error ? e.message : null);

const daysSince = (iso: string | null): number => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
};

const rowKey = (e: PipelineEntry) => `${e.subject_type}:${e.subject_id}`;

export const LeadPipelinePage = () => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [templates, setTemplates] = useState<TemplateChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<PipelineStage | 'all'>('all');

  // Per-row UI state, keyed by `${subject_type}:${subject_id}`.
  const [selectedTemplate, setSelectedTemplate] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = async () => {
    try {
      const { entries, templates } = await fetchPipeline();
      setEntries(entries);
      setTemplates(templates);
      setNoteDrafts(Object.fromEntries(entries.map((e) => [rowKey(e), e.notes || ''])));
    } catch (e) {
      console.error('Error loading pipeline:', e);
      toast(errMsg(e) || 'Failed to load pipeline.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Mount-time fetch; load() owns its own state updates (matches other pages).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    for (const s of STAGE_ORDER) counts[s] = 0;
    for (const e of entries) counts[e.stage] = (counts[e.stage] || 0) + 1;
    return counts;
  }, [entries]);

  const visible = useMemo(
    () => (activeStage === 'all' ? entries : entries.filter((e) => e.stage === activeStage)),
    [entries, activeStage],
  );

  const setRowBusy = (key: string, value: boolean) =>
    setBusy((prev) => ({ ...prev, [key]: value }));

  const handleSend = async (entry: PipelineEntry) => {
    const key = rowKey(entry);
    const templateKey = selectedTemplate[key] || templates[0]?.key;
    if (!templateKey) return toast('No email template available.', 'error');
    if (!entry.email) return toast('This prospect has no email on file.', 'error');
    setRowBusy(key, true);
    try {
      await sendEmail(entry.subject_type, entry.subject_id, templateKey);
      toast(`Email sent to ${entry.email}.`);
      await load();
    } catch (e) {
      console.error('Error sending email:', e);
      toast(errMsg(e) || 'Failed to send email.', 'error');
    } finally {
      setRowBusy(key, false);
    }
  };

  const handleStatusChange = async (entry: PipelineEntry, status: LeadStatus) => {
    const key = rowKey(entry);
    setRowBusy(key, true);
    try {
      await updateFollowup(entry.subject_type, entry.subject_id, { status });
      setEntries((prev) =>
        prev.map((e) => (rowKey(e) === key ? { ...e, status } : e)),
      );
    } catch (e) {
      console.error('Error updating status:', e);
      toast(errMsg(e) || 'Failed to update status.', 'error');
    } finally {
      setRowBusy(key, false);
    }
  };

  const handleNotesSave = async (entry: PipelineEntry) => {
    const key = rowKey(entry);
    const notes = noteDrafts[key] ?? '';
    if (notes === (entry.notes || '')) return; // unchanged
    try {
      await updateFollowup(entry.subject_type, entry.subject_id, { notes });
      setEntries((prev) => prev.map((e) => (rowKey(e) === key ? { ...e, notes } : e)));
      toast('Note saved.');
    } catch (e) {
      console.error('Error saving note:', e);
      toast(errMsg(e) || 'Failed to save note.', 'error');
    }
  };

  const columns: ColumnDef<PipelineEntry>[] = [
    {
      header: 'Stage',
      id: 'stage',
      cell: (row) => <StatusBadge status={row.stage} label={STAGE_LABELS[row.stage]} />,
    },
    {
      header: 'Prospect',
      id: 'name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 500 }}>{row.name || 'Unnamed'}</p>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            {row.email ? (
              <a href={`mailto:${row.email}`} onClick={(e) => e.stopPropagation()}>
                {row.email}
              </a>
            ) : (
              'No email'
            )}
          </p>
        </div>
      ),
    },
    {
      header: 'Since',
      id: 'since',
      cell: (row) => (
        <div>
          <p>{row.since ? new Date(row.since).toLocaleDateString() : '—'}</p>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            {daysSince(row.since)}d
            {row.last_activity_at ? ` · last call ${daysSince(row.last_activity_at)}d ago` : ''}
          </p>
        </div>
      ),
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Attempts',
      id: 'attempts',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 500 }}>{row.attempts}</p>
          {row.last_contacted_at && (
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              last {new Date(row.last_contacted_at).toLocaleDateString()}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Notes',
      id: 'notes',
      sortable: false,
      cell: (row) => (
        <AdminOnly fallback={<span className="text-muted">{row.notes || '—'}</span>}>
          <input
            type="text"
            className="form-input"
            style={{ minWidth: '150px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
            value={noteDrafts[rowKey(row)] ?? ''}
            placeholder="Add a note…"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              setNoteDrafts((prev) => ({ ...prev, [rowKey(row)]: e.target.value }))
            }
            onBlur={() => handleNotesSave(row)}
          />
        </AdminOnly>
      ),
    },
    {
      header: 'Follow Up',
      id: 'actions',
      sortable: false,
      cell: (row) => {
        const key = rowKey(row);
        return (
          <AdminOnly fallback={<span className="text-muted">—</span>}>
            <div
              style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}
              onClick={(e) => e.stopPropagation()}
            >
              <select
                className="form-input"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', minHeight: '32px' }}
                value={selectedTemplate[key] || templates[0]?.key || ''}
                onChange={(e) =>
                  setSelectedTemplate((prev) => ({ ...prev, [key]: e.target.value }))
                }
              >
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn--primary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.85rem', minHeight: '32px' }}
                disabled={busy[key] || !row.email || templates.length === 0}
                onClick={() => handleSend(row)}
              >
                <FiSend /> {busy[key] ? 'Sending…' : 'Send'}
              </button>
              <select
                className="form-input"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', minHeight: '32px', width: '110px' }}
                value={row.status}
                onChange={(e) => handleStatusChange(row, e.target.value as LeadStatus)}
                disabled={busy[key]}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} style={{ textTransform: 'capitalize' }}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </AdminOnly>
        );
      },
    },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Lead Pipeline"
        subtitle="Every prospect at every drop-off stage — re-engage and track follow-ups"
      />

      <div className="dashboard-section">
        {/* Stage filter tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {(['all', ...STAGE_ORDER] as const).map((stage) => (
            <button
              key={stage}
              className={`btn ${activeStage === stage ? 'btn--primary' : 'btn--ghost'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => setActiveStage(stage)}
            >
              {stage === 'all' ? 'All' : STAGE_LABELS[stage]} ({stageCounts[stage] || 0})
            </button>
          ))}
        </div>

        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">
              {activeStage === 'all' ? 'All prospects' : STAGE_LABELS[activeStage]}
            </h3>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              {visible.length} {visible.length === 1 ? 'prospect' : 'prospects'}
            </span>
          </div>
          {loading ? (
            <p className="text-muted" style={{ marginTop: '1rem' }}>
              Loading…
            </p>
          ) : (
            <DataTable
              data={visible}
              columns={columns}
              defaultSort={{ key: 'since', desc: true }}
              emptyMessage="No prospects in this stage."
            />
          )}
        </div>
      </div>
    </div>
  );
};
