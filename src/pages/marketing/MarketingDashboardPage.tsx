import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { FiMail, FiUsers, FiFileText, FiSend, FiTrendingUp, FiAlertCircle } from 'react-icons/fi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area
} from 'recharts';
import { reportError } from '@/lib/sentry';
import type { MarketingSender } from '@/types/domain';

type DashboardStats = {
  totalContacts: number;
  totalTemplates: number;
  emailsSent: number;
  emailsSentThisMonth: number;
  connectedSenders: number;
  totalSenders: number;
  openRate: number;
  clickRate: number;
  timelineData: any[];
  templateData: any[];
  contactGrowthData: any[];
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

        // Calculate Open/Click Rates
        // Fetch detailed data for charts
        const [
          { data: sendsData },
          { data: contactsData }
        ] = await Promise.all([
          supabase
            .from('email_sends')
            .select('id, sent_at, opened_at, clicked_at, email_templates(name)')
            .eq('status', 'sent')
            .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
          supabase
            .from('email_contacts')
            .select('created_at')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        ]);
        
        let opens = 0;
        let clicks = 0;
        const total = totalSends ?? 0;
        
        const timelineMap: Record<string, { date: string; sends: number; opens: number; clicks: number }> = {};
        const templateMap: Record<string, { name: string; sends: number; opens: number }> = {};
        const contactMap: Record<string, { date: string; newContacts: number }> = {};

        // Init last 30 days
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          timelineMap[dateStr] = { date: dateStr, sends: 0, opens: 0, clicks: 0 };
          contactMap[dateStr] = { date: dateStr, newContacts: 0 };
        }

        if (sendsData) {
          sendsData.forEach(s => {
            if (s.opened_at) opens++;
            if (s.clicked_at) clicks++;

            // Timeline
            const dateStr = s.sent_at.split('T')[0];
            if (timelineMap[dateStr]) {
              timelineMap[dateStr].sends++;
              if (s.opened_at) timelineMap[dateStr].opens++;
              if (s.clicked_at) timelineMap[dateStr].clicks++;
            }

            // Templates
            const tName = (s.email_templates as any)?.name || 'Custom Email';
            if (!templateMap[tName]) templateMap[tName] = { name: tName, sends: 0, opens: 0 };
            templateMap[tName].sends++;
            if (s.opened_at) templateMap[tName].opens++;
          });
        }
        
        if (contactsData) {
          contactsData.forEach(c => {
            const dateStr = c.created_at.split('T')[0];
            if (contactMap[dateStr]) contactMap[dateStr].newContacts++;
          });
        }

        const openRate = total > 0 ? Math.round((opens / total) * 100) : 0;
        const clickRate = total > 0 ? Math.round((clicks / total) * 100) : 0;

        const timelineData = Object.values(timelineMap);
        const contactGrowthData = Object.values(contactMap);
        const templateData = Object.values(templateMap)
          .map(t => ({ ...t, openRate: Math.round((t.opens / t.sends) * 100) }))
          .sort((a, b) => b.sends - a.sends)
          .slice(0, 5);

        setSenders((senderData ?? []) as MarketingSender[]);
        setRecentSends(recent ?? []);
        setStats({
          totalContacts: contacts ?? 0,
          totalTemplates: templates ?? 0,
          emailsSent: totalSends ?? 0,
          emailsSentThisMonth: monthSends ?? 0,
          connectedSenders: (senderData ?? []).filter((s: any) => s.is_connected).length,
          totalSenders: (senderData ?? []).length,
          openRate,
          clickRate,
          timelineData,
          templateData,
          contactGrowthData,
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
        { label: 'Emails Sent', value: stats.emailsSent.toLocaleString(), icon: <FiMail />, color: 'hsl(38 92% 50%)' },
        { label: 'Avg Open Rate', value: `${stats.openRate}%`, icon: <FiTrendingUp />, color: 'hsl(142 71% 45%)' },
        { label: 'Avg Click Rate', value: `${stats.clickRate}%`, icon: <FiSend />, color: 'hsl(260 80% 60%)' },
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
            <button className="btn btn--primary" onClick={() => navigate('/marketing/campaigns')}>
              <FiSend style={{ marginRight: '0.5rem' }} /> Manage Campaigns
            </button>
            <button className="btn btn--secondary" onClick={() => navigate('/marketing/send')}>
              <FiSend style={{ marginRight: '0.5rem' }} /> Compose Ad-Hoc Email
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

      {/* Analytics Charts (Phase 2 & 3) */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
          
          {/* Engagement Over Time */}
          <div className="page-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Engagement (Last 30 Days)</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={stats.timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickMargin={10} 
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="sends" name="Sent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="opens" name="Opened" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="clicks" name="Clicked" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Top Performing Templates */}
            <div className="page-card" style={{ padding: '1.5rem', flex: 1 }}>
              <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Top Templates (By Open Rate)</h3>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={stats.templateData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" hide />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--secondary))' }}
                      contentStyle={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      formatter={(value: number) => [`${value}%`, 'Open Rate']}
                    />
                    <Bar dataKey="openRate" fill="hsl(142 71% 45%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {stats.templateData.map(t => (
                  <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>
                      {t.name}
                    </span>
                    <span className="text-muted">{t.openRate}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Growth */}
            <div className="page-card" style={{ padding: '1.5rem', flex: 1 }}>
              <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Contact Growth</h3>
              <div style={{ width: '100%', height: 100 }}>
                <ResponsiveContainer>
                  <AreaChart data={stats.contactGrowthData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorContacts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip 
                      contentStyle={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <Area type="monotone" dataKey="newContacts" name="New Contacts" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorContacts)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      )}

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
