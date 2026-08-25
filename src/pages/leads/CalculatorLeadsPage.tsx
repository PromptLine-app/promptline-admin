import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import {
  FiRefreshCw,
  FiDownload,
  FiMail,
  FiEdit2,
  FiX,
  FiTrendingUp,
  FiUsers,
  FiCalendar,
  FiDollarSign,
} from 'react-icons/fi';

/* ── Types ───────────────────────────────────────────────────────────── */

type CalculatorLead = {
  id: string;
  full_name: string;
  business_name: string;
  work_email: string;
  phone: string | null;
  industry: string | null;
  missed_calls_per_week: number;
  avg_job_value: number;
  conversion_rate: number;
  monthly_loss: number;
  annual_loss: number;
  recoverable_jobs: number;
  roi_multiplier: number;
  payback_days: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'converted', 'lost'];

const statusVariantMap: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  new: 'info',
  contacted: 'warning',
  qualified: 'warning',
  converted: 'success',
  lost: 'danger',
};

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/* ── Component ───────────────────────────────────────────────────────── */

export const CalculatorLeadsPage = () => {
  const { toast } = useToast();
  const [leads, setLeads] = useState<CalculatorLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<CalculatorLead | null>(null);

  // Detail modal state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('new');
  const [saving, setSaving] = useState(false);

  /* ── Fetch ─────────────────────────────────────────────────────── */

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('calculator_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads((data as CalculatorLead[]) || []);
    } catch (err) {
      console.error('Error fetching calculator leads:', err);
      reportError(err, { where: 'CalculatorLeadsPage.fetchLeads' });
      toast({ type: 'error', message: 'Failed to load calculator leads.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  /* ── Summary stats ─────────────────────────────────────────────── */

  const totalLeads = leads.length;
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const thisWeekLeads = leads.filter((l) => l.created_at >= oneWeekAgo).length;
  const avgMonthlyLoss =
    totalLeads > 0
      ? Math.round(leads.reduce((s, l) => s + l.monthly_loss, 0) / totalLeads)
      : 0;
  const convertedCount = leads.filter((l) => l.status === 'converted').length;
  const conversionRate =
    totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 100) : 0;

  /* ── Detail modal handlers ─────────────────────────────────────── */

  const openDetail = (lead: CalculatorLead) => {
    setSelectedLead(lead);
    setEditNotes(lead.notes || '');
    setEditStatus(lead.status);
    setIsDetailOpen(true);
  };

  const closeDetail = () => {
    setIsDetailOpen(false);
    setSelectedLead(null);
  };

  const handleSaveDetail = async () => {
    if (!selectedLead) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('calculator_leads')
        .update({
          status: editStatus,
          notes: editNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedLead.id);

      if (error) throw error;

      toast({ type: 'success', message: 'Lead updated.' });
      setLeads((prev) =>
        prev.map((l) =>
          l.id === selectedLead.id
            ? { ...l, status: editStatus, notes: editNotes.trim() || null, updated_at: new Date().toISOString() }
            : l
        )
      );
      closeDetail();
    } catch (err) {
      reportError(err, { where: 'CalculatorLeadsPage.handleSaveDetail' });
      toast({ type: 'error', message: 'Failed to update lead.' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Quick status update ───────────────────────────────────────── */

  const handleQuickStatus = async (lead: CalculatorLead, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('calculator_leads')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      if (error) throw error;

      setLeads((prev) =>
        prev.map((l) =>
          l.id === lead.id ? { ...l, status: newStatus, updated_at: new Date().toISOString() } : l
        )
      );
    } catch (err) {
      reportError(err, { where: 'CalculatorLeadsPage.handleQuickStatus' });
      toast({ type: 'error', message: 'Failed to update status.' });
    }
  };

  /* ── CSV export ────────────────────────────────────────────────── */

  const handleExport = () => {
    const headers = [
      'Name',
      'Business',
      'Email',
      'Phone',
      'Industry',
      'Missed Calls/Week',
      'Avg Job Value',
      'Conversion Rate',
      'Monthly Loss',
      'Annual Loss',
      'ROI Multiplier',
      'Payback Days',
      'Status',
      'Notes',
      'Date',
    ];

    const rows = leads.map((l) => [
      l.full_name,
      l.business_name,
      l.work_email,
      l.phone || '',
      l.industry || '',
      l.missed_calls_per_week,
      l.avg_job_value,
      l.conversion_rate,
      l.monthly_loss,
      l.annual_loss,
      l.roi_multiplier,
      l.payback_days,
      l.status,
      (l.notes || '').replace(/"/g, '""'),
      new Date(l.created_at).toISOString(),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calculator-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Table columns ─────────────────────────────────────────────── */

  const columns: ColumnDef<CalculatorLead>[] = [
    {
      header: 'Name',
      accessorKey: 'full_name',
      sortable: true,
      cell: (row) => <strong>{row.full_name}</strong>,
    },
    {
      header: 'Business',
      accessorKey: 'business_name',
      sortable: true,
    },
    {
      header: 'Email',
      accessorKey: 'work_email',
      sortable: true,
      cell: (row) => (
        <a href={`mailto:${row.work_email}`} style={{ color: 'var(--accent-blue)' }}>
          {row.work_email}
        </a>
      ),
    },
    {
      header: 'Industry',
      accessorKey: 'industry',
      sortable: true,
      cell: (row) => row.industry || '—',
    },
    {
      header: 'Monthly Loss',
      accessorKey: 'monthly_loss',
      sortable: true,
      cell: (row) => <span style={{ color: '#ef4444', fontWeight: 600 }}>{fmt(row.monthly_loss)}</span>,
    },
    {
      header: 'ROI',
      accessorKey: 'roi_multiplier',
      sortable: true,
      cell: (row) => (
        <span style={{ color: '#34d399', fontWeight: 700 }}>{row.roi_multiplier}x</span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (row) => (
        <select
          value={row.status}
          onChange={(e) => handleQuickStatus(row, e.target.value)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '0.8rem',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      ),
    },
    {
      header: 'Date',
      accessorKey: 'created_at',
      sortable: true,
      cell: (row) => (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {fmtDate(row.created_at)}
        </span>
      ),
    },
  ];

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="page-card">
      <PageHeader
        title="Calculator Leads"
        subtitle="Leads captured from the ROI calculator on promptline.app"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn--ghost" onClick={handleExport} title="Export CSV">
              <FiDownload /> Export
            </button>
            <button className="btn btn--ghost" onClick={fetchLeads} title="Refresh">
              <FiRefreshCw />
            </button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
            <FiUsers />
          </div>
          <div className="stat-card__body">
            <span className="stat-card__label">Total Leads</span>
            <span className="stat-card__value">{totalLeads}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
            <FiCalendar />
          </div>
          <div className="stat-card__body">
            <span className="stat-card__label">This Week</span>
            <span className="stat-card__value">{thisWeekLeads}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            <FiDollarSign />
          </div>
          <div className="stat-card__body">
            <span className="stat-card__label">Avg Monthly Loss</span>
            <span className="stat-card__value">{fmt(avgMonthlyLoss)}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
            <FiTrendingUp />
          </div>
          <div className="stat-card__body">
            <span className="stat-card__label">Conversion Rate</span>
            <span className="stat-card__value">{conversionRate}%</span>
          </div>
        </div>
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="empty-state">
          <p>Loading leads…</p>
        </div>
      ) : (
        <DataTable
          data={leads}
          columns={columns}
          onRowClick={openDetail}
          defaultSort={{ key: 'created_at', desc: true }}
          emptyMessage="No calculator leads yet. Leads will appear here once visitors use the ROI calculator."
        />
      )}

      {/* Detail Modal */}
      {isDetailOpen && selectedLead && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-card__header">
              <h3>{selectedLead.full_name}</h3>
              <button className="btn btn--icon" onClick={closeDetail}>
                <FiX />
              </button>
            </div>

            <div className="modal-card__body">
              {/* Contact Info */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  Contact Info
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div><strong>Business:</strong> {selectedLead.business_name}</div>
                  <div>
                    <strong>Email:</strong>{' '}
                    <a href={`mailto:${selectedLead.work_email}`} style={{ color: 'var(--accent-blue)' }}>
                      {selectedLead.work_email}
                    </a>
                  </div>
                  <div><strong>Phone:</strong> {selectedLead.phone || '—'}</div>
                  <div><strong>Industry:</strong> {selectedLead.industry || '—'}</div>
                </div>
              </div>

              {/* Calculator Inputs */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  Calculator Inputs
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div><strong>Missed calls/wk:</strong> {selectedLead.missed_calls_per_week}</div>
                  <div><strong>Avg job value:</strong> {fmt(selectedLead.avg_job_value)}</div>
                  <div><strong>Conversion rate:</strong> {selectedLead.conversion_rate}%</div>
                </div>
              </div>

              {/* Calculated Results */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  Calculated Results
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
                      {fmt(selectedLead.monthly_loss)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>monthly loss</div>
                  </div>
                  <div
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
                      {fmt(selectedLead.annual_loss)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>annual loss</div>
                  </div>
                  <div
                    style={{
                      background: 'rgba(52,211,153,0.08)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399' }}>
                      {selectedLead.roi_multiplier}x
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ROI</div>
                  </div>
                  <div
                    style={{
                      background: 'rgba(52,211,153,0.08)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399' }}>
                      {selectedLead.payback_days} days
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>payback</div>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="form-input"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="form-input"
                  rows={3}
                  placeholder="Add follow-up notes…"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn--ghost" onClick={closeDetail}>
                  Cancel
                </button>
                <button className="btn btn--primary" onClick={handleSaveDetail} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

            <div className="modal-card__footer" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Created: {fmtDate(selectedLead.created_at)}
              {selectedLead.updated_at !== selectedLead.created_at && (
                <> · Updated: {fmtDate(selectedLead.updated_at)}</>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
