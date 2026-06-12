import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { AdminOnly } from '@/auth/AdminOnly';
import { useToast } from '@/components/common/Toast';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { BusinessSubLayout } from '@/components/businesses/BusinessSubLayout';
import { FiRefreshCw, FiEye, FiCheckCircle, FiXCircle } from 'react-icons/fi';

type VoiceProfile = {
  agent_id: string | null;
  persona: string | null;
  voice_type: string | null;
  tone: string | null;
  custom_greeting: string | null;
  prompt: string | null;
  transfer_phone_number: string | null;
  ai_capabilities: unknown;
  knowledge_documents: unknown;
  tool_ids: unknown;
  business_type: string | null;
  business_website: string | null;
  updated_at: string | null;
};
type OperationalProfile = {
  business_hours: unknown;
  twillio_phone: string | null;
  special_instructions: string | null;
  preferred_area_code: string | null;
};
type MessagingPrefs = {
  enable_missed_call_textback: boolean | null;
  missed_call_textback_message: string | null;
};
type ServiceProfile = {
  services: unknown;
  pricing_details: string | null;
};

const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
  return [];
};

const docName = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
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
    <span style={{ textAlign: 'right', wordBreak: 'break-word', maxWidth: '60%' }}>{children}</span>
  </div>
);

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      fontSize: '0.75rem',
      padding: '0.15rem 0.55rem',
      borderRadius: '999px',
      background: 'hsl(var(--muted))',
      color: 'hsl(var(--foreground))',
    }}
  >
    {children}
  </span>
);

