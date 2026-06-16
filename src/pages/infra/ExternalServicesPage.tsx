import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { reportError } from '@/lib/sentry';
import { FiCheckCircle, FiAlertCircle, FiXCircle, FiRefreshCw, FiCpu, FiDatabase } from 'react-icons/fi';

type ServiceStatus = 'healthy' | 'error' | 'missing_keys' | 'unknown';

interface InfraMetrics {
  twilio: {
    status: ServiceStatus;
    balance?: string;
    currency?: string;
    error?: string;
  };
  openai: {
    status: ServiceStatus;
    note?: string;
    error?: string;
  };
  elevenlabs: {
    status: ServiceStatus;
    character_count?: number;
    character_limit?: number;
    tier?: string;
    error?: string;
  };
  vercel?: {
    status: ServiceStatus;
    total_projects?: number;
    projects?: Array<{ name: string; readyState: string; url: string }>;
    error?: string;
  };
  supabase?: {
    status: ServiceStatus;
    services?: any;
    note?: string;
    error?: string;
  };
}

export const ExternalServicesPage = () => {
  const [metrics, setMetrics] = useState<InfraMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-infra-metrics');
      console.log('Edge function response:', { data, error });
      if (error) throw error;
      setMetrics(data as InfraMetrics);
    } catch (error: any) {
      reportError(error, { where: 'ExternalServicesPage.fetchMetrics' });
      console.error('Error fetching infra metrics:', error);
      setFetchError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const getStatusIcon = (status: ServiceStatus) => {
    switch (status) {
      case 'healthy': return <FiCheckCircle size={24} style={{ color: 'var(--success-color, #10b981)' }} />;
      case 'error': return <FiXCircle size={24} style={{ color: 'var(--error-color, #ef4444)' }} />;
      case 'missing_keys': return <FiAlertCircle size={24} style={{ color: 'var(--warning-color, #f59e0b)' }} />;
      default: return <FiAlertCircle size={24} style={{ color: 'hsl(var(--muted-foreground))' }} />;
    }
  };

  return (
    <div className="page-content">
      <PageHeader 
        title="External Services Monitoring" 
        subtitle="Real-time health, balances, and token usage for all connected 3rd-party APIs"
        actions={
          <button className="btn btn--secondary" onClick={fetchMetrics} disabled={loading}>
            <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      {loading && !metrics ? (
        <div className="page-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="text-muted">Fetching live metrics from external providers...</p>
        </div>
      ) : metrics ? (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          
          {/* TWILIO CARD */}
          <div className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: metrics.twilio.status === 'error' ? '4px solid #ef4444' : '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <img src="https://www.vectorlogo.zone/logos/twilio/twilio-icon.svg" alt="Twilio" style={{ width: '20px' }} /> Twilio
              </h3>
              {getStatusIcon(metrics.twilio.status)}
            </div>

            {metrics.twilio.status === 'healthy' ? (
              <div style={{ background: 'hsl(var(--muted))', padding: '1rem', borderRadius: '8px' }}>
                <p className="text-muted" style={{ fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem', fontWeight: 600 }}>Account Balance</p>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--foreground)' }}>
                  {metrics.twilio.balance} <span style={{ fontSize: '1rem', fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>{metrics.twilio.currency}</span>
                </p>
              </div>
            ) : metrics.twilio.status === 'error' ? (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {metrics.twilio.error}
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#b91c1c' }}>
                  <strong>Tip:</strong> A 404 error usually means the TWILIO_ACCOUNT_SID in your Edge Function secrets is incorrect or misspelled.
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem' }}>
                API Keys missing or invalid.
              </div>
            )}
          </div>

          {/* ELEVENLABS CARD */}
          <div className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: metrics.elevenlabs.status === 'error' ? '4px solid #ef4444' : '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                <span style={{ fontWeight: 900, marginRight: '4px' }}>||</span> ElevenLabs
              </h3>
              {getStatusIcon(metrics.elevenlabs.status)}
            </div>

            {metrics.elevenlabs.status === 'healthy' ? (
              <div style={{ background: 'hsl(var(--muted))', padding: '1rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <p className="text-muted" style={{ fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600 }}>Token Usage</p>
                  <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600 }}>{metrics.elevenlabs.tier} Plan</span>
                </div>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)' }}>
                  {(metrics.elevenlabs.character_count || 0).toLocaleString()} <span style={{ fontSize: '1rem', fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>/ {(metrics.elevenlabs.character_limit || 0).toLocaleString()} chars</span>
                </p>
                <div style={{ marginTop: '0.75rem', height: '6px', background: 'hsl(var(--border))', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    background: '#3b82f6', 
                    width: `${Math.min(100, ((metrics.elevenlabs.character_count || 0) / (metrics.elevenlabs.character_limit || 1)) * 100)}%` 
                  }} />
                </div>
              </div>
            ) : metrics.elevenlabs.status === 'error' ? (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {metrics.elevenlabs.error}
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem' }}>
                API Keys missing or invalid.
              </div>
            )}
          </div>

          {/* OPENAI CARD */}
          <div className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: metrics.openai.status === 'error' ? '4px solid #ef4444' : '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiCpu /> OpenAI
              </h3>
              {getStatusIcon(metrics.openai.status)}
            </div>

            {metrics.openai.status === 'healthy' ? (
              <div style={{ background: 'hsl(var(--muted))', padding: '1rem', borderRadius: '8px' }}>
                <p className="text-muted" style={{ fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem', fontWeight: 600 }}>Connection Status</p>
                <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FiCheckCircle /> API Key Valid & Active
                </p>
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))', lineHeight: '1.4' }}>
                    <strong>Note on Token Usage:</strong> OpenAI officially deprecated their billing/usage APIs for standard API keys. It is no longer possible to fetch token usage or monetary balance programmatically without an Enterprise Session token. Please check the OpenAI Dashboard directly for billing details.
                  </p>
                </div>
              </div>
            ) : metrics.openai.status === 'error' ? (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {metrics.openai.error}
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem' }}>
                API Keys missing or invalid.
              </div>
            )}
          </div>

          {/* VERCEL CARD */}
          <div className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: metrics.vercel?.status === 'error' ? '4px solid #ef4444' : '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 76 65" fill="var(--foreground)" width="20" height="20"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"></path></svg> Vercel
              </h3>
              {getStatusIcon(metrics.vercel?.status)}
            </div>

            {metrics.vercel?.status === 'healthy' ? (
              <div style={{ background: 'hsl(var(--muted))', padding: '1rem', borderRadius: '8px' }}>
                <p className="text-muted" style={{ fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 600 }}>Active Deployments</p>
                <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                  {metrics.vercel.total_projects} Projects Tracked
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {metrics.vercel.projects?.map((p: any) => (
                    <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '4px' }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span style={{ color: p.readyState === 'READY' ? '#10b981' : p.readyState === 'ERROR' ? '#ef4444' : '#f59e0b' }}>
                        {p.readyState === 'READY' ? '🟢 Ready' : p.readyState}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : metrics.vercel?.status === 'error' ? (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {metrics.vercel.error}
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem' }}>
                VERCEL_TOKEN secret missing.
              </div>
            )}
          </div>

          {/* SUPABASE CARD */}
          <div className="page-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: metrics.supabase?.status === 'error' ? '4px solid #ef4444' : '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiDatabase style={{ color: '#3ECF8E' }} /> Supabase
              </h3>
              {getStatusIcon(metrics.supabase?.status)}
            </div>

            {metrics.supabase?.status === 'healthy' ? (
              <div style={{ background: 'hsl(var(--muted))', padding: '1rem', borderRadius: '8px' }}>
                <p className="text-muted" style={{ fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem', fontWeight: 600 }}>Database Health</p>
                <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FiCheckCircle /> Database Responding
                </p>
                <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem' }}>
                  {metrics.supabase.note || 'Full infra health check passed.'}
                </p>
              </div>
            ) : metrics.supabase?.status === 'error' ? (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {metrics.supabase.error}
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', color: '#ef4444', fontSize: '0.9rem' }}>
                Supabase credentials missing.
              </div>
            )}
          </div>

        </div>
      ) : (
        <div className="page-card" style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
          <p>Failed to load infrastructure metrics.</p>
          <p style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {fetchError}
          </p>
        </div>
      )}
    </div>
  );
};
