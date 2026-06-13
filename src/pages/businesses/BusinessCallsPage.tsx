import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { BusinessSubLayout } from '@/components/businesses/BusinessSubLayout';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { KpiCard } from '@/components/common/KpiCard';
import { useRealtime } from '@/hooks/useRealtime';
import { exportToCsv } from '@/lib/csv';
import type { Interaction } from '@/types/domain';
import { FiDownload } from 'react-icons/fi';

const FAILED_STATUSES = ['failed', 'no_answer', 'error', 'dropped'];

/** Per-business call history + KPIs. Scoped to the tenant via the route param. */
export const BusinessCallsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [calls, setCalls] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchCalls = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false })
        .limit(1000);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useRealtime({ table: 'interactions', event: '*', onUpdate: fetchCalls });

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    calls.forEach((c) => c.status && set.add(c.status));
    return Array.from(set).sort();
  }, [calls]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 : null;

    return calls.filter((c) => {
      if (statusFilter === 'failed' && !FAILED_STATUSES.includes(c.status || '')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'failed' && c.status !== statusFilter) return false;
      if (directionFilter !== 'all' && c.direction !== directionFilter) return false;
      if (q) {
        const hay = `${c.eleven_conv_id || ''} ${c.summary || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fromTs || toTs) {
        const ts = new Date(c.created_at).getTime();
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts >= toTs) return false;
      }
      return true;
    });
  }, [calls, search, statusFilter, directionFilter, fromDate, toDate]);

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
    return {
      totalCount: filtered.length,
      completedCount,
      failedCount,
      avgDurationStr: `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`,
    };
  }, [filtered]);

  const handleExport = () => {
    exportToCsv('calls.csv', filtered, [
      { header: 'Date', value: (c) => new Date(c.created_at).toISOString() },
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
      header: 'Direction',
      id: 'direction',
      cell: (row) => <span style={{ textTransform: 'capitalize' }}>{row.direction || 'Unknown'}</span>,
    },
    {
      header: 'Duration',
      id: 'duration_sec',
      cell: (row) => {
        if (!row.duration_sec) return '-';
        return `${Math.floor(row.duration_sec / 60)}m ${row.duration_sec % 60}s`;
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
    <BusinessSubLayout tenantId={id!}>
      <div className="dashboard-kpi-row">
        <KpiCard label="Total Calls" value={metrics.totalCount.toLocaleString()} loading={loading} />
        <KpiCard label="Completed Calls" value={metrics.completedCount.toLocaleString()} variant="success" loading={loading} />
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
              placeholder="Conversation ID, summary…"
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
          <button className="btn btn--secondary" onClick={handleExport} disabled={loading || filtered.length === 0}>
            <FiDownload /> Export CSV
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
            emptyMessage="No calls for this business match the current filters."
          />
        )}
      </div>
    </BusinessSubLayout>
  );
};
