import { useState, useEffect, useCallback } from 'react';
import { FiUsers, FiEye, FiClock, FiTrendingUp, FiRefreshCw } from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

// ─── Types ──────────────────────────────────────────────────────────────────

interface KpiData {
  totalUsers: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number; // seconds
  usersDelta: number;         // % vs previous period
  sessionsDelta: number;
}

interface DailyRow {
  date: string;      // 'YYYYMMDD'
  users: number;
  sessions: number;
  pageviews: number;
}

interface OverviewData {
  kpis: KpiData;
  timeseries: DailyRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtSeconds = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
};

const fmtNum = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : String(n);

const deltaColor = (d: number) =>
  d > 0 ? 'var(--success-color)' : d < 0 ? 'var(--error-color)' : 'var(--text-muted)';

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '28 days', value: '28d' },
  { label: '90 days', value: '90d' },
];

// ─── Simple bar-chart using CSS ──────────────────────────────────────────────

const BarChart = ({ data, field }: { data: DailyRow[]; field: 'users' | 'sessions' | 'pageviews' }) => {
  const max = Math.max(...data.map(d => d[field]), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, marginTop: '1rem' }}>
      {data.map(row => {
        const pct = (row[field] / max) * 100;
        const dateLabel = `${row.date.slice(4, 6)}/${row.date.slice(6, 8)}`;
        return (
          <div
            key={row.date}
            title={`${dateLabel}: ${row[field].toLocaleString()}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
          >
            <div
              style={{
                width: '100%',
                height: `${pct}%`,
                minHeight: 2,
                background: 'var(--accent-color)',
                borderRadius: '3px 3px 0 0',
                opacity: 0.8,
                transition: 'height 0.4s ease',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KpiCard = ({
  label,
  value,
  delta,
  icon,
  sub,
}: {
  label: string;
  value: string;
  delta?: number;
  icon: React.ReactNode;
  sub?: string;
}) => (
  <div className="page-card" style={{ flex: 1, minWidth: 160 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
      <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ opacity: 0.4, fontSize: '1.1rem' }}>{icon}</span>
    </div>
    <p style={{ fontSize: '1.9rem', fontWeight: 700, margin: 0, lineHeight: 1 }}>{value}</p>
    {delta !== undefined && (
      <p style={{ fontSize: '0.8rem', margin: '0.3rem 0 0', color: deltaColor(delta) }}>
        {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}% vs prev period
      </p>
    )}
    {sub && <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0.25rem 0 0' }}>{sub}</p>}
  </div>
);

// ─── Page ────────────────────────────────────────────────────────────────────

export const AnalyticsDashboardPage = () => {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartField, setChartField] = useState<'users' | 'sessions' | 'pageviews'>('users');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?type=overview&range=${range}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const kpis = data?.kpis;

  return (
    <div className="page-content">
      <PageHeader
        title="Analytics Dashboard"
        subtitle="Website traffic overview powered by Google Analytics 4"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {RANGES.map(r => (
              <button
                key={r.value}
                className={`btn btn--sm ${range === r.value ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
            <button className="btn btn--ghost btn--sm" onClick={load} title="Refresh">
              <FiRefreshCw />
            </button>
          </div>
        }
      />

      {error && (
        <div className="page-card" style={{ borderLeft: '3px solid var(--error-color)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--error-color)', margin: 0, fontWeight: 600 }}>⚠ {error}</p>
          <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.4rem 0 0' }}>
            Make sure the Analytics API serverless function is deployed and GA_PROPERTY_ID, GA_CLIENT_EMAIL, GA_PRIVATE_KEY env vars are set in Vercel.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <KpiCard
          label="Total Users"
          value={loading ? '—' : fmtNum(kpis?.totalUsers ?? 0)}
          delta={loading ? undefined : kpis?.usersDelta}
          icon={<FiUsers />}
        />
        <KpiCard
          label="New Users"
          value={loading ? '—' : fmtNum(kpis?.newUsers ?? 0)}
          icon={<FiTrendingUp />}
        />
        <KpiCard
          label="Sessions"
          value={loading ? '—' : fmtNum(kpis?.sessions ?? 0)}
          delta={loading ? undefined : kpis?.sessionsDelta}
          icon={<FiEye />}
        />
        <KpiCard
          label="Avg Session"
          value={loading ? '—' : fmtSeconds(kpis?.avgSessionDuration ?? 0)}
          icon={<FiClock />}
        />
        <KpiCard
          label="Bounce Rate"
          value={loading ? '—' : `${(kpis?.bounceRate ?? 0).toFixed(1)}%`}
          icon={<FiTrendingUp />}
        />
        <KpiCard
          label="Pageviews"
          value={loading ? '—' : fmtNum(kpis?.pageviews ?? 0)}
          icon={<FiEye />}
        />
      </div>

      {/* Chart */}
      <div className="page-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Traffic Over Time</h3>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['users', 'sessions', 'pageviews'] as const).map(f => (
              <button
                key={f}
                className={`btn btn--sm ${chartField === f ? 'btn--primary' : 'btn--ghost'}`}
                style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}
                onClick={() => setChartField(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ height: 120, background: 'var(--skeleton-bg)', borderRadius: 6 }} className="skeleton" />
        ) : data?.timeseries && data.timeseries.length > 0 ? (
          <BarChart data={data.timeseries} field={chartField} />
        ) : (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>No timeseries data available.</p>
        )}
      </div>

      {/* Stream Info */}
      <div className="page-card" style={{ background: 'var(--surface-2, var(--card-bg))' }}>
        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>
          GA4 Stream Info
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'Property', value: 'Promptline Marketing Website' },
            { label: 'Stream URL', value: 'https://promptline.app' },
            { label: 'Stream ID', value: '16279944223' },
            { label: 'Measurement ID', value: 'G-QC5T423V41' },
          ].map(item => (
            <div key={item.label}>
              <p className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600, margin: 0 }}>{item.label}</p>
              <p style={{ fontSize: '0.88rem', margin: '0.15rem 0 0', fontFamily: 'monospace' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

