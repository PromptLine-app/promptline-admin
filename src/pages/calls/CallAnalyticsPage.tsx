import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { KpiCard } from '@/components/common/KpiCard';
import { useRealtime } from '@/hooks/useRealtime';
import { exportToCsv } from '@/lib/csv';
import type { Interaction } from '@/types/domain';
import { FiDownload } from 'react-icons/fi';

const FAILED_STATUSES = ['failed', 'no_answer', 'error', 'dropped'];

export const CallAnalyticsPage = () => {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  // tenant_id -> business name, so the table can show friendly names instead of UUIDs.
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchCalls = async () => {
    try {
      const { data, error } = await supabase
        .from('interactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000); // Limit to recent 1000 calls for performance

      if (error) throw error;
      setCalls(data || []);
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  // Load the tenant_id -> company_name map once (small set; rarely changes).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('tenants').select('id, company_name');
      if (data) {
        setTenantNames(Object.fromEntries(data.map((t) => [t.id, t.company_name || ''])));
      }
    })();
  }, []);

  useRealtime({ table: 'interactions', event: '*', onUpdate: fetchCalls });

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    calls.forEach((c) => c.status && set.add(c.status));
    return Array.from(set).sort();
  }, [calls]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    // include the whole "to" day
    const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 : null;

    return calls.filter((c) => {
      if (statusFilter === 'failed' && !FAILED_STATUSES.includes(c.status || '')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'failed' && c.status !== statusFilter) return false;
      if (directionFilter !== 'all' && c.direction !== directionFilter) return false;
      if (q) {
        const name = tenantNames[c.tenant_id] || '';
        const hay = `${name} ${c.tenant_id} ${c.eleven_conv_id || ''} ${c.summary || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fromTs || toTs) {
        const ts = new Date(c.created_at).getTime();
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts >= toTs) return false;
      }
      return true;
    });
  }, [calls, search, statusFilter, directionFilter, fromDate, toDate, tenantNames]);

  const metrics = useMemo(() => {
    let completedCount = 0;
    let totalDuration = 0;
    let failedCount = 0;

    filtered.forEach((c) => {
      if (c.status === 'completed') completedCount++;
      if (FAILED_STATUSES.includes(c.status || '')) failedCount++;
      if (c.duration_sec) totalDuration += c.duration_sec;
    });

    const avgDuration = filtered.length > 0 ? Math.round(totalDuration / filtered.length) : 0;
    const avgMins = Math.floor(avgDuration / 60);
    const avgSecs = avgDuration % 60;

    return {
      totalCount: filtered.length,
      completedCount,
      failedCount,
      avgDurationStr: `${avgMins}m ${avgSecs}s`,
    };
  }, [filtered]);

  const handleExport = () => {
    exportToCsv('calls.csv', filtered, [
      { header: 'Date', value: (c) => new Date(c.created_at).toISOString() },
      { header: 'Business', value: (c) => tenantNames[c.tenant_id] || '' },
      { header: 'Tenant ID', value: (c) => c.tenant_id },
      { header: 'Direction', value: (c) => c.direction ?? '' },
      { header: 'Status', value: (c) => c.status ?? '' },
      { header: 'Duration (sec)', value: (c) => c.duration_sec ?? '' },
      { header: 'Summary', value: (c) => c.summary ?? '' },
      { header: 'ElevenLabs ID', value: (c) => c.eleven_conv_id ?? '' },
    ]);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDirectionFilter('all');
    setFromDate('');
    setToDate('');
  };

  const columns: ColumnDef<Interaction>[] = [
    {
      header: 'Date',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      header: 'Business',
      accessorKey: 'tenant_id',
      cell: (row) => {
        const name = tenantNames[row.tenant_id];
        return name ? (
          <span title={row.tenant_id}>{name}</span>
        ) : (
          <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }} title="No matching business">
            {row.tenant_id}
          </span>
        );
      },
    },
    {
      header: 'Direction',
      id: 'direction',
      cell: (row) => <span style={{ textTransform: 'capitalize' }}>{row.direction || 'Unknown'}</span>,
    },
    {
      header: 'Duration',
      id: 'duration_sec',
      cell: (row) => {
        if (!row.duration_sec) return '-';
        const m = Math.floor(row.duration_sec / 60);
        const s = row.duration_sec % 60;
        return `${m}m ${s}s`;
      },
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => <StatusBadge status={row.status || 'unknown'} />,
    },
    {
      header: 'ElevenLabs ID',
      accessorKey: 'eleven_conv_id',
      cell: (row) =>
        row.eleven_conv_id ? (
          <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.eleven_conv_id}</span>
        ) : (
          '-'
        ),
    },
  ];

  const inputStyle = { maxWidth: '180px' } as const;

  return (
    <div className="page-content">
      <PageHeader
        title="Call Analytics"
        subtitle="Platform-wide call volumes and status tracking (Recent 1000 calls)"
        actions={
          <button className="btn btn--secondary" onClick={handleExport} disabled={loading || filtered.length === 0}>
            <FiDownload /> Export CSV
          </button>
        }
      />

      <div className="dashboard-kpi-row">
        <KpiCard label="Total Calls" value={metrics.totalCount.toLocaleString()} loading={loading} />
        <KpiCard
          label="Completed Calls"
          value={metrics.completedCount.toLocaleString()}
          variant="success"
          loading={loading}
        />
        <KpiCard
          label="Failed / No-Answer"
          value={metrics.failedCount.toLocaleString()}
          variant={metrics.failedCount > 0 ? 'destructive' : 'default'}
          loading={loading}
        />
        <KpiCard label="Avg Duration" value={metrics.avgDurationStr} variant="primary" loading={loading} />
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
              placeholder="Business, conversation ID, summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" style={inputStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="failed">Failed / No-answer</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Direction</label>
            <select
              className="form-input"
              style={inputStyle}
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
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
          Call History
        </h3>
        {loading ? (
          <div className="page-card">
            <p>Loading calls...</p>
          </div>
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            onRowClick={(row) => navigate(`/calls/${row.id}`)}
            emptyMessage="No calls match the current filters."
          />
        )}
      </div>
    </div>
  );
};
