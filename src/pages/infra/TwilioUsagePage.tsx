import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { reportError } from '@/lib/sentry';
import {
  FiRefreshCw,
  FiDollarSign,
  FiCalendar,
  FiLayers,
  FiArrowLeft,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';

/* ── Colour palette for charts ── */
const CHART_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
];

/* ── Types ── */
interface UsageRecord {
  category: string;
  description: string;
  price: number;
  count: number;
  countUnit: string;
  startDate: string;
  endDate: string;
  accountLabel: string;
}

interface CategoryBreakdown {
  category: string;
  description: string;
  totalPrice: number;
  count: number;
}

interface AccountBreakdown {
  accountSid: string;
  accountLabel: string;
  totalPrice: number;
}

interface TwilioSpendData {
  spendLimit: number;
  totalAccumulated: number;
  recordCount: number;
  dateRange: { from: string; to: string } | null;
  categoryBreakdown: CategoryBreakdown[];
  accountBreakdown: AccountBreakdown[];
  subaccounts: Array<{ sid: string; label: string }>;
  recentRecords: UsageRecord[];
}

/* ── Helpers ── */

/** Formats a Twilio category slug into a readable label */
function formatCategory(cat: string): string {
  return cat
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ── Custom tooltip for pie chart ── */
const PieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const { name, value, payload: full } = payload[0];
    return (
      <div
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          fontSize: '0.85rem',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{name}</p>
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>
          {formatUSD(value)} ({full.percent}%)
        </p>
      </div>
    );
  }
  return null;
};

/* ── Component ── */

