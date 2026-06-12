import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { useRealtime } from '@/hooks/useRealtime';
import { formatUsd } from '@/types/domain';
import { FiRefreshCw, FiActivity } from 'react-icons/fi';
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

export const DashboardPage = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalBusinesses: 0,
    activeSubscriptions: 0,
    mrrCents: 0,
    totalCallsThisMonth: 0,
    revenueThisMonthCents: 0,
    outstandingCents: 0,
  });
  
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchMetrics = useCallback(async () => {
    try {
      // 1. Get all active tenants
      const { count: tenantCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false);

      // 2. Get billing stats (MRR and active subscriptions)
      const { data: billingData } = await supabase
        .from('tenant_billing')
        .select('status, subscription_amount_cents');

      let activeCount = 0;
      let mrr = 0;
      let outstanding = 0;

      if (billingData) {
        for (const b of billingData) {
          if (b.status === 'active' || b.status === 'trialing') {
            activeCount++;
          }
          if (b.status === 'active' && b.subscription_amount_cents) {
            mrr += b.subscription_amount_cents;
          }
          if (b.status === 'past_due' && b.subscription_amount_cents) {
            outstanding += b.subscription_amount_cents; // Approximation
          }
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

      setMetrics({
        totalBusinesses: tenantCount || 0,
        activeSubscriptions: activeCount,
        mrrCents: mrr,
        totalCallsThisMonth: callCount || 0,
        revenueThisMonthCents: monthlyRevenue,
        outstandingCents: outstanding,
      });
      
      setChartData(formattedChartData);
      setRecentActivity((activityData as unknown as ActivityLog[]) || []);
      setLastUpdated(new Date());

    } catch (error) {
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
              <ResponsiveContainer width="100%" height="100%">
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
    </div>
  );
};
