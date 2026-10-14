import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { adminApi } from '@/lib/adminApi';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useToast } from '@/components/common/Toast';
import { reportError } from '@/lib/sentry';
import type { EmailContact } from '@/types/domain';
import {
  FiRefreshCw, FiUpload, FiDownload,
  FiX, FiCheck, FiAlertCircle, FiExternalLink, FiTag,
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

// RFC-4180 compliant CSV parser that correctly handles quoted strings containing commas
const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

export const ContactsPage = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvTags, setCsvTags] = useState<string>('csv-import');
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

  // Extract all distinct tags from contacts
  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach(c => (c.tags ?? []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  const syncCalculatorLeads = async () => {
    setSyncing(true);
    try {
      const { data: leads, error } = await supabase
        .from('calculator_leads')
        .select('id, full_name, work_email, phone, business_name, industry, monthly_loss')
        .not('work_email', 'is', null);
      if (error) throw error;

      const seenEmails = new Set<string>();
      const upserts: any[] = [];
      for (const l of leads ?? []) {
        const cleanEmail = (l.work_email ?? '').trim().toLowerCase();
        if (!cleanEmail || seenEmails.has(cleanEmail)) continue;
        seenEmails.add(cleanEmail);
        upserts.push({
          full_name: l.full_name ?? 'Unknown',
          email: cleanEmail,
          phone: l.phone ?? null,
          company: l.business_name ?? null,
          lead_source: 'calculator_lead',
          source_id: l.id,
          industry: l.industry ?? null,
          monthly_loss: l.monthly_loss ?? null,
          status: 'active',
          engagement_state: 'warm',
          tags: ['calculator'],
        });
      }

      if (upserts.length === 0) { toast('No calculator leads with email found', 'error'); return; }

      try {
        await adminApi('/api/admin/contacts', 'POST', { contacts: upserts });
      } catch (apiErr) {
        const { error: upsertErr } = await supabase
          .from('email_contacts')
          .upsert(upserts, { onConflict: 'email,lead_source' });
        if (upsertErr) throw upsertErr;
      }

      toast(`Synced ${upserts.length} calculator leads!`, 'success');
      await loadContacts();
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.syncCalculator' });
      toast(err?.message || 'Failed to sync calculator leads', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const syncContactRequests = async () => {
    setSyncing(true);
    try {
      const { data: requests, error } = await supabase
        .from('contact_submissions')
        .select('*');
      if (error) throw error;

      const seenEmails = new Set<string>();
      const upserts: any[] = [];
      for (const r of (requests as any[]) ?? []) {
        const rawEmail = r.business_email || r.email || '';
        const cleanEmail = rawEmail.trim().toLowerCase();
        if (!cleanEmail || seenEmails.has(cleanEmail)) continue;
        seenEmails.add(cleanEmail);
        upserts.push({
          full_name: r.full_name || r.name || 'Unknown',
          email: cleanEmail,
          phone: r.business_phone || r.phone || null,
          company: r.business_name || r.company || null,
          lead_source: 'contact_request',
          source_id: r.id,
          status: 'active',
          engagement_state: 'warm',
          tags: ['contact-request'],
        });
      }

      if (upserts.length === 0) { toast('No contact requests with email found', 'error'); return; }

      try {
        await adminApi('/api/admin/contacts', 'POST', { contacts: upserts });
      } catch (apiErr) {
        const { error: upsertErr } = await supabase
          .from('email_contacts')
          .upsert(upserts, { onConflict: 'email,lead_source' });
        if (upsertErr) throw upsertErr;
      }

      toast(`Synced ${upserts.length} contact requests!`, 'success');
      await loadContacts();
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.syncContacts' });
      toast(err?.message || 'Failed to sync contact requests', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Suggest default tag from filename if recognized
    const filename = file.name.toLowerCase();
    const suggestedTags: string[] = ['csv-import'];
    if (filename.includes('lawn')) suggestedTags.push('lawn-care', 'sequence-a');
    if (filename.includes('hvac') || filename.includes('plumbing')) suggestedTags.push('hvac-plumbing', 'sequence-b');
    if (filename.includes('cedar') || filename.includes('rapids')) suggestedTags.push('cedar-rapids-ia');
    if (filename.includes('charlotte')) suggestedTags.push('charlotte-nc');
    setCsvTags(suggestedTags.join(', '));

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast('CSV file appears empty or missing rows', 'error');
        return;
      }
      const headers = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map(l => parseCsvLine(l));
      setCsvPreview({ headers, rows: rows.slice(0, 5) });

      // Smart auto-mapping
      const mapping: Record<string, string> = {};
      headers.forEach(h => {
        const lower = h.toLowerCase().trim();
        if (lower === 'email' || lower.includes('email')) mapping.email = h;
        else if (lower === 'first_name' || lower === 'firstname' || lower === 'first name') mapping.first_name = h;
        else if (lower === 'last_name' || lower === 'lastname' || lower === 'last name') mapping.last_name = h;
        else if (lower === 'name' || lower === 'full_name' || lower === 'fullname') mapping.full_name = h;
        else if (lower === 'company' || lower.includes('company') || lower.includes('business')) mapping.company = h;
        else if (lower === 'phone' || lower.includes('phone') || lower.includes('mobile')) mapping.phone = h;
        else if (lower === 'website' || lower.includes('website') || lower === 'url') mapping.website = h;
        else if (lower === 'city') mapping.city = h;
        else if (lower === 'state') mapping.state = h;
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
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map(l => parseCsvLine(l));

      const getVal = (row: string[], field: string) => {
        const mapped = csvMapping[field];
        if (!mapped) return null;
        const idx = headers.indexOf(mapped);
        return idx >= 0 ? (row[idx]?.trim() || null) : null;
      };

      const customTags = csvTags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      if (!customTags.includes('csv-import')) customTags.unshift('csv-import');

      const seenEmails = new Set<string>();
      const upserts: any[] = [];

      for (const row of rows) {
        const email = getVal(row, 'email')?.toLowerCase();
        if (!email || seenEmails.has(email)) continue;
        seenEmails.add(email);

        const firstName = getVal(row, 'first_name');
        const lastName = getVal(row, 'last_name');
        let fullName = getVal(row, 'full_name');
        if (!fullName && (firstName || lastName)) {
          fullName = [firstName, lastName].filter(Boolean).join(' ');
        }

        upserts.push({
          email,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName || 'Unknown',
          company: getVal(row, 'company'),
          phone: getVal(row, 'phone'),
          website: getVal(row, 'website'),
          city: getVal(row, 'city'),
          state: getVal(row, 'state'),
          lead_source: 'csv_import',
          status: 'active',
          engagement_state: 'warm',
          tags: customTags,
        });
      }

      if (upserts.length === 0) {
        toast('No valid contact rows found', 'error');
        return;
      }

      // Batch upsert in chunks of 100 to avoid payload size limits
      const CHUNK_SIZE = 100;
      for (let i = 0; i < upserts.length; i += CHUNK_SIZE) {
        const chunk = upserts.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('email_contacts')
          .upsert(chunk, { onConflict: 'email,lead_source' });
        if (error) throw error;
      }

      toast(`Successfully imported ${upserts.length} contacts!`, 'success');
      setShowImportModal(false);
      setCsvPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadContacts();
    } catch (err: any) {
      reportError(err, { where: 'ContactsPage.importCSV' });
      toast(err?.message || 'Failed to import contacts', 'error');
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['First Name', 'Last Name', 'Full Name', 'Email', 'Company', 'Phone', 'Website', 'City', 'State', 'Tags', 'Source', 'Status', 'Last Emailed'],
      ...contacts.map(c => [
        c.first_name ?? '',
        c.last_name ?? '',
        c.full_name,
        c.email,
        c.company ?? '',
        c.phone ?? '',
        c.website ?? '',
        c.city ?? '',
        c.state ?? '',
        (c.tags ?? []).join('; '),
        c.lead_source,
        c.status,
        fmtDate(c.last_emailed_at),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'contacts.csv'; a.click();
  };

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q) ||
      (c.state ?? '').toLowerCase().includes(q);
    const matchSource = !sourceFilter || c.lead_source === sourceFilter;
    const matchTag = !tagFilter || (c.tags ?? []).includes(tagFilter);
    return matchSearch && matchSource && matchTag;
  });

  const columns: ColumnDef<EmailContact>[] = [
    {
      header: 'Name', id: 'full_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 600, margin: 0 }}>
            {row.first_name && row.last_name
              ? `${row.first_name} ${row.last_name}`
              : row.full_name || 'Unknown'}
          </p>
          <p className="text-muted" style={{ fontSize: '0.75rem', margin: '2px 0 0' }}>{row.email}</p>
        </div>
      ),
    },
    {
      header: 'Company', accessorKey: 'company',
      cell: (row) => <span style={{ fontWeight: 500 }}>{row.company ?? <span className="text-muted">—</span>}</span>
    },
    {
      header: 'Phone', accessorKey: 'phone',
      cell: (row) => (
        <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          {row.phone ?? <span className="text-muted">—</span>}
        </span>
      )
    },
    {
      header: 'Website', id: 'website',
      cell: (row) => {
        if (!row.website) return <span className="text-muted">—</span>;
        const href = row.website.startsWith('http') ? row.website : `https://${row.website}`;
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'hsl(var(--primary))', fontSize: '0.75rem', textDecoration: 'none' }}
          >
            {row.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            <FiExternalLink size={11} />
          </a>
        );
      }
    },
    {
      header: 'Location', id: 'location',
      cell: (row) => {
        const loc = [row.city, row.state].filter(Boolean).join(', ');
        return loc ? (
          <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{loc}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      }
    },
    {
      header: 'Tags', id: 'tags',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', maxWidth: 220 }}>
          {(row.tags && row.tags.length > 0) ? (
            row.tags.map(t => (
              <span
                key={t}
                style={{
                  padding: '0.15rem 0.45rem',
                  borderRadius: 6,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  background: t.includes('lawn') ? 'hsl(142 71% 45% / 0.15)' :
                              t.includes('hvac') || t.includes('plumb') ? 'hsl(217 91% 60% / 0.15)' :
                              'hsl(var(--secondary))',
                  color: t.includes('lawn') ? 'hsl(142 71% 45%)' :
                         t.includes('hvac') || t.includes('plumb') ? 'hsl(217 91% 60%)' :
                         'inherit',
                }}
              >
                {t}
              </span>
            ))
          ) : (
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>—</span>
          )}
        </div>
      )
    },
    {
      header: 'Source', accessorKey: 'lead_source',
      cell: (row) => (
        <span style={{ padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, background: 'hsl(var(--secondary))' }}>
          {SOURCE_LABELS[row.lead_source] ?? row.lead_source}
        </span>
      ),
    },
    {
      header: 'Status', accessorKey: 'status',
      cell: (row) => (
        <span style={{
          padding: '0.2rem 0.5rem',
          borderRadius: 999,
          fontSize: '0.7rem',
          fontWeight: 600,
          background: row.status === 'active' ? 'hsl(142 71% 45% / 0.1)' : 'hsl(var(--destructive) / 0.1)',
          color: row.status === 'active' ? 'hsl(142 71% 45%)' : 'hsl(var(--destructive))',
        }}>
          {row.status}
        </span>
      ),
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

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 240 }}
          placeholder="Search by name, email, company, city, state..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-input" style={{ width: 180 }} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="">All Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="form-input" style={{ width: 180 }} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
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
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Import CSV — Map Columns & Add Tags</h3>
              <button className="icon-button" onClick={() => setShowImportModal(false)}><FiX /></button>
            </div>

            {/* Custom Tags Field */}
            <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'hsl(var(--secondary) / 0.5)', borderRadius: 8 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                <FiTag /> Tags for this import (comma-separated):
              </label>
              <input
                className="form-input"
                style={{ marginTop: '0.35rem' }}
                placeholder="e.g. lawn-care, charlotte-nc, sequence-a"
                value={csvTags}
                onChange={e => setCsvTags(e.target.value)}
              />
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.35rem', marginBottom: 0 }}>
                These tags will be applied to all leads in this CSV, making it easy to filter and enroll them into specific sequences.
              </p>
            </div>

            {/* Column Mapping Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { field: 'email', label: 'Email', required: true },
                { field: 'first_name', label: 'First Name' },
                { field: 'last_name', label: 'Last Name' },
                { field: 'company', label: 'Company Name' },
                { field: 'phone', label: 'Phone Number' },
                { field: 'website', label: 'Website' },
                { field: 'city', label: 'City' },
                { field: 'state', label: 'State' },
              ].map(({ field, label, required }) => (
                <div key={field}>
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>
                    {label} {required && <span style={{ color: 'hsl(var(--destructive))' }}>*</span>}
                  </label>
                  <select
                    className="form-input"
                    value={csvMapping[field] ?? ''}
                    onChange={e => setCsvMapping(m => ({ ...m, [field]: e.target.value }))}
                  >
                    <option value="">— Not mapped —</option>
                    {csvPreview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview Table */}
            <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Data Preview (first 5 rows):</p>
            <div style={{ overflowX: 'auto', marginBottom: '1rem', maxHeight: 180, border: '1px solid hsl(var(--border))', borderRadius: 6 }}>
              <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {csvPreview.headers.map(h => (
                      <th key={h} style={{ padding: '0.4rem 0.5rem', background: 'hsl(var(--secondary))', textAlign: 'left', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} style={{ padding: '0.35rem 0.5rem', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!csvMapping.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(38 92% 50%)', marginBottom: '1rem', fontSize: '0.85rem' }}>
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