export const TwilioUsagePage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<TwilioSpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        'fetch-twilio-recent-spend',
        { body: { spendLimit: 50 } },
      );
      if (fnError) throw fnError;
      setData(result as TwilioSpendData);
    } catch (err: any) {
      reportError(err, { where: 'TwilioUsagePage.fetchData' });
      console.error('Error fetching Twilio spend:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* ── Derived chart data ── */
  const pieData = (data?.categoryBreakdown || []).map((c) => ({
    name: formatCategory(c.category),
    value: c.totalPrice,
    percent: data
      ? ((c.totalPrice / data.totalAccumulated) * 100).toFixed(1)
      : '0',
  }));

  const barData = (data?.accountBreakdown || []).map((a) => ({
    name: a.accountLabel,
    spend: a.totalPrice,
  }));

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <PageHeader
        title="Twilio Spend Tracker"
        subtitle={
          data
            ? `Tracking the last $${data.spendLimit} of Twilio spend across all accounts`
            : 'Loading Twilio usage data…'
        }
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn--secondary"
              onClick={() => navigate('/infra/services')}
            >
              <FiArrowLeft /> Services
            </button>
            <button
              className="btn btn--secondary"
              onClick={fetchData}
              disabled={loading}
            >
              <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      {/* ── Loading ── */}
      {loading && !data && (
        <div className="page-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <FiDollarSign
            size={40}
            style={{
              color: 'hsl(var(--muted-foreground))',
              marginBottom: '1rem',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <p className="text-muted">
            Querying Twilio for usage records across all accounts…
          </p>
          <p
            className="text-muted"
            style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}
          >
            This may take a few seconds.
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !data && (
        <div
          className="page-card"
          style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}
        >
          <p>Failed to load Twilio spend data.</p>
          <p
            style={{
              marginTop: '0.5rem',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </p>
        </div>
      )}

      {/* ── Main Content ── */}
      {data && (
        <>
          {/* KPI Row */}
          <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="kpi-card">
              <p className="kpi-card__label">Total Accumulated</p>
              <p className="kpi-card__value" style={{ color: '#6366f1' }}>
                {formatUSD(data.totalAccumulated)}
              </p>
              <p className="kpi-card__meta">
                of ${data.spendLimit} tracking limit
              </p>
            </div>
            <div className="kpi-card">
              <p className="kpi-card__label">Accounts</p>
              <p className="kpi-card__value">
                {data.accountBreakdown.length}
              </p>
              <p className="kpi-card__meta">
                {data.subaccounts.length === 1
                  ? 'Main account only'
                  : `Main + ${data.subaccounts.length - 1} subaccount${
                      data.subaccounts.length - 1 > 1 ? 's' : ''
                    }`}
              </p>
            </div>
            <div className="kpi-card">
              <p className="kpi-card__label">Categories</p>
              <p className="kpi-card__value">
                {data.categoryBreakdown.length}
              </p>
              <p className="kpi-card__meta">unique usage categories</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-card__label">
                <FiCalendar style={{ marginRight: '0.3rem', verticalAlign: '-2px' }} />
                Date Range
              </p>
              <p className="kpi-card__value" style={{ fontSize: '1.1rem' }}>
                {data.dateRange
                  ? `${formatDate(data.dateRange.from)} – ${formatDate(
                      data.dateRange.to,
                    )}`
                  : '—'}
              </p>
              <p className="kpi-card__meta">period covered</p>
            </div>
          </div>

          {/* Charts Row */}
          <div
            className="split-grid"
            style={{ marginBottom: '1.5rem' }}
          >
            {/* Pie: Category Breakdown */}
            <div className="page-card" style={{ padding: '1.5rem' }}>
              <div className="page-card__header">
                <h3 className="page-card__title">
                  <FiLayers
                    style={{ marginRight: '0.4rem', verticalAlign: '-2px' }}
                  />
                  Spend by Category
                </h3>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {pieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.6rem',
                  marginTop: '0.75rem',
                  justifyContent: 'center',
                }}
              >
                {pieData.map((entry, i) => (
                  <span
                    key={entry.name}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.75rem',
                      color: 'hsl(var(--muted-foreground))',
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: CHART_COLORS[i % CHART_COLORS.length],
                        display: 'inline-block',
                      }}
                    />
                    {entry.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Bar: Account Breakdown */}
            <div className="page-card" style={{ padding: '1.5rem' }}>
              <div className="page-card__header">
                <h3 className="page-card__title">
                  <FiDollarSign
                    style={{ marginRight: '0.4rem', verticalAlign: '-2px' }}
                  />
                  Spend by Account
                </h3>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatUSD(v), 'Spend']}
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="spend"
                      fill="#6366f1"
                      radius={[0, 6, 6, 0]}
                      name="Spend ($)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Category Breakdown Table */}
          <div className="page-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="page-card__header">
              <h3 className="page-card__title">Category Breakdown</h3>
              <span
                className="text-muted"
                style={{ fontSize: '0.8rem' }}
              >
                {data.categoryBreakdown.length} categories
              </span>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Total Spend</th>
                    <th style={{ textAlign: 'right' }}>% of Total</th>
                    <th style={{ textAlign: 'right' }}>Usage Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categoryBreakdown.map((c) => {
                    const pct =
                      data.totalAccumulated > 0
                        ? ((c.totalPrice / data.totalAccumulated) * 100).toFixed(
                            1,
                          )
                        : '0.0';
                    return (
                      <tr key={c.category}>
                        <td style={{ fontWeight: 600 }}>
                          {formatCategory(c.category)}
                        </td>
                        <td
                          className="text-muted"
                          style={{ fontSize: '0.8rem' }}
                        >
                          {c.description}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 600,
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          {formatUSD(c.totalPrice)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '0.5rem',
                            }}
                          >
                            <div
                              style={{
                                width: '60px',
                                height: '6px',
                                background: 'hsl(var(--border))',
                                borderRadius: '3px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, parseFloat(pct))}%`,
                                  height: '100%',
                                  background: '#6366f1',
                                  borderRadius: '3px',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '0.82rem' }}>{pct}%</span>
                          </div>
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          {c.count.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Records Table */}
          <div className="page-card" style={{ padding: '1.5rem' }}>
            <div className="page-card__header">
              <h3 className="page-card__title">Recent Usage Records</h3>
              <span
                className="text-muted"
                style={{ fontSize: '0.8rem' }}
              >
                Showing top {Math.min(50, data.recentRecords.length)} of{' '}
                {data.recordCount} records
              </span>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date Range</th>
                    <th>Account</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Count</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRecords.map((r, i) => (
                    <tr key={`${r.category}-${r.startDate}-${r.accountLabel}-${i}`}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        {formatDate(r.startDate)} – {formatDate(r.endDate)}
                      </td>
                      <td>
                        <span
                          className="status-badge status-badge--trialing"
                          style={{ fontSize: '0.72rem' }}
                        >
                          {r.accountLabel}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {formatCategory(r.category)}
                      </td>
                      <td
                        className="text-muted"
                        style={{ fontSize: '0.8rem', maxWidth: '250px' }}
                      >
                        {r.description}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {r.count.toLocaleString()} {r.countUnit}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono, monospace)',
                          color: r.price > 1 ? '#ef4444' : undefined,
                        }}
                      >
                        {formatUSD(r.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
