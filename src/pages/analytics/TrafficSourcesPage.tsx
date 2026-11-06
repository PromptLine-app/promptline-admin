import { useState, useEffect, useCallback } from 'react';
import { FiTrendingUp, FiRefreshCw } from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

interface SourceRow {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  bounceRate: number;
  avgSessionDuration: number;
}

interface TrafficData {
  rows: SourceRow[];
  channelGroups: { channel: string; sessions: number; pct: number }[];
}

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '28 days', value: '28d' },
  { label: '90 days', value: '90d' },
];

const fmtSeconds = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
};

const CHANNEL_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6',
];

export const TrafficSourcesPage = () => {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?type=sources&range=${range}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load traffic sources');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="page-content">
      <PageHeader
        title="Traffic Sources"
        subtitle="Where your visitors are coming from"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {RANGES.map(r => (
              <button
                key={r.value}
                className={`btn btn--sm ${range === r.value ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
            <button className="btn btn--ghost btn--sm" onClick={load}><FiRefreshCw /></button>
          </div>
        }
      />

      {error && (
        <div className="page-card" style={{ borderLeft: '3px solid var(--error-color)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--error-color)', margin: 0 }}>⚠ {error}</p>
        </div>
      )}

      {/* Channel Group Bars */}
      {data?.channelGroups && data.channelGroups.length > 0 && (
        <div className="page-card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem' }}>Channel Breakdown</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.channelGroups.map((ch, idx) => (
              <div key={ch.channel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 500 }}>{ch.channel}</span>
                  <span className="text-muted">{ch.sessions.toLocaleString()} sessions ({ch.pct.toFixed(1)}%)</span>
                </div>
                <div style={{ height: 8, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${ch.pct}%`,
                      background: CHANNEL_COLORS[idx % CHANNEL_COLORS.length],
                      borderRadius: 4,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source / Medium Table */}
      <div className="page-card">
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FiTrendingUp /> Source / Medium Detail
        </h3>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 36, borderRadius: 4 }} />)}
          </div>
        ) : data?.rows?.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['Source', 'Medium', 'Sessions', 'Users', 'Bounce Rate', 'Avg Session'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Source' || h === 'Medium' ? 'left' : 'right', padding: '0.5rem 0.75rem', opacity: 0.65, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', opacity: i === 0 ? 1 : 0.9 }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{row.source || '(direct)'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{row.medium || '(none)'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{row.sessions.toLocaleString()}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{row.users.toLocaleString()}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{row.bounceRate.toFixed(1)}%</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{fmtSeconds(row.avgSessionDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>No traffic source data for this period.</p>
        )}
      </div>
    </div>
  );
};

