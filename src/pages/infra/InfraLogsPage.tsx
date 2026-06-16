import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { reportError } from '@/lib/sentry';
import { FiRefreshCw, FiFilter } from 'react-icons/fi';

export const InfraLogsPage = () => {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [unifiedLogs, setUnifiedLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');

  const fetchLogs = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [{ data, error }, { data: dbLogs }] = await Promise.all([
        supabase.functions.invoke('fetch-infra-metrics'),
        supabase.from('system_error_logs').select('*').order('created_at', { ascending: false }).limit(50)
      ]);

      if (error) throw error;

      const logs: any[] = [];

      // Add system logs (OpenAI, Vercel, Supabase, etc.)
      (dbLogs || []).forEach(l => {
        logs.push({
          id: l.id,
          timestamp: new Date(l.created_at).getTime(),
          service: l.category,
          level: l.level,
          message: l.error_message
        });
      });

      // Add Twilio logs
      if (data?.twilio?.alerts) {
        data.twilio.alerts.forEach((a: any) => {
          logs.push({
            id: a.errorCode + a.dateCreated,
            timestamp: new Date(a.dateCreated).getTime(),
            service: 'twilio',
            level: 'warning',
            message: a.alertText
          });
        });
      }

      // Add ElevenLabs logs
      if (data?.elevenlabs?.history) {
        data.elevenlabs.history.forEach((h: any) => {
          logs.push({
            id: h.historyItemId,
            timestamp: h.dateUnix * 1000,
            service: 'elevenlabs',
            level: 'info',
            message: `Generated audio for character: ${h.characterName || h.voiceName}`
          });
        });
      }

      logs.sort((a, b) => b.timestamp - a.timestamp);
      setUnifiedLogs(logs);

    } catch (error: any) {
      reportError(error, { where: 'InfraLogsPage.fetchLogs' });
      setFetchError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const tabs = [
    { id: 'all', label: 'All Services' },
    { id: 'twilio', label: 'Twilio' },
    { id: 'elevenlabs', label: 'ElevenLabs' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'vercel', label: 'Vercel' },
    { id: 'supabase', label: 'Supabase' },
  ];

  const filteredLogs = activeTab === 'all' 
    ? unifiedLogs 
    : unifiedLogs.filter(log => log.service.toLowerCase() === activeTab);

  const getNativeLogLinks = (service: string) => {
    switch(service) {
      case 'openai': return [{ url: 'https://platform.openai.com/activity', label: 'View Logs on OpenAI' }];
      case 'vercel': return [
        { url: 'https://vercel.com/info-51527205s-projects/promptline-secure-sandbox/logs', label: 'Secure Sandbox Logs' },
        { url: 'https://vercel.com/info-51527205s-projects/prompt-line-answers-sandbox/logs', label: 'Answers Sandbox Logs' },
        { url: 'https://vercel.com/info-51527205s-projects/promptline-admin/logs', label: 'Admin Dashboard Logs' },
        { url: 'https://vercel.com/info-51527205s-projects/promptline-api-sandbox/logs', label: 'API Sandbox Logs' },
      ];
      case 'supabase': return [{ url: 'https://supabase.com/dashboard/project/czqthypzgxybkprdptzg/logs/explorer', label: 'View Logs on Supabase' }];
      default: return [];
    }
  };

  return (
    <div className="page-content">
      <PageHeader 
        title="System Logs" 
        subtitle="Centralized audit logs from external infrastructure providers"
        actions={
          <button className="btn btn--secondary" onClick={fetchLogs} disabled={loading}>
            <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="page-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '1rem', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? 'hsl(var(--primary))' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'hsl(var(--muted-foreground))',
                fontWeight: activeTab === tab.id ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          {loading && unifiedLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p className="text-muted">Fetching logs...</p>
            </div>
          ) : fetchError ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
              <p>Failed to load logs.</p>
              <p style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>{fetchError}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <FiFilter size={48} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1rem', opacity: 0.5 }} />
              {getNativeLogLinks(activeTab).length > 0 ? (
                <>
                  <h3 style={{ marginBottom: '0.5rem' }}>Native Logging</h3>
                  <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                    Detailed logs and analytics for {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} are best viewed directly on their platform.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                    {getNativeLogLinks(activeTab).map(link => (
                      <a 
                        key={link.url}
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn btn--primary"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: '300px', justifyContent: 'center' }}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ marginBottom: '0.5rem' }}>No logs found</h3>
                  <p className="text-muted">There are no recent logs for this selection.</p>
                </>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    <th style={{ padding: '0.75rem', fontWeight: 600 }}>Time</th>
                    {activeTab === 'all' && <th style={{ padding: '0.75rem', fontWeight: 600 }}>Service</th>}
                    <th style={{ padding: '0.75rem', fontWeight: 600 }}>Level</th>
                    <th style={{ padding: '0.75rem', fontWeight: 600 }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log: any, idx: number) => (
                    <tr key={log.id || idx} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <td style={{ padding: '0.75rem', whiteSpace: 'nowrap', color: 'hsl(var(--muted-foreground))' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      {activeTab === 'all' && (
                        <td style={{ padding: '0.75rem', textTransform: 'capitalize', fontWeight: 500 }}>
                          {log.service}
                        </td>
                      )}
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '4px', 
                          fontSize: '0.75rem', 
                          textTransform: 'uppercase',
                          background: log.level === 'error' ? 'rgba(239, 68, 68, 0.1)' : log.level === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: log.level === 'error' ? '#ef4444' : log.level === 'warning' ? '#f59e0b' : '#10b981'
                        }}>
                          {log.level}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