export const BusinessAgentPage = () => {
  const { id } = useParams<{ id: string }>();
  const { adminUser } = useAuth();
  const { toast } = useToast();

  const [voice, setVoice] = useState<VoiceProfile | null>(null);
  const [ops, setOps] = useState<OperationalProfile | null>(null);
  const [messaging, setMessaging] = useState<MessagingPrefs | null>(null);
  const [service, setService] = useState<ServiceProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showResync, setShowResync] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    try {
      const [v, o, m, s] = await Promise.all([
        supabase.from('tenant_voice_profiles').select('*').eq('tenant_id', id).maybeSingle(),
        supabase.from('tenant_operational_profiles').select('*').eq('tenant_id', id).maybeSingle(),
        supabase.from('tenant_messaging_preferences').select('*').eq('tenant_id', id).maybeSingle(),
        supabase.from('tenant_service_profiles').select('*').eq('tenant_id', id).maybeSingle(),
      ]);
      setVoice((v.data as VoiceProfile) ?? null);
      setOps((o.data as OperationalProfile) ?? null);
      setMessaging((m.data as MessagingPrefs) ?? null);
      setService((s.data as ServiceProfile) ?? null);
    } catch (error) {
      console.error('Error loading agent config:', error);
      toast('Failed to load agent configuration', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const handlePreview = async () => {
    if (!id) return;
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('agents', {
        body: { tenant_id: id, mode: 'prompt_preview' },
      });
      if (error) throw error;
      setPromptPreview(data?.systemPrompt || '(No system prompt returned)');
    } catch (err: any) {
      console.error('Prompt preview failed:', err);
      toast(err?.message || 'Failed to preview prompt', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleResync = async () => {
    if (!id) return;
    setResyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('agents', {
        body: { tenant_id: id, mode: 'update' },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error || 'Re-sync failed');

      const kb = data?.knowledgeBase;
      const kbNote = kb ? ` KB: +${kb.added ?? 0} / -${kb.removed ?? 0} docs.` : '';
      toast(`Agent re-synced to ElevenLabs.${kbNote}`);

      if (adminUser) {
        await supabase.from('admin_activity_log').insert({
          admin_user_id: adminUser.id,
          action: 'resync_agent',
          target_tenant_id: id,
          details: { agent_id: data?.agentId, kb_added: kb?.added, kb_removed: kb?.removed },
        });
      }
      fetchAgent();
    } catch (err: any) {
      console.error('Agent re-sync failed:', err);
      toast(err?.message || 'Failed to re-sync agent', 'error');
    } finally {
      setResyncing(false);
    }
  };

  if (!id) return null;

  const provisioned = !!voice?.agent_id;
  const hasNumber = !!ops?.twillio_phone;
  const capabilities = asArray(voice?.ai_capabilities);
  const kbDocs = asArray(voice?.knowledge_documents);

  return (
    <BusinessSubLayout tenantId={id}>
      {loading ? (
        <div className="page-card">
          <p>Loading agent configuration…</p>
        </div>
      ) : !voice && !ops ? (
        <div className="page-card">
          <div className="empty-state">
            <p className="empty-state__text">
              No agent configuration found for this business. They likely haven't completed onboarding.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Status + actions */}
          <div className="page-card" style={{ marginBottom: '1.5rem' }}>
            <div className="page-card__header">
              <h3 className="page-card__title">Agent Status</h3>
              <AdminOnly>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn--secondary btn--sm" onClick={handlePreview} disabled={previewing}>
                    <FiEye /> {previewing ? 'Loading…' : 'Preview prompt'}
                  </button>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => setShowResync(true)}
                    disabled={resyncing || !provisioned}
                    title={!provisioned ? 'No ElevenLabs agent provisioned yet' : undefined}
                  >
                    <FiRefreshCw className={resyncing ? 'fa-spin' : ''} /> Re-sync to ElevenLabs
                  </button>
                </div>
              </AdminOnly>
            </div>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                {provisioned ? (
                  <FiCheckCircle style={{ color: 'hsl(var(--success))' }} />
                ) : (
                  <FiXCircle style={{ color: 'hsl(var(--destructive))' }} />
                )}
                {provisioned ? 'Agent provisioned' : 'Not provisioned'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                {hasNumber ? (
                  <FiCheckCircle style={{ color: 'hsl(var(--success))' }} />
                ) : (
                  <FiXCircle style={{ color: 'hsl(var(--destructive))' }} />
                )}
                {hasNumber ? `Phone ${ops?.twillio_phone}` : 'No phone number'}
              </span>
              {voice?.updated_at && (
                <span className="text-muted">
                  Config updated {new Date(voice.updated_at).toLocaleString()}
                </span>
              )}
            </div>
            {voice?.agent_id && (
              <p className="text-muted" style={{ fontSize: '0.78rem', fontFamily: 'monospace', marginTop: '0.75rem' }}>
                ElevenLabs agent: {voice.agent_id}
              </p>
            )}
          </div>

          <div className="dashboard-chart-grid">
            {/* Voice & persona */}
            <div className="page-card">
              <div className="page-card__header">
                <h3 className="page-card__title">Voice &amp; Persona</h3>
              </div>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <Field label="Persona">{voice?.persona || '—'}</Field>
                <Field label="Voice">{voice?.voice_type || '—'}</Field>
                <Field label="Tone">{voice?.tone || '—'}</Field>
                <Field label="Greeting">{voice?.custom_greeting || '—'}</Field>
                <Field label="Business type">{voice?.business_type || '—'}</Field>
              </div>
            </div>

            {/* Call handling */}
            <div className="page-card">
              <div className="page-card__header">
                <h3 className="page-card__title">Call Handling</h3>
              </div>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <Field label="Transfer / escalation #">{voice?.transfer_phone_number || 'Not set'}</Field>
                <Field label="Missed-call text-back">
                  {messaging?.enable_missed_call_textback ? 'On' : 'Off'}
                </Field>
                {messaging?.missed_call_textback_message && (
                  <Field label="Text-back message">{messaging.missed_call_textback_message}</Field>
                )}
                <Field label="Preferred area code">{ops?.preferred_area_code || '—'}</Field>
                <div>
                  <p className="text-muted" style={{ marginBottom: '0.4rem' }}>Capabilities</p>
                  {capabilities.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {capabilities.map((c) => (
                        <Chip key={c}>{c.replace(/_/g, ' ')}</Chip>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">None configured</span>
                  )}
                </div>
              </div>
            </div>

            {/* Business hours & instructions */}
            <div className="page-card">
              <div className="page-card__header">
                <h3 className="page-card__title">Hours &amp; Instructions</h3>
              </div>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div>
                  <p className="text-muted" style={{ marginBottom: '0.4rem' }}>Business hours</p>
                  {ops?.business_hours ? (
                    <pre
                      style={{
                        margin: 0,
                        fontSize: '0.78rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        background: 'hsl(var(--muted))',
                        padding: '0.6rem',
                        borderRadius: '6px',
                      }}
                    >
                      {JSON.stringify(ops.business_hours, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-muted">Not set</span>
                  )}
                </div>
                {ops?.special_instructions && (
                  <Field label="Special instructions">{ops.special_instructions}</Field>
                )}
                {service?.pricing_details && <Field label="Pricing">{service.pricing_details}</Field>}
              </div>
            </div>

            {/* Knowledge base */}
            <div className="page-card">
              <div className="page-card__header">
                <h3 className="page-card__title">Knowledge Base</h3>
              </div>
              {voice?.business_website && (
                <Field label="Grounding website">
                  <a href={voice.business_website} target="_blank" rel="noreferrer">
                    {voice.business_website}
                  </a>
                </Field>
              )}
              <div style={{ marginTop: '0.75rem' }}>
                <p className="text-muted" style={{ marginBottom: '0.4rem' }}>
                  Documents ({kbDocs.length})
                </p>
                {kbDocs.length ? (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
                    {kbDocs.map((d) => (
                      <li key={d} style={{ fontSize: '0.85rem', wordBreak: 'break-word' }}>
                        {docName(d)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">No documents</span>
                )}
              </div>
            </div>
          </div>

          {/* Prompt preview */}
          {promptPreview && (
            <div className="page-card" style={{ marginTop: '1.5rem' }}>
              <div className="page-card__header">
                <h3 className="page-card__title">System Prompt Preview</h3>
                <button className="btn btn--ghost btn--sm" onClick={() => setPromptPreview(null)}>
                  Hide
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                  maxHeight: '500px',
                  overflow: 'auto',
                }}
              >
                {promptPreview}
              </pre>
            </div>
          )}

          <ConfirmDialog
            isOpen={showResync}
            title="Re-sync agent to ElevenLabs"
            message="This rebuilds the system prompt and refreshes the knowledge base on the live ElevenLabs agent. Use it when the agent's behavior or KB is out of date. Continue?"
            confirmLabel="Re-sync now"
            onConfirm={handleResync}
            onCancel={() => setShowResync(false)}
          />
        </>
      )}
    </BusinessSubLayout>
  );
};
