import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useRealtime } from '@/hooks/useRealtime';
import { reportError } from '@/lib/sentry';
import type { AdminActivityLog, SystemErrorLog } from '@/types/domain';
import { FiX, FiAlertCircle, FiInfo, FiCode } from 'react-icons/fi';

type AdminLogRow = AdminActivityLog & {
  admin_user: { full_name: string; email: string } | null;
};

export const ActivityLogPage = () => {
  const [activeTab, setActiveTab] = useState<'admin' | 'system'>('admin');
  
  // Admin logs state
  const [adminLogs, setAdminLogs] = useState<AdminLogRow[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(true);

  // System logs state
  const [systemLogs, setSystemLogs] = useState<SystemErrorLog[]>([]);
  const [loadingSystem, setLoadingSystem] = useState(true);
  const [systemFilter, setSystemFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<SystemErrorLog | null>(null);

  const fetchAdminLogs = async () => {
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
      setAdminLogs(data as AdminLogRow[] || []);
    } catch (error) {
      reportError(error, { where: 'ActivityLogPage.fetchAdminLogs' });
      console.error('Error fetching admin logs:', error);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const fetchSystemLogs = async () => {
    try {
      const query = supabase
        .from('system_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
        
      const { data, error } = await query;
      if (error) throw error;
      setSystemLogs(data || []);
    } catch (error) {
      reportError(error, { where: 'ActivityLogPage.fetchSystemLogs' });
      console.error('Error fetching system logs:', error);
    } finally {
      setLoadingSystem(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; setState runs after await, not during render
    fetchAdminLogs();
    fetchSystemLogs();
  }, []);

  useRealtime({ table: 'admin_activity_log', event: '*', onUpdate: fetchAdminLogs });
  useRealtime({ table: 'system_error_logs', event: '*', onUpdate: fetchSystemLogs });

  const filteredSystemLogs = useMemo(() => {
    if (systemFilter === 'all') return systemLogs;
    return systemLogs.filter(log => log.category === systemFilter);
  }, [systemLogs, systemFilter]);

  const adminColumns: ColumnDef<AdminLogRow>[] = [
    {
      header: 'Timestamp',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }),
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

  const systemColumns: ColumnDef<SystemErrorLog>[] = [
    {
      header: 'Timestamp',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }),
    },
    {
      header: 'Level',
      id: 'level',
      cell: (row) => (
        <span style={{ 
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          color: row.level === 'error' ? 'var(--error-color)' : row.level === 'warning' ? '#f59e0b' : 'inherit',
          fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem'
        }}>
          {row.level === 'error' ? <FiAlertCircle /> : <FiInfo />}
          {row.level}
        </span>
      ),
    },
    {
      header: 'Category',
      id: 'category',
      cell: (row) => <span style={{ textTransform: 'capitalize' }}>{row.category}</span>,
    },
    {
      header: 'Error Message',
      id: 'error_message',
      cell: (row) => (
        <span style={{ fontWeight: 500 }}>
          {row.error_message.length > 50 ? `${row.error_message.substring(0, 50)}...` : row.error_message}
        </span>
      ),
    },
    {
      header: 'Tenant ID',
      accessorKey: 'tenant_id',
      cell: (row) => row.tenant_id ? <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.tenant_id}</span> : '-',
    },
    {
      header: '',
      id: 'actions',
      sortable: false,
      cell: (row) => (
        <button className="btn btn--secondary btn--sm" onClick={(e) => { e.stopPropagation(); setSelectedLog(row); }}>
          View Details
        </button>
      ),
    }
  ];

  return (
    <div className="page-content">
      <PageHeader 
        title="Audit & Logs" 
        subtitle="Track administrative actions and monitor platform system errors"
      />

      <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--border))', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('admin')}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'admin' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'admin' ? 600 : 400,
            color: activeTab === 'admin' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'
          }}
        >
          Admin Activity
        </button>
        <button 
          onClick={() => setActiveTab('system')}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'system' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'system' ? 600 : 400,
            color: activeTab === 'system' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'
          }}
        >
          System Errors
        </button>
      </div>

      {activeTab === 'admin' && (
        <div className="dashboard-section">
          {loadingAdmin ? (
            <div className="page-card"><p>Loading admin logs...</p></div>
          ) : (
            <DataTable
              data={adminLogs}
              columns={adminColumns}
              emptyMessage="No admin activity logs recorded yet."
            />
          )}
        </div>
      )}

      {activeTab === 'system' && (
        <div className="dashboard-section">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Logs' },
              { id: 'promo', label: 'Promo Codes' },
              { id: 'billing', label: 'Failed Payments' },
              { id: 'email', label: 'Follow-up Emails' },
              { id: 'twilio', label: 'Twilio & Provisioning' }
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setSystemFilter(filter.id)}
                className={`btn btn--sm ${systemFilter === filter.id ? 'btn--primary' : 'btn--secondary'}`}
                style={{ borderRadius: '100px' }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {loadingSystem ? (
            <div className="page-card"><p>Loading system logs...</p></div>
          ) : (
            <DataTable
              data={filteredSystemLogs}
              columns={systemColumns}
              onRowClick={setSelectedLog}
              emptyMessage="No system errors recorded in this category."
            />
          )}
        </div>
      )}

      {selectedLog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            background: 'hsl(var(--card))', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
            borderRadius: '12px', padding: '24px', border: '1px solid hsl(var(--border))',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FiAlertCircle style={{ color: 'var(--error-color)' }} /> Log Details
                </h2>
                <p className="text-muted">Captured on {new Date(selectedLog.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="btn btn--secondary btn--sm" style={{ padding: '0.4rem' }}>
                <FiX />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '0.25rem' }}>Category & Level</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ padding: '0.25rem 0.5rem', background: 'hsl(var(--muted))', borderRadius: '4px', fontSize: '0.85rem', textTransform: 'capitalize', fontWeight: 500 }}>
                    {selectedLog.category}
                  </span>
                  <span style={{ padding: '0.25rem 0.5rem', background: selectedLog.level === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: selectedLog.level === 'error' ? '#ef4444' : '#f59e0b', borderRadius: '4px', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    {selectedLog.level}
                  </span>
                </div>
              </div>

              {selectedLog.tenant_id && (
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '0.25rem' }}>Tenant ID</label>
                  <code style={{ background: 'hsl(var(--muted))', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', display: 'block' }}>
                    {selectedLog.tenant_id}
                  </code>
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '0.25rem' }}>Error Message</label>
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', borderLeft: '3px solid #ef4444', padding: '0.75rem', borderRadius: '0 6px 6px 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedLog.error_message}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '0.25rem' }}><FiCode /> Raw Payload / Details</label>
                <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid hsl(var(--border))', paddingTop: '1rem', marginTop: 'auto' }}>
              <button className="btn btn--primary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
