import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { FiMail, FiUsers, FiFileText, FiSend, FiTrendingUp, FiAlertCircle } from 'react-icons/fi';
import { reportError } from '@/lib/sentry';
import type { MarketingSender } from '@/types/domain';

type DashboardStats = {
  totalContacts: number;
  totalTemplates: number;
  emailsSent: number;
  emailsSentThisMonth: number;
  connectedSenders: number;
  totalSenders: number;
};

export const MarketingDashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSends, setRecentSends] = useState<any[]>([]);
  const [senders, setSenders] = useState<MarketingSender[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [
          { count: contacts },
          { count: templates },
          { count: totalSends },
          { data: senderData },
          { data: recent },
        ] = await Promise.all([
          supabase.from('email_contacts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('email_templates').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('email_sends').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
          supabase.from('marketing_senders').select('*').eq('is_active', true),
          supabase.from('email_sends')
            .select('id, recipient_email, subject, status, sent_at, sender_id, marketing_senders(display_name, email)')
            .eq('status', 'sent')
            .order('sent_at', { ascending: false })
            .limit(8),
        ]);

        // Emails this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const { count: monthSends } = await supabase
          .from('email_sends')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'sent')
          .gte('sent_at', startOfMonth.toISOString());

        setSenders((senderData ?? []) as MarketingSender[]);
        setRecentSends(recent ?? []);
        setStats({
          totalContacts: contacts ?? 0,
          totalTemplates: templates ?? 0,
          emailsSent: totalSends ?? 0,
          emailsSentThisMonth: monthSends ?? 0,
          connectedSenders: (senderData ?? []).filter((s: any) => s.is_connected).length,
          totalSenders: (senderData ?? []).length,
        });
      } catch (err) {
        reportError(err, { where: 'MarketingDashboardPage' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const kpis = stats
    ? [
        { label: 'Total Contacts', value: stats.totalContacts.toLocaleString(), icon: <FiUsers />, color: 'hsl(var(--primary))' },
        { label: 'Active Templates', value: stats.totalTemplates.toLocaleString(), icon: <FiFileText />, color: 'hsl(142 71% 45%)' },
        { label: 'Emails Sent (Total)', value: stats.emailsSent.toLocaleString(), icon: <FiMail />, color: 'hsl(38 92% 50%)' },
        { label: 'Sent This Month', value: stats.emailsSentThisMonth.toLocaleString(), icon: <FiTrendingUp />, color: 'hsl(260 80% 60%)' },
      ]
    : [];

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Marketing Dashboard
        </h1>
        <p className="text-muted">Manage email campaigns, templates, and contacts</p>
      </div>

      {/* Sender Warning */}
      {stats && stats.connectedSenders === 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            background: 'hsl(38 92% 50% / 0.1)',
            border: '1px solid hsl(38 92% 50% / 0.3)',
            borderRadius: 'var(--radius)',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <FiAlertCircle style={{ color: 'hsl(38 92% 50%)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No sender accounts connected</p>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Connect a sender email (Ranjit, Prashant, or Shantanu) to start sending marketing emails.
            </p>
            <button className="btn btn--primary btn--sm" onClick={() => navigate('/marketing/senders')}>
              Connect a Sender →
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="dashboard-kpi-row" style={{ marginBottom: '2rem' }}>
        {loading
          ? [1, 2, 3, 4].map(i => (
              <div key={i} className="page-card skeleton" style={{ flex: 1, height: 100 }} />
            ))
          : kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="page-card"
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}
              >
                <div
                  style={{
                    width: 48, height: 48, borderRadius: 'var(--radius)',
                    background: `${kpi.color}1a`,
                    display: 'grid', placeItems: 'center', color: kpi.color, fontSize: '1.25rem',
                  }}
                >
                  {kpi.icon}
                </div>
                <div>
                  <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {kpi.label}
                  </p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpi.value}</p>
                </div>
              </div>
            ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Quick Actions */}
        <div className="page-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="btn btn--primary" onClick={() => navigate('/marketing/send')}>
              <FiSend style={{ marginRight: '0.5rem' }} /> Compose & Send Email
            </button>
            <button className="btn btn--secondary" onClick={() => navigate('/marketing/templates')}>
              <FiFileText style={{ marginRight: '0.5rem' }} /> Manage Templates
            </button>
            <button className="btn btn--secondary" onClick={() => navigate('/marketing/contacts')}>
              <FiUsers style={{ marginRight: '0.5rem' }} /> View Contacts
            </button>
          </div>
        </div>

        {/* Sender Status */}
        <div className="page-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>
            Sender Accounts
            <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 400, marginLeft: '0.5rem' }}>
              ({stats?.connectedSenders ?? '–'}/{stats?.totalSenders ?? '–'} connected)
            </span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {loading
              ? [1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />)
              : senders.map((sender) => (
                  <div
                    key={sender.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.75rem', borderRadius: 8,
                      background: 'hsl(var(--secondary))',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: sender.is_connected ? 'hsl(142 71% 45% / 0.15)' : 'hsl(var(--muted))',
                          display: 'grid', placeItems: 'center',
                          fontSize: '0.875rem', fontWeight: 700,
                          color: sender.is_connected ? 'hsl(142 71% 45%)' : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {sender.display_name[0]}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{sender.display_name}</p>
                        <p className="text-muted" style={{ fontSize: '0.75rem' }}>{sender.email}</p>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600,
                        background: sender.is_connected ? 'hsl(142 71% 45% / 0.15)' : 'hsl(38 92% 50% / 0.15)',
                        color: sender.is_connected ? 'hsl(142 71% 45%)' : 'hsl(38 92% 50%)',
                      }}
                    >
                      {sender.is_connected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {/* Recent Sends */}
      {recentSends.length > 0 && (
        <div className="page-card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Recent Sends</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentSends.map((send: any) => (
              <div
                key={send.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.75rem', borderRadius: 8, background: 'hsl(var(--secondary))',
                }}
              >
                <div>
                  <p style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.15rem' }}>
                    {send.recipient_email}
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {send.subject} · via {(send.marketing_senders as any)?.display_name}
                  </p>
                </div>
                <p className="text-muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {formatDate(send.sent_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
