import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { KpiCard } from '@/components/common/KpiCard';
import { useRealtime } from '@/hooks/useRealtime';
import { formatUsd } from '@/types/domain';
import { exportToCsv } from '@/lib/csv';
import { reportError } from '@/lib/sentry';
import type { TenantBillingCharge } from '@/types/domain';
import { FiDownload } from 'react-icons/fi';

export const RevenuePage = () => {
  const navigate = useNavigate();
  const [charges, setCharges] = useState<TenantBillingCharge[]>([]);
  const [names, setNames] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchCharges = async () => {
    try {
      const { data, error } = await supabase
        .from('tenant_billing_charges')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = data || [];
      setCharges(rows);

      // Resolve company names for the tenants in the ledger (charges has no name).
      const tenantIds = [...new Set(rows.map((c) => c.tenant_id))];
      if (tenantIds.length) {
        const { data: tenants } = await supabase
          .from('tenants')
          .select('id, company_name')
          .in('id', tenantIds);
        const map = new Map<string, string | null>();
        (tenants || []).forEach((t: any) => map.set(t.id, t.company_name));
        setNames(map);
      }
    } catch (error) {
      reportError(error, { where: 'RevenuePage.fetchCharges' });
      console.error('Error fetching charges:', error);
    } finally {
      setLoading(false);
    }
  };

  const nameFor = (tenantId: string) => names.get(tenantId) || null;

  useEffect(() => {
    fetchCharges();
  }, []);

  useRealtime({ table: 'tenant_billing_charges', event: '*', onUpdate: fetchCharges });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 : null;

    return charges.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (kindFilter !== 'all' && c.kind !== kindFilter) return false;
      if (q) {
        const hay = `${nameFor(c.tenant_id) || ''} ${c.tenant_id} ${c.invoice_number || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fromTs || toTs) {
        const ts = new Date(c.created_at).getTime();
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts >= toTs) return false;
      }
      return true;
    });
  }, [charges, names, search, statusFilter, kindFilter, fromDate, toDate]);

  const metrics = useMemo(() => {
    let totalSucceeded = 0;
    let totalRefunded = 0;
    let totalPending = 0;

    filtered.forEach((c) => {
      if (c.status === 'succeeded') totalSucceeded += c.amount_cents;
      if (c.status === 'refunded') totalRefunded += c.refunded_amount_cents || c.amount_cents;
      if (c.status === 'pending') totalPending += c.amount_cents;
    });

    return { totalSucceeded, totalRefunded, totalPending };
  }, [filtered]);

  const handleExport = () => {
    exportToCsv('charges.csv', filtered, [
      { header: 'Date', value: (c) => new Date(c.created_at).toISOString() },
      { header: 'Business', value: (c) => nameFor(c.tenant_id) || '' },
      { header: 'Tenant ID', value: (c) => c.tenant_id },
      { header: 'Type', value: (c) => c.kind },
      { header: 'Amount', value: (c) => formatUsd(c.amount_cents) },
      { header: 'Status', value: (c) => c.status },
      { header: 'Refunded', value: (c) => formatUsd(c.refunded_amount_cents || 0) },
      { header: 'Invoice #', value: (c) => c.invoice_number ?? '' },
      { header: 'Error', value: (c) => c.error_message ?? '' },
    ]);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setKindFilter('all');
    setFromDate('');
    setToDate('');
  };

  const columns: ColumnDef<TenantBillingCharge>[] = [
    {
      header: 'Date',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }),
    },
    {
      header: 'Business',
      id: 'company_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{nameFor(row.tenant_id) || 'Unnamed Business'}</p>
          <p className="text-muted" style={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
            {row.tenant_id}
          </p>
        </div>
      ),
    },
    {
      header: 'Type',
      id: 'kind',
      cell: (row) => <span style={{ textTransform: 'capitalize' }}>{row.kind}</span>,
    },
    {
      header: 'Amount',
      id: 'amount_cents',
      cell: (row) => <span style={{ fontWeight: 600 }}>{formatUsd(row.amount_cents)}</span>,
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Invoice #',
      accessorKey: 'invoice_number',
      cell: (row) => row.invoice_number || '-',
    },
  ];

  const inputStyle = { maxWidth: '180px' } as const;

  return (
    <div className="page-content">
      <PageHeader
        title="Revenue Analytics"
        subtitle="Track platform MRR, cash flow, and charge ledgers"
        actions={
          <button className="btn btn--secondary" onClick={handleExport} disabled={loading || filtered.length === 0}>
            <FiDownload /> Export CSV
          </button>
        }
      />

      <div className="dashboard-kpi-row">
        <KpiCard
          label="Revenue Collected"
          value={formatUsd(metrics.totalSucceeded)}
          variant="success"
          loading={loading}
        />
        <KpiCard label="Pending Charges" value={formatUsd(metrics.totalPending)} variant="warning" loading={loading} />
        <KpiCard
          label="Total Refunded"
          value={formatUsd(metrics.totalRefunded)}
          variant={metrics.totalRefunded > 0 ? 'destructive' : 'default'}
          loading={loading}
        />
      </div>

      <div className="dashboard-section">
        <div
          className="page-card"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}
        >
          <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
            <label className="form-label">Search</label>
            <input
              className="form-input"
              placeholder="Business, tenant ID, or invoice #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" style={inputStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="succeeded">Succeeded</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input" style={inputStyle} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="subscription">Subscription</option>
              <option value="overage">Overage</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">From</label>
            <input type="date" className="form-input" style={inputStyle} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">To</label>
            <input type="date" className="form-input" style={inputStyle} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button className="btn btn--ghost" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <h3 className="dashboard-section__title" style={{ marginBottom: '1rem' }}>
          Charge Ledger
        </h3>
        {loading ? (
          <div className="page-card">
            <p>Loading ledger...</p>
          </div>
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            onRowClick={(row) => navigate(`/businesses/${row.tenant_id}`)}
            emptyMessage="No charges match the current filters."
          />
        )}
      </div>
    </div>
  );
};
