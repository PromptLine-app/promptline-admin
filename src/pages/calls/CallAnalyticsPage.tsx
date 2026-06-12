import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { KpiCard } from '@/components/common/KpiCard';
import { useRealtime } from '@/hooks/useRealtime';
import type { Interaction } from '@/types/domain';

export const CallAnalyticsPage = () => {
  const [calls, setCalls] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

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

  useRealtime({ table: 'interactions', event: '*', onUpdate: fetchCalls });

  const metrics = useMemo(() => {
    let completedCount = 0;
    let totalDuration = 0;
    let failedCount = 0;

    calls.forEach((c) => {
      if (c.status === 'completed') completedCount++;
      if (c.status === 'failed' || c.status === 'no_answer') failedCount++;
      if (c.duration_sec) totalDuration += c.duration_sec;
    });

    const avgDuration = calls.length > 0 ? Math.round(totalDuration / calls.length) : 0;
    const avgMins = Math.floor(avgDuration / 60);
    const avgSecs = avgDuration % 60;

    return { totalCount: calls.length, completedCount, failedCount, avgDurationStr: `${avgMins}m ${avgSecs}s` };
  }, [calls]);

  const columns: ColumnDef<Interaction>[] = [
    {
      header: 'Date',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      header: 'Tenant ID',
      accessorKey: 'tenant_id',
      cell: (row) => <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.tenant_id}</span>,
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
      cell: (row) => row.eleven_conv_id ? <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.eleven_conv_id}</span> : '-',
    },
  ];

  return (
    <div className="page-content">
      <PageHeader 
        title="Call Analytics" 
        subtitle="Platform-wide call volumes and status tracking (Recent 1000 calls)" 
      />

      <div className="dashboard-kpi-row">
        <KpiCard
          label="Total Calls (Sample)"
          value={metrics.totalCount.toLocaleString()}
          loading={loading}
        />
        <KpiCard
          label="Completed Calls"
          value={metrics.completedCount.toLocaleString()}
          variant="success"
          loading={loading}
        />
        <KpiCard
          label="Avg Duration"
          value={metrics.avgDurationStr}
          variant="primary"
          loading={loading}
        />
      </div>

      <div className="dashboard-section">
        <h3 className="dashboard-section__title" style={{ marginBottom: '1rem' }}>Call History</h3>
        {loading ? (
          <div className="page-card"><p>Loading calls...</p></div>
        ) : (
          <DataTable
            data={calls}
            columns={columns}
            emptyMessage="No call records found."
          />
        )}
      </div>
    </div>
  );
};
