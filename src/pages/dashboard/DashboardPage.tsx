import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useRealtime } from '@/hooks/useRealtime';
import { formatUsd, getPlanOption } from '@/types/domain';
import { reportError } from '@/lib/sentry';
import { FiRefreshCw, FiActivity, FiAlertTriangle, FiArrowRight, FiUserPlus, FiMail } from 'react-icons/fi';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import './dashboard.css';

type DashboardMetrics = {
  totalBusinesses: number;
  activeSubscriptions: number;
  mrrCents: number;
  totalCallsThisMonth: number;
  revenueThisMonthCents: number;
  outstandingCents: number;
  // Funnel
  totalSignups: number;
  onboardedCount: number;
  planSelectedCount: number;
  activePayingCount: number;
  // Health / dunning
  pastDueCount: number;
  suspendedCount: number;
};

type ChartDataPoint = {
  date: string;
  revenue: number;
};

type ActivityLog = {
  id: string;
  action: string;
  created_at: string;
  admin_user: { full_name: string; email: string } | null;
};

type NoPlanTenant = {
  id: string;
  company_name: string | null;
  created_at: string;
  onboarded: boolean;
  billing_status: string | null;
};

type ContactLead = {
  id: string;
  full_name: string | null;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  query_summary: string | null;
  created_at: string;
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalBusinesses: 0,
    activeSubscriptions: 0,
    mrrCents: 0,
    totalCallsThisMonth: 0,
    revenueThisMonthCents: 0,
    outstandingCents: 0,
    totalSignups: 0,
    onboardedCount: 0,
    planSelectedCount: 0,
    activePayingCount: 0,
    pastDueCount: 0,
    suspendedCount: 0,
  });
  
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [noPlan, setNoPlan] = useState<NoPlanTenant[]>([]);
  const [leads, setLeads] = useState<ContactLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchMetrics = useCallback(async () => {
    try {
      // 1. Get all active tenants
      const { count: tenantCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false);

      // 1b. Funnel: total signups (incl. disabled) and onboarded count.
      const { count: totalSignups } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true });
      const { count: onboardedCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('onboarded', true);

      // 2. Get billing stats (MRR, active subscriptions, funnel, dunning)
      const { data: billingData } = await supabase
        .from('tenant_billing')
        .select('tenant_id, status, subscription_amount_cents, plan_tier');

      // Recurring base per tenant from their latest succeeded subscription charge
      // (subtotal minus overage, i.e. plan price ex-tax). Used as the last-resort
      // MRR source when the billing record has neither an amount nor a plan_tier.
      const { data: subCharges } = await supabase
        .from('tenant_billing_charges')
        .select('tenant_id, subtotal_cents, overage_cents, created_at')
        .eq('status', 'succeeded')
        .eq('kind', 'subscription')
        .order('created_at', { ascending: false });

      const recurringByTenant = new Map<string, number>();
      (subCharges || []).forEach((c) => {
        if (!recurringByTenant.has(c.tenant_id)) {
          recurringByTenant.set(c.tenant_id, Math.max(0, (c.subtotal_cents || 0) - (c.overage_cents || 0)));
        }
      });

      let activeCount = 0;
      let mrr = 0;
      let outstanding = 0;
      let planSelectedCount = 0;
      let activePayingCount = 0;
      let pastDueCount = 0;
      let suspendedCount = 0;

      // A billing record's monthly value: prefer the stored amount, but fall back
      // to the canonical plan price when subscription_amount_cents is missing
      // (some active records were never stamped with an amount).
      const billedStates = ['active', 'past_due', 'suspended'];
      const monthlyCents = (b: {
        tenant_id: string;
        subscription_amount_cents: number | null;
        plan_tier: string | null;
      }) =>
        b.subscription_amount_cents ||
        getPlanOption(b.plan_tier)?.amountCents ||
        recurringByTenant.get(b.tenant_id) ||
        0;

      if (billingData) {
        for (const b of billingData) {
          if (b.status === 'active' || b.status === 'trialing') {
            activeCount++;
          }
          if (b.status === 'active') {
            mrr += monthlyCents(b);
          }
          if (b.status === 'past_due') {
            outstanding += monthlyCents(b); // Approximation
          }
          // "Plan selected" must be a superset of "active paying": any tenant in a
          // billed state has progressed past plan selection even if plan_tier is
          // unset, so the funnel stays monotonic.
          if (b.plan_tier || billedStates.includes(b.status)) planSelectedCount++;
          if (b.status === 'active') activePayingCount++;
          if (b.status === 'past_due') pastDueCount++;
          if (b.status === 'suspended') suspendedCount++;
        }
      }

      // 3. Get current month's dates for KPIs
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { count: callCount } = await supabase
        .from('interactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth);

      // 4. Get last 30 days of charges for the chart and monthly KPI
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: chargesData } = await supabase
        .from('tenant_billing_charges')
        .select('amount_cents, created_at')
        .eq('status', 'succeeded')
        .gte('created_at', thirtyDaysAgo.toISOString());

      let monthlyRevenue = 0;
      
      // Bucket data by day for the chart
      const dailyBuckets: Record<string, number> = {};
      
      // Initialize last 30 days with 0
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dailyBuckets[dateStr] = 0;
      }

      if (chargesData) {
        chargesData.forEach(charge => {
          const dateStr = new Date(charge.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const amount = (charge.amount_cents || 0) / 100; // Convert to dollars for chart
          
          if (dailyBuckets[dateStr] !== undefined) {
            dailyBuckets[dateStr] += amount;
          }

          // Also calculate the KPI for exactly this month
          if (charge.created_at >= startOfMonth) {
            monthlyRevenue += (charge.amount_cents || 0);
          }
        });
      }

      const formattedChartData = Object.entries(dailyBuckets).map(([date, revenue]) => ({
        date,
        revenue: Number(revenue.toFixed(2))
      }));

      // 5. Fetch recent activity logs
      const { data: activityData } = await supabase
        .from('admin_activity_log')
        .select(`
          id, action, created_at,
          admin_user:admin_users(full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(6);

      // 6. Customers who signed up but never chose a plan: no plan_tier and not in
      // a billed state (covers both "no billing row" and "pending, no plan").
      const planInfo = new Map<string, { status: string; plan_tier: string | null }>();
      (billingData || []).forEach((b) =>
        planInfo.set(b.tenant_id, { status: b.status, plan_tier: b.plan_tier }),
      );

      const { data: tenantList } = await supabase
        .from('tenants')
        .select('id, company_name, created_at, onboarded')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      const noPlanRows: NoPlanTenant[] = (tenantList || [])
        .filter((t: any) => {
          const info = planInfo.get(t.id);
          const hasPlan = !!info && (!!info.plan_tier || billedStates.includes(info.status));
          return !hasPlan;
        })
        .map((t: any) => ({
          id: t.id,
          company_name: t.company_name,
          created_at: t.created_at,
          onboarded: !!t.onboarded,
          billing_status: planInfo.get(t.id)?.status ?? null,
        }));

      // 7. Latest "Contact Sales" leads (marketing-site submissions). Read via the
      // service-role client (the table has no RLS SELECT policy for clients).
      const { data: leadData } = await supabase
        .from('contact_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      setMetrics({
        totalBusinesses: tenantCount || 0,
        activeSubscriptions: activeCount,
        mrrCents: mrr,
        totalCallsThisMonth: callCount || 0,
        revenueThisMonthCents: monthlyRevenue,
        outstandingCents: outstanding,
        totalSignups: totalSignups || 0,
        onboardedCount: onboardedCount || 0,
        planSelectedCount,
        activePayingCount,
        pastDueCount,
        suspendedCount,
      });
      
      setChartData(formattedChartData);
      setRecentActivity((activityData as unknown as ActivityLog[]) || []);
      setNoPlan(noPlanRows);
      setLeads((leadData as ContactLead[]) || []);
      setLastUpdated(new Date());

    } catch (error) {
      reportError(error, { where: 'DashboardPage.fetchMetrics' });
      console.error('Error fetching dashboard metrics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Real-time updates
  useRealtime({ table: 'tenants', event: '*', onUpdate: fetchMetrics });
  useRealtime({ table: 'tenant_billing', event: '*', onUpdate: fetchMetrics });
  useRealtime({ table: 'tenant_billing_charges', event: '*', onUpdate: fetchMetrics });
  useRealtime({ table: 'admin_activity_log', event: '*', onUpdate: fetchMetrics });
  useRealtime({
    table: 'interactions',
    event: 'INSERT',
    onUpdate: () => {
      setMetrics((prev) => ({ ...prev, totalCallsThisMonth: prev.totalCallsThisMonth + 1 }));
      setLastUpdated(new Date());
    },
  });

  const noPlanColumns: ColumnDef<NoPlanTenant>[] = [
    {
      header: 'Business',
      id: 'company_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{row.company_name || 'Unnamed Business'}</p>
          <p className="text-muted" style={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>{row.id}</p>
        </div>
      ),
    },
    { header: 'Signed Up', id: 'created_at', cell: (row) => new Date(row.created_at).toLocaleDateString() },
    {
      header: 'Onboarded',
      id: 'onboarded',
      cell: (row) =>
        row.onboarded ? <StatusBadge status="active" label="Yes" /> : <StatusBadge status="pending" label="No" />,
    },
    {
      header: 'Billing',
      id: 'billing_status',
      cell: (row) =>
        row.billing_status ? <StatusBadge status={row.billing_status} /> : <span className="text-muted">No billing</span>,
    },
  ];

  const leadColumns: ColumnDef<ContactLead>[] = [
    { header: 'Received', id: 'created_at', cell: (row) => new Date(row.created_at).toLocaleString() },
    { header: 'Name', id: 'full_name', cell: (row) => row.full_name || '—' },
    { header: 'Business', id: 'business_name', cell: (row) => row.business_name || '—' },
    {
      header: 'Email',
      id: 'business_email',
      cell: (row) =>
        row.business_email ? (
          <a href={`mailto:${row.business_email}`} onClick={(e) => e.stopPropagation()}>
            {row.business_email}
          </a>
        ) : (
          '—'
        ),
    },
    {
      header: 'Phone',
      id: 'business_phone',
      cell: (row) =>
        row.business_phone ? (
          <a href={`tel:${row.business_phone}`} onClick={(e) => e.stopPropagation()}>
            {row.business_phone}
          </a>
        ) : (
          '—'
        ),
    },
    {
      header: 'Summary',
      id: 'query_summary',
      sortable: false,
      cell: (row) =>
        row.query_summary ? (
          <span title={row.query_summary}>
            {row.query_summary.length > 60 ? `${row.query_summary.slice(0, 60)}…` : row.query_summary}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Platform Overview"
        subtitle={`Live metrics across all PromptLine businesses. Last updated at ${lastUpdated.toLocaleTimeString()}`}
        actions={
          <button onClick={fetchMetrics} className="btn btn--secondary" disabled={loading}>
            <FiRefreshCw className={loading ? 'fa-spin' : ''} /> Refresh
          </button>
        }
      />

      {(metrics.pastDueCount > 0 || metrics.suspendedCount > 0) && (
        <Link
          to="/dunning"
          className="page-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            borderLeft: '4px solid hsl(var(--destructive))',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <FiAlertTriangle style={{ color: 'hsl(var(--destructive))', fontSize: '1.4rem', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600 }}>
              {metrics.pastDueCount + metrics.suspendedCount} subscription
              {metrics.pastDueCount + metrics.suspendedCount === 1 ? '' : 's'} need attention
            </p>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              {metrics.pastDueCount} past due · {metrics.suspendedCount} suspended — review the dunning queue to recover revenue.
            </p>
          </div>
          <FiArrowRight />
        </Link>
      )}

      <section className="dashboard-section">
        <div className="dashboard-kpi-row">
          <KpiCard
            label="Total Businesses"
            value={metrics.totalBusinesses}
            loading={loading}
          />
          <KpiCard
            label="Active Subscriptions"
            value={metrics.activeSubscriptions}
            loading={loading}
          />
          <KpiCard
            label="Monthly Recurring Revenue"
            value={formatUsd(metrics.mrrCents)}
            variant="primary"
            loading={loading}
          />
        </div>

        <div className="dashboard-kpi-row">
          <KpiCard
            label="Calls This Month"
            value={metrics.totalCallsThisMonth.toLocaleString()}
            loading={loading}
          />
          <KpiCard
            label="Revenue Collected (This Month)"
            value={formatUsd(metrics.revenueThisMonthCents)}
            variant="success"
            loading={loading}
          />
          <KpiCard
            label="Outstanding Balance"
            value={formatUsd(metrics.outstandingCents)}
            variant={metrics.outstandingCents > 0 ? 'destructive' : 'default'}
            loading={loading}
          />
        </div>
      </section>

      {/* ONBOARDING FUNNEL */}
      <section className="dashboard-section">
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Onboarding Funnel</h3>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            {[
              { label: 'Signed Up', value: metrics.totalSignups },
              { label: 'Onboarded', value: metrics.onboardedCount },
              { label: 'Plan Selected', value: metrics.planSelectedCount },
              { label: 'Active Paying', value: metrics.activePayingCount },
            ].map((stage) => {
              const pct = metrics.totalSignups > 0 ? Math.round((stage.value / metrics.totalSignups) * 100) : 0;
              return (
                <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span className="text-muted" style={{ width: '120px', flexShrink: 0, fontSize: '0.85rem' }}>
                    {stage.label}
                  </span>
                  <div style={{ flex: 1, background: 'hsl(var(--muted))', borderRadius: '6px', height: '1.6rem', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        minWidth: stage.value > 0 ? '2rem' : 0,
                        height: '100%',
                        background: 'hsl(var(--primary))',
                        borderRadius: '6px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <span style={{ width: '90px', textAlign: 'right', fontWeight: 600, fontSize: '0.9rem' }}>
                    {stage.value.toLocaleString()} <span className="text-muted" style={{ fontWeight: 400 }}>({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="dashboard-chart-grid">
        {/* REVENUE CHART */}
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Revenue Trend (Last 30 Days)</h3>
          </div>
          <div className="chart-container" style={{ height: '300px', width: '100%', marginTop: '1rem' }}>
            {loading ? (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                <p className="text-muted">Loading chart...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    minTickGap={20}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                    formatter={(val: number) => [`$${val.toFixed(2)}`, 'Revenue']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorRev)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* RECENT ACTIVITY */}
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Recent Activity</h3>
          </div>
          <div className="dashboard-feed" style={{ marginTop: '1rem' }}>
            {loading ? (
              <p className="text-muted">Loading activity...</p>
            ) : recentActivity.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <p className="empty-state__text">No recent activity.</p>
              </div>
            ) : (
              recentActivity.map((log) => {
                const adminName = log.admin_user?.full_name || log.admin_user?.email || 'Unknown';
                const timeAgo = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                return (
                  <div key={log.id} className="feed-item">
                    <div className="feed-item__icon">
                      <FiActivity />
                    </div>
                    <div className="feed-item__content">
                      <p style={{ fontWeight: 500 }}>{adminName}</p>
                      <p className="text-muted" style={{ textTransform: 'capitalize' }}>
                        {log.action.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="feed-item__time">{timeAgo}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* SIGNED UP — NO PLAN YET (#6) */}
      <section className="dashboard-section">
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">
              <FiUserPlus style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              Signed Up · No Plan Yet
            </h3>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              {noPlan.length} {noPlan.length === 1 ? 'customer' : 'customers'}
            </span>
          </div>
          {loading ? (
            <p className="text-muted" style={{ marginTop: '1rem' }}>
              Loading…
            </p>
          ) : (
            <DataTable
              data={noPlan}
              columns={noPlanColumns}
              onRowClick={(row) => navigate(`/businesses/${row.id}`)}
              emptyMessage="Every signed-up customer has chosen a plan."
            />
          )}
        </div>
      </section>

      {/* CONTACT SALES LEADS (#7) */}
      <section className="dashboard-section">
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">
              <FiMail style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              Contact Sales Leads
            </h3>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              {leads.length} recent
            </span>
          </div>
          {loading ? (
            <p className="text-muted" style={{ marginTop: '1rem' }}>
              Loading…
            </p>
          ) : (
            <DataTable data={leads} columns={leadColumns} emptyMessage="No contact-sales submissions yet." />
          )}
        </div>
      </section>
    </div>
  );
};
