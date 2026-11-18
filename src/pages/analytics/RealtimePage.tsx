import { useState, useEffect, useCallback } from 'react';
import {
  FiZap,
  FiRefreshCw,
  FiFileText,
  FiActivity,
  FiGlobe,
  FiSmartphone,
  FiMonitor,
  FiTablet,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

interface RealtimeData {
  activeUsers: number;
  activeUsersLast5: number;
  minuteBars: { minute: number; users: number }[];
  topPages: { page: string; views: number; users: number }[];
  totalPageviews: number;
  topCountries: { country: string; users: number }[];
  topCities: { country: string; city: string; users: number }[];
  topEvents: { eventName: string; count: number }[];
  totalEvents: number;
  deviceBreakdown: { category: string; users: number }[];
  totalDeviceUsers: number;
  topSources: { source: string; users: number }[];
  _debug?: {
    isLive: boolean;
    propertyId?: string;
    error?: string;
  };
}

const deviceIcon = (cat: string) => {
  switch (cat.toLowerCase()) {
    case 'mobile':
      return <FiSmartphone style={{ color: '#6366f1' }} />;
    case 'tablet':
      return <FiTablet style={{ color: '#ec4899' }} />;
    default:
      return <FiMonitor style={{ color: '#22c55e' }} />;
  }
};

export const RealtimePage = () => {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [geoView, setGeoView] = useState<'countries' | 'cities'>('countries');

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

  // Auto-refresh every 15 seconds
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const maxMinuteUsers = Math.max(
    ...(data?.minuteBars?.map((b) => b.users) || [1]),
    1
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Realtime Overview"
        subtitle="Live visitor activity on promptline.app — refreshes every 15s"
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

      {/* Hero: Active Users & Per-Minute Bar Chart */}
      <div className="page-card" style={{ marginBottom: '1.5rem', padding: '1.75rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center' }}>
          {/* Last 30 min count */}
          <div style={{ minWidth: 200 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: 'var(--success-color, #22c55e)',
                  display: 'inline-block',
                  boxShadow: '0 0 10px #22c55e',
                  animation: 'pulse 1.8s infinite',
                }}
              />
              <span
                className="text-muted"
                style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Active in Last 30 Min
              </span>
            </div>
            <p style={{ fontSize: '3.6rem', fontWeight: 800, margin: 0, lineHeight: 1, color: 'var(--accent-color)' }}>
              {loading && !data ? '—' : data?.activeUsers ?? 0}
            </p>
          </div>

          {/* Last 5 min count */}
          <div style={{ minWidth: 160, borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem' }}>
            <span
              className="text-muted"
              style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Active in Last 5 Min
            </span>
            <p style={{ fontSize: '3rem', fontWeight: 700, margin: '0.4rem 0 0', lineHeight: 1 }}>
              {loading && !data ? '—' : data?.activeUsersLast5 ?? 0}
            </p>
          </div>

          {/* 30-Minute Histogram Bars */}
          <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column' }}>
            <span
              className="text-muted"
              style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}
            >
              Active Users Per Minute
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 4,
                height: 75,
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '0.25rem 0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              {data?.minuteBars && data.minuteBars.length > 0 ? (
                data.minuteBars.map((bar, i) => {
                  const pct = (bar.users / maxMinuteUsers) * 100;
                  return (
                    <div
                      key={i}
                      title={`${bar.minute} min ago: ${bar.users} users`}
                      style={{
                        flex: 1,
                        height: '100%',
                        display: 'flex',
                        alignItems: 'flex-end',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.max(pct, bar.users > 0 ? 8 : 2)}%`,
                          background: bar.users > 0 ? 'var(--accent-color, #3b82f6)' : 'rgba(255,255,255,0.06)',
                          borderRadius: '2px 2px 0 0',
                          transition: 'height 0.3s ease',
                        }}
                      />
                    </div>
                  );
                })
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>No per-minute data</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span>-30 min</span>
              <span>-15 min</span>
              <span>-1 min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Realtime Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* 1. Views by Page Title and Screen */}
        <div className="page-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiFileText /> Views by Page Title and Screen
            </h3>
            {data?.totalPageviews ? (
              <span className="badge badge--neutral" style={{ fontSize: '0.75rem' }}>
                {data.totalPageviews} total views
              </span>
            ) : null}
          </div>

          {loading && !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 28, borderRadius: 4 }} />)}
            </div>
          ) : data?.topPages?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.topPages.map((row, i) => {
                const maxViews = Math.max(...data.topPages.map((p) => p.views || p.users), 1);
                const pct = ((row.views || row.users) / maxViews) * 100;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.page}>
                        {row.page}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>
                        {row.views || row.users} {row.views ? 'views' : 'users'}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent-color)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No page views in the last 30 minutes.</p>
          )}
        </div>

        {/* 2. Event Count by Event Name */}
        <div className="page-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiActivity /> Event Count by Event Name
            </h3>
            {data?.totalEvents ? (
              <span className="badge badge--neutral" style={{ fontSize: '0.75rem' }}>
                {data.totalEvents} events
              </span>
            ) : null}
          </div>

          {loading && !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 28, borderRadius: 4 }} />)}
            </div>
          ) : data?.topEvents?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {data.topEvents.map((evt, i) => {
                const maxCount = Math.max(...data.topEvents.map((e) => e.count), 1);
                const pct = (evt.count / maxCount) * 100;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                        {evt.eventName}
                      </span>
                      <span style={{ fontWeight: 600, color: '#22c55e' }}>{evt.count.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#22c55e', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No events recorded in the last 30 minutes.</p>
          )}
        </div>

        {/* 3. Location (Countries & Cities) */}
        <div className="page-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiGlobe /> Active Users by Location
            </h3>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                className={`btn btn--sm ${geoView === 'countries' ? 'btn--primary' : 'btn--ghost'}`}
                style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}
                onClick={() => setGeoView('countries')}
              >
                Countries
              </button>
              <button
                className={`btn btn--sm ${geoView === 'cities' ? 'btn--primary' : 'btn--ghost'}`}
                style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}
                onClick={() => setGeoView('cities')}
              >
                Cities
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 28, borderRadius: 4 }} />)}
            </div>
          ) : geoView === 'countries' && data?.topCountries?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {data.topCountries.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 500 }}>{c.country}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{c.users} users</span>
                </div>
              ))}
            </div>
          ) : geoView === 'cities' && data?.topCities?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {data.topCities.map((city, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span>
                    <strong style={{ fontWeight: 600 }}>{city.city}</strong>
                    <span className="text-muted" style={{ fontSize: '0.78rem', marginLeft: '0.35rem' }}>
                      ({city.country})
                    </span>
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{city.users} users</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No location data right now.</p>
          )}
        </div>

        {/* 4. Device Category Breakdown */}
        <div className="page-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiZap /> Active Users by Device Category
          </h3>

          {loading && !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 28, borderRadius: 4 }} />)}
            </div>
          ) : data?.deviceBreakdown?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.deviceBreakdown.map((dev, i) => {
                const total = data.totalDeviceUsers || data.activeUsers || 1;
                const pct = (dev.users / total) * 100;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'capitalize', fontWeight: 500 }}>
                        {deviceIcon(dev.category)}
                        {dev.category}
                      </span>
                      <span>
                        <strong style={{ fontWeight: 600 }}>{dev.users}</strong>{' '}
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                          ({pct.toFixed(0)}%)
                        </span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#6366f1', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No device data in the last 30 minutes.</p>
          )}
        </div>

        {/* 5. First User Source */}
        <div className="page-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiTrendingUp /> Active Users by First User Source
          </h3>

          {loading && !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 28, borderRadius: 4 }} />)}
            </div>
          ) : data?.topSources?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {data.topSources.map((src, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 500 }}>{src.source || '(direct)'}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{src.users} users</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No acquisition source data right now.</p>
          )}
        </div>

        {/* 6. Active Users by Audience */}
        <div className="page-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiUsers /> Active Users by Audience
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 500 }}>All Users</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>
                {data?.activeUsers ?? 0} (100%)
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '100%', background: 'var(--accent-color)', borderRadius: 3 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
