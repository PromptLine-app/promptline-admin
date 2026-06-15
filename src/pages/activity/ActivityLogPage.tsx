import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useRealtime } from '@/hooks/useRealtime';
import { reportError } from '@/lib/sentry';
import type { AdminActivityLog } from '@/types/domain';

type LogRow = AdminActivityLog & {
  admin_user: { full_name: string; email: string } | null;
};

export const ActivityLogPage = () => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_activity_log')
        .select(`
          *,
          admin_user:admin_users(full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data as LogRow[] || []);
    } catch (error) {
      reportError(error, { where: 'ActivityLogPage.fetchLogs' });
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useRealtime({ table: 'admin_activity_log', event: '*', onUpdate: fetchLogs });

  const columns: ColumnDef<LogRow>[] = [
    {
      header: 'Timestamp',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      header: 'Admin',
      id: 'admin_user',
      cell: (row) => row.admin_user?.full_name || row.admin_user?.email || 'Unknown Admin',
    },
    {
      header: 'Action',
      id: 'action',
      cell: (row) => <span style={{ fontWeight: 600 }}>{row.action}</span>,
    },
    {
      header: 'Target Tenant',
      accessorKey: 'target_tenant_id',
      cell: (row) => row.target_tenant_id ? <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.target_tenant_id}</span> : '-',
    },
    {
      header: 'Details',
      id: 'details',
      cell: (row) => <span style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>{JSON.stringify(row.details)}</span>,
    },
  ];

  return (
    <div className="page-content">
      <PageHeader 
        title="Activity Log" 
        subtitle="Audit trail of all administrative actions"
      />

      <div className="dashboard-section">
        {loading ? (
          <div className="page-card"><p>Loading logs...</p></div>
        ) : (
          <DataTable
            data={logs}
            columns={columns}
            emptyMessage="No activity logs recorded yet."
          />
        )}
      </div>
    </div>
  );
};
