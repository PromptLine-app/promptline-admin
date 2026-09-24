import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import type { EmailContact } from '@/types/domain';
import {
  FiRefreshCw, FiUpload, FiDownload,
  FiX, FiCheck, FiAlertCircle,
} from 'react-icons/fi';

const SOURCE_LABELS: Record<string, string> = {
  calculator_lead: 'Calculator Lead',
  contact_request: 'Contact Request',
  user_followup: 'User Follow-up',
  csv_import: 'CSV Import',
  manual: 'Manual',
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const ContactsPage = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [showImportModal, setShowImportModal] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_contacts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setContacts((data ?? []) as EmailContact[]);
    } catch (err) {
      reportError(err, { where: 'ContactsPage.load' });
      toast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const syncCalculatorLeads = async () => {
    setSyncing(true);
    try {
      const { data: leads, error } = await supabase
        .from('calculator_leads')
        .select('id, full_name, work_email, phone, business_name, industry, monthly_loss')
        .not('work_email', 'is', null);
      if (error) throw error;

      const upserts = (leads ?? []).map((l: any) => ({
        full_name: l.full_name ?? 'Unknown',
        email: l.work_email,
        phone: l.phone ?? null,
        company: l.business_name ?? null,
        lead_source: 'calculator_lead',
        source_id: l.id,
        industry: l.industry ?? null,
        monthly_loss: l.monthly_loss ?? null,
        status: 'active',
        tags: ['calculator'],
      }));

      if (upserts.length === 0) { toast('No calculator leads with email found', 'error'); return; }

      const { error: upsertErr } = await supabase
        .from('email_contacts')
        .upsert(upserts, { onConflict: 'email,lead_source' });
      if (upsertErr) throw upsertErr;

      toast(`Synced ${upserts.length} calculator leads!`, 'success');
      await loadContacts();
    } catch (err) {
      reportError(err, { where: 'ContactsPage.syncCalculator' });
      toast('Failed to sync calculator leads', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const syncContactRequests = async () => {
    setSyncing(true);
    try {
      const { data: requests, error } = await supabase
        .from('contact_submissions')
        .select('id, name, email, phone, company')
        .not('email', 'is', null);
      if (error) throw error;

      const upserts = (requests ?? []).map((r: any) => ({
        full_name: r.name ?? 'Unknown',
        email: r.email,
        phone: r.phone ?? null,
        company: r.company ?? null,
        lead_source: 'contact_request',
        source_id: r.id,
        status: 'active',
        tags: ['contact-request'],
      }));

      if (upserts.length === 0) { toast('No contact requests with email found', 'error'); return; }

      const { error: upsertErr } = await supabase
        .from('email_contacts')
        .upsert(upserts, { onConflict: 'email,lead_source' });
      if (upsertErr) throw upsertErr;

      toast(`Synced ${upserts.length} contact requests!`, 'success');
      await loadContacts();
    } catch (err) {
      reportError(err, { where: 'ContactsPage.syncContacts' });
      toast('Failed to sync contact requests', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map(l => l.split(',').map(v => v.trim().replace(/"/g, '')));
      setCsvPreview({ headers, rows: rows.slice(0, 5) });
      const mapping: Record<string, string> = {};
      headers.forEach(h => {
        const lower = h.toLowerCase();
        if (lower.includes('name')) mapping.full_name = h;
        if (lower.includes('email')) mapping.email = h;
        if (lower.includes('phone') || lower.includes('mobile')) mapping.phone = h;
        if (lower.includes('company') || lower.includes('business')) mapping.company = h;
      });
      setCsvMapping(mapping);
      setShowImportModal(true);
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    if (!csvPreview || !csvMapping.email) { toast('Please map the Email column', 'error'); return; }
    setImporting(true);
    try {
      const file = fileInputRef.current?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map(l => l.split(',').map(v => v.trim().replace(/"/g, '')));
      const getVal = (row: string[], field: string) => {
        const mapped = csvMapping[field];
        if (!mapped) return null;
        const idx = headers.indexOf(mapped);
        return idx >= 0 ? row[idx] || null : null;
      };
      const upserts = rows
        .filter(row => getVal(row, 'email'))
        .map(row => ({
          full_name: getVal(row, 'full_name') ?? 'Unknown',
          email: getVal(row, 'email')!,
          phone: getVal(row, 'phone'),
          company: getVal(row, 'company'),
          lead_source: 'csv_import',
          status: 'active',
          tags: ['csv-import'],
        }));
      const { error } = await supabase.from('email_contacts').upsert(upserts, { onConflict: 'email,lead_source' });
      if (error) throw error;
      toast(`Imported ${upserts.length} contacts!`, 'success');
      setShowImportModal(false);
      setCsvPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadContacts();
    } catch (err) {
      reportError(err, { where: 'ContactsPage.importCSV' });
      toast('Failed to import contacts', 'error');
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Company', 'Source', 'Status', 'Last Emailed'],
      ...contacts.map(c => [c.full_name, c.email, c.phone ?? '', c.company ?? '', c.lead_source, c.status, fmtDate(c.last_emailed_at)]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'contacts.csv'; a.click();
  };

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q);
    const matchSource = !sourceFilter || c.lead_source === sourceFilter;
    return matchSearch && matchSource;
  });

  const columns: ColumnDef<EmailContact>[] = [
    {
      header: 'Name', id: 'full_name',
      cell: (row) => (<div><p style={{ fontWeight: 500 }}>{row.full_name}</p><p className="text-muted" style={{ fontSize: '0.75rem' }}>{row.email}</p></div>),
    },
    { header: 'Company', accessorKey: 'company', cell: (row) => row.company ?? <span className="text-muted">—</span> },
    { header: 'Phone', accessorKey: 'phone', cell: (row) => row.phone ?? <span className="text-muted">—</span> },
    {
      header: 'Source', accessorKey: 'lead_source',
      cell: (row) => (<span style={{ padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, background: 'hsl(var(--secondary))' }}>{SOURCE_LABELS[row.lead_source] ?? row.lead_source}</span>),
    },
    {
      header: 'Status', accessorKey: 'status',
      cell: (row) => (<span style={{ padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, background: row.status === 'active' ? 'hsl(142 71% 45% / 0.1)' : 'hsl(var(--destructive) / 0.1)', color: row.status === 'active' ? 'hsl(142 71% 45%)' : 'hsl(var(--destructive))' }}>{row.status}</span>),
    },
    {
      header: 'Last Emailed', id: 'last_emailed_at',
      cell: (row) => <span className="text-muted" style={{ fontSize: '0.8rem' }}>{fmtDate(row.last_emailed_at)}</span>,
    },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length.toLocaleString()} total contacts`}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn--secondary btn--sm" onClick={syncCalculatorLeads} disabled={syncing}><FiRefreshCw style={{ marginRight: '0.3rem' }} /> Sync Calculator Leads</button>
            <button className="btn btn--secondary btn--sm" onClick={syncContactRequests} disabled={syncing}><FiRefreshCw style={{ marginRight: '0.3rem' }} /> Sync Contact Requests</button>
            <button className="btn btn--secondary btn--sm" onClick={() => fileInputRef.current?.click()}><FiUpload style={{ marginRight: '0.3rem' }} /> Import CSV</button>
            <button className="btn btn--secondary btn--sm" onClick={exportCsv} disabled={contacts.length === 0}><FiDownload style={{ marginRight: '0.3rem' }} /> Export</button>
            <input ref={fileInputRef} type="file" accept=".csv,.tsv" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
        }
      />

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Search by name, email, or company..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-input" style={{ width: 200 }} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="page-card">
        <DataTable
          data={filtered as unknown as Record<string, unknown>[]}
          columns={columns as unknown as ColumnDef<Record<string, unknown>>[]}
          emptyMessage={loading ? 'Loading...' : 'No contacts found.'}
          defaultSort={{ key: 'created_at', desc: true }}
        />
      </div>

      {showImportModal && csvPreview && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Import CSV — Map Columns</h3>
              <button className="icon-button" onClick={() => setShowImportModal(false)}><FiX /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              {['full_name', 'email', 'phone', 'company'].map(field => (
                <div key={field}>
                  <label className="form-label" style={{ textTransform: 'capitalize' }}>{field.replace('_', ' ')} {field === 'email' && '*'}</label>
                  <select className="form-input" value={csvMapping[field] ?? ''} onChange={e => setCsvMapping(m => ({ ...m, [field]: e.target.value }))}>
                    <option value="">— Not mapped —</option>
                    {csvPreview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead><tr>{csvPreview.headers.map(h => <th key={h} style={{ padding: '0.4rem 0.6rem', background: 'hsl(var(--secondary))', textAlign: 'left', border: '1px solid hsl(var(--border))' }}>{h}</th>)}</tr></thead>
                <tbody>{csvPreview.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: '0.4rem 0.6rem', border: '1px solid hsl(var(--border))' }}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {!csvMapping.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(38 92% 50%)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                <FiAlertCircle /> Please map the Email column to proceed
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn--secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleImportConfirm} disabled={!csvMapping.email || importing}>
                <FiCheck style={{ marginRight: '0.3rem' }} />{importing ? 'Importing…' : 'Import Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
