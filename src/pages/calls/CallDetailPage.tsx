import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useToast } from '@/components/common/Toast';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Interaction, Tenant } from '@/types/domain';
import { reportError } from '@/lib/sentry';
import { FiArrowLeft, FiCopy, FiExternalLink } from 'react-icons/fi';

const formatDuration = (secs: number | null) => {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: '1rem',
      borderBottom: '1px solid hsl(var(--border))',
      paddingBottom: '0.5rem',
    }}
  >
    <span className="text-muted">{label}</span>
    <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
  </div>
);

export const CallDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [call, setCall] = useState<Interaction | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCall = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      setCall(data as Interaction);

      if (data?.tenant_id) {
        const { data: t } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', data.tenant_id)
          .single();
        setTenant((t as Tenant) ?? null);
      }
    } catch (error) {
      reportError(error, { where: 'CallDetailPage.fetchCall' });
      console.error('Error loading call:', error);
      toast('Failed to load call', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchCall();
  }, [fetchCall]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast(`${label} copied`),
      () => toast('Copy failed', 'error'),
    );
  };

  if (loading) {
    return (
      <div className="page-content">
        <p>Loading call...</p>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="page-content">
        <PageHeader title="Call Not Found" />
        <button className="btn btn--ghost" onClick={() => navigate(-1)}>
          <FiArrowLeft /> Back
        </button>
      </div>
    );
  }

  // ElevenLabs hosts the full transcript/recording under the conversation id.
  const elevenUrl = call.eleven_conv_id
    ? `https://elevenlabs.io/app/conversational-ai/history/${call.eleven_conv_id}`
    : null;

  return (
    <div className="page-content">
      <button
        className="btn btn--ghost"
        style={{ padding: 0, marginBottom: '1rem', color: 'hsl(var(--muted-foreground))' }}
        onClick={() => navigate(-1)}
      >
        <FiArrowLeft /> Back
      </button>

      <PageHeader
        title="Call Detail"
        subtitle={`${new Date(call.created_at).toLocaleString()}`}
        actions={
          elevenUrl ? (
            <a className="btn btn--secondary" href={elevenUrl} target="_blank" rel="noreferrer">
              <FiExternalLink /> Open in ElevenLabs
            </a>
          ) : undefined
        }
      />

      <div className="dashboard-kpi-row" style={{ marginTop: '1.5rem' }}>
        <KpiCard label="Status" value={<StatusBadge status={call.status || 'unknown'} />} />
        <KpiCard label="Duration" value={formatDuration(call.duration_sec)} />
        <KpiCard
          label="Direction"
          value={<span style={{ textTransform: 'capitalize' }}>{call.direction || 'Unknown'}</span>}
        />
      </div>

      <div className="dashboard-chart-grid">
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Summary</h3>
          </div>
          {call.summary ? (
            <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{call.summary}</p>
          ) : (
            <p className="text-muted">
              No summary was captured for this call.
              {elevenUrl && ' Open it in ElevenLabs to view the full transcript and recording.'}
            </p>
          )}
        </div>

        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Details</h3>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <Row label="Business">
              {tenant ? (
                <Link to={`/businesses/${tenant.id}`}>{tenant.company_name || tenant.id}</Link>
              ) : (
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{call.tenant_id}</span>
              )}
            </Row>
            <Row label="Channel">{call.channel || '—'}</Row>
            <Row label="Type">{call.type || '—'}</Row>
            <Row label="Started">{call.started_at ? new Date(call.started_at).toLocaleString() : '—'}</Row>
            <Row label="Ended">{call.ended_at ? new Date(call.ended_at).toLocaleString() : '—'}</Row>
            <Row label="Contact ID">
              {call.contact_id ? (
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{call.contact_id}</span>
              ) : (
                '—'
              )}
            </Row>
            <Row label="ElevenLabs Conv. ID">
              {call.eleven_conv_id ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{call.eleven_conv_id}</span>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ padding: '0.1rem 0.3rem' }}
                    onClick={() => copy(call.eleven_conv_id!, 'Conversation ID')}
                  >
                    <FiCopy />
                  </button>
                </span>
              ) : (
                '—'
              )}
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
};
