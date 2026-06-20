import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useToast } from '@/components/common/Toast';
import { PageHeader } from '@/components/common/PageHeader';
import { BusinessTabs } from '@/components/businesses/BusinessTabs';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useRealtime } from '@/hooks/useRealtime';
import { reportError } from '@/lib/sentry';
import type { SystemErrorLog } from '@/types/domain';
import { FiArrowLeft, FiAlertCircle, FiInfo, FiCode, FiX } from 'react-icons/fi';

export const BusinessLogsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [logs, setLogs] = useState<SystemErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<SystemErrorLog | null>(null);

  const fetchLogs = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('system_error_logs')
        .select('*')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      reportError(error, { where: 'BusinessLogsPage.fetchLogs' });
      console.error('Error fetching logs:', error);
      toast('Failed to load system logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [id]);

  useRealtime({ table: 'system_error_logs', event: '*', onUpdate: fetchLogs });

  const columns: ColumnDef<SystemErrorLog>[] = [
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
      <button
        className="btn btn--ghost"
        style={{ padding: 0, marginBottom: '1rem', color: 'hsl(var(--muted-foreground))' }}
        onClick={() => navigate('/businesses')}
      >
        <FiArrowLeft /> Back to Businesses
      </button>

      <PageHeader
        title="System Logs"
        subtitle={`System events and errors for Tenant ID: ${id}`}
      />

      {id && <BusinessTabs tenantId={id} />}

      <div className="dashboard-section">
        <div className="page-card">
          {loading ? (
            <p>Loading logs...</p>
          ) : (
            <DataTable 
              data={logs} 
              columns={columns} 
              onRowClick={setSelectedLog}
              emptyMessage="No system logs found for this business." 
            />
          )}
        </div>
      </div>

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
