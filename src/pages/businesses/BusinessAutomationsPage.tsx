import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useToast } from '@/components/common/Toast';
import { BusinessSubLayout } from '@/components/businesses/BusinessSubLayout';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { reportError } from '@/lib/sentry';
import { FiCheckCircle, FiCircle } from 'react-icons/fi';

type Prefs = {
  appointment_reminders_enabled: boolean | null;
  review_requests_enabled: boolean | null;
  review_request_link: string | null;
  weekly_digest_enabled: boolean | null;
  enable_ai_sms_replies: boolean | null;
  enable_missed_call_textback: boolean | null;
  enable_email_notifications: boolean | null;
  notification_email: string | null;
};
type AutomationEvent = { id: string; kind: string; dedupe_key: string; created_at: string };
type Webhook = { id: string; url: string; events: string[] | null; enabled: boolean | null; description: string | null };
type Delivery = {
  id: string;
  event_type: string;
  response_status: number | null;
  error: string | null;
  created_at: string;
};

const Toggle = ({ on, label, meta }: { on: boolean; label: string; meta?: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      padding: '0.6rem 0',
      borderBottom: '1px solid hsl(var(--border))',
    }}
  >
    {on ? (
      <FiCheckCircle style={{ color: 'hsl(var(--success))', flexShrink: 0 }} />
    ) : (
      <FiCircle style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
    )}
    <span style={{ flex: 1 }}>{label}</span>
    {meta && <span className="text-muted" style={{ fontSize: '0.8rem' }}>{meta}</span>}
    <span style={{ fontWeight: 600, color: on ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))' }}>
      {on ? 'On' : 'Off'}
    </span>
  </div>
);

export const BusinessAutomationsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [p, e, w, d] = await Promise.all([
        supabase.from('tenant_messaging_preferences').select('*').eq('tenant_id', id).maybeSingle(),
        supabase
          .from('automation_events')
          .select('id, kind, dedupe_key, created_at')
          .eq('tenant_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('outbound_webhooks')
          .select('id, url, events, enabled, description')
          .eq('tenant_id', id),
        supabase
          .from('webhook_deliveries')
          .select('id, event_type, response_status, error, created_at')
          .eq('tenant_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      setPrefs((p.data as Prefs) ?? null);
      setEvents((e.data as AutomationEvent[]) ?? []);
      setWebhooks((w.data as Webhook[]) ?? []);
      setDeliveries((d.data as Delivery[]) ?? []);
    } catch (error) {
      reportError(error, { where: 'BusinessAutomationsPage.fetchData' });
      console.error('Error loading automations:', error);
      toast('Failed to load automations', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const eventColumns: ColumnDef<AutomationEvent>[] = [
    { header: 'When', id: 'created_at', cell: (r) => new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }) },
    {
      header: 'Type',
      id: 'kind',
      cell: (r) => <span style={{ textTransform: 'capitalize' }}>{r.kind.replace(/_/g, ' ')}</span>,
    },
    {
      header: 'Key',
      id: 'dedupe_key',
      cell: (r) => <span style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>{r.dedupe_key}</span>,
    },
  ];

  const deliveryColumns: ColumnDef<Delivery>[] = [
    { header: 'When', id: 'created_at', cell: (r) => new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }) },
    { header: 'Event', id: 'event_type', cell: (r) => r.event_type },
    {
      header: 'Result',
      id: 'response_status',
      cell: (r) =>
        r.error ? (
          <span style={{ color: 'hsl(var(--destructive))' }} title={r.error}>
            Failed{r.response_status ? ` (${r.response_status})` : ''}
          </span>
        ) : (
          <span style={{ color: 'hsl(var(--success))' }}>OK ({r.response_status ?? '—'})</span>
        ),
    },
  ];

  return (
    <BusinessSubLayout tenantId={id!}>
      {loading ? (
        <div className="page-card">
          <p>Loading automations…</p>
        </div>
      ) : (
        <>
          <div className="dashboard-chart-grid">
            <div className="page-card">
              <div className="page-card__header">
                <h3 className="page-card__title">Automation Settings</h3>
              </div>
              {prefs ? (
                <div>
                  <Toggle on={!!prefs.appointment_reminders_enabled} label="Appointment reminders" />
                  <Toggle
                    on={!!prefs.review_requests_enabled}
                    label="Review requests"
                    meta={prefs.review_request_link ? 'link set' : 'no link'}
                  />
                  <Toggle on={!!prefs.weekly_digest_enabled} label="Weekly digest email" />
                  <Toggle on={!!prefs.enable_ai_sms_replies} label="AI SMS auto-replies" />
                  <Toggle on={!!prefs.enable_missed_call_textback} label="Missed-call text-back" />
                  <Toggle
                    on={!!prefs.enable_email_notifications}
                    label="Email notifications"
                    meta={prefs.notification_email || undefined}
                  />
                </div>
              ) : (
                <p className="text-muted">No messaging preferences row for this business.</p>
              )}
            </div>

            <div className="page-card">
              <div className="page-card__header">
                <h3 className="page-card__title">Outbound Webhooks ({webhooks.length})</h3>
              </div>
              {webhooks.length ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {webhooks.map((w) => (
                    <div key={w.id} style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {w.url}
                        </span>
                        <span
                          style={{
                            fontWeight: 600,
                            color: w.enabled ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {w.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>
                        {(w.events || []).join(', ') || 'no events'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted">No webhooks configured.</p>
              )}
            </div>
          </div>

          <div className="dashboard-section" style={{ marginTop: '1.5rem' }}>
            <h3 className="dashboard-section__title" style={{ marginBottom: '1rem' }}>
              Recent Automation Activity
            </h3>
            <DataTable data={events} columns={eventColumns} emptyMessage="No automation runs recorded yet." />
          </div>

          {deliveries.length > 0 && (
            <div className="dashboard-section" style={{ marginTop: '1.5rem' }}>
              <h3 className="dashboard-section__title" style={{ marginBottom: '1rem' }}>
                Recent Webhook Deliveries
              </h3>
              <DataTable data={deliveries} columns={deliveryColumns} emptyMessage="No webhook deliveries." />
            </div>
          )}
        </>
      )}
    </BusinessSubLayout>
  );
};
