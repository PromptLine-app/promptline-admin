import { useState, useEffect, useCallback } from 'react';
import { FiZap, FiRefreshCw, FiUsers } from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

interface RealtimeData {
  activeUsers: number;
  topPages: { page: string; users: number }[];
  topCountries: { country: string; users: number }[];
  deviceBreakdown: { category: string; users: number }[];
}

export const RealtimePage = () => {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics?type=realtime');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || `HTTP ${res.status}`);
      }
      setData(await res.json());
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load realtime data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="page-content">
      <PageHeader
        title="Realtime Activity"
        subtitle="Live visitor activity on promptline.app — refreshes every 30s"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {lastUpdated && (
              <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button className="btn btn--ghost btn--sm" onClick={load} title="Refresh now">
              <FiRefreshCw /> Refresh
            </button>
          </div>
        }
      />

      {error && (
        <div className="page-card" style={{ borderLeft: '3px solid var(--error-color)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--error-color)', margin: 0 }}>⚠ {error}</p>
        </div>
      )}

      {/* Active Users Hero */}
      <div className="page-card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success-color)', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
          <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active Right Now
          </span>
        </div>
        <p style={{ fontSize: '4rem', fontWeight: 800, margin: 0, lineHeight: 1, color: 'var(--accent-color)' }}>
          {loading ? '—' : (data?.activeUsers ?? 0)}
        </p>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>users on the site</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {/* Top Pages */}
        <div className="page-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiUsers /> Active Pages
          </h3>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 24, borderRadius: 4 }} />)}
            </div>
          ) : data?.topPages?.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: '0.4rem', opacity: 0.6, fontWeight: 600 }}>Page</th>
                  <th style={{ textAlign: 'right', paddingBottom: '0.4rem', opacity: 0.6, fontWeight: 600 }}>Users</th>
                </tr>
              </thead>
              <tbody>
                {data.topPages.map(row => (
                  <tr key={row.page}>
                    <td style={{ padding: '0.3rem 0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.page}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-color)' }}>{row.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No active pages right now.</p>
          )}
        </div>

        {/* Top Countries */}
        <div className="page-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiZap /> Top Countries
          </h3>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 24, borderRadius: 4 }} />)}
            </div>
          ) : data?.topCountries?.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: '0.4rem', opacity: 0.6, fontWeight: 600 }}>Country</th>
                  <th style={{ textAlign: 'right', paddingBottom: '0.4rem', opacity: 0.6, fontWeight: 600 }}>Users</th>
                </tr>
              </thead>
              <tbody>
                {data.topCountries.map(row => (
                  <tr key={row.country}>
                    <td style={{ padding: '0.3rem 0' }}>{row.country}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-color)' }}>{row.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No country data right now.</p>
          )}
        </div>
      </div>
    </div>
  );
};

