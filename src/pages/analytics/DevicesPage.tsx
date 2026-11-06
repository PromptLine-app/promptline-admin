import { useState, useEffect, useCallback } from 'react';
import { FiSmartphone, FiMonitor, FiTablet, FiRefreshCw } from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

interface DeviceCategory {
  category: 'desktop' | 'mobile' | 'tablet';
  users: number;
  sessions: number;
  pct: number;
}

interface ItemBreakdown {
  name: string;
  users: number;
  sessions: number;
  pct: number;
}

interface DevicesData {
  categories: DeviceCategory[];
  browsers: ItemBreakdown[];
  operatingSystems: ItemBreakdown[];
}

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '28 days', value: '28d' },
  { label: '90 days', value: '90d' },
];

const categoryIcon = (cat: string) => {
  switch (cat.toLowerCase()) {
    case 'mobile':
      return <FiSmartphone style={{ fontSize: '1.5rem', color: '#6366f1' }} />;
    case 'tablet':
      return <FiTablet style={{ fontSize: '1.5rem', color: '#ec4899' }} />;
    default:
      return <FiMonitor style={{ fontSize: '1.5rem', color: '#22c55e' }} />;
  }
};

export const DevicesPage = () => {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState<DevicesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?type=devices&range=${range}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load device data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="page-content">
      <PageHeader
        title="Devices & Technology"
        subtitle="Hardware, operating systems, and browsers used by your visitors"
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
            <button className="btn btn--ghost btn--sm" onClick={load} title="Refresh">
              <FiRefreshCw />
            </button>
          </div>
        }
      />

      {error && (
        <div className="page-card" style={{ borderLeft: '3px solid var(--error-color)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--error-color)', margin: 0 }}>⚠ {error}</p>
        </div>
      )}

      {/* Device Category Cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="skeleton" style={{ flex: 1, minWidth: 200, height: 110, borderRadius: 8 }} />)
        ) : data?.categories?.length ? (
          data.categories.map(cat => (
            <div key={cat.category} className="page-card" style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '1rem' }}>{cat.category}</span>
                {categoryIcon(cat.category)}
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
                  {cat.pct.toFixed(1)}%
                </p>
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
                  {cat.users.toLocaleString()} users · {cat.sessions.toLocaleString()} sessions
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="page-card" style={{ width: '100%' }}>
            <p className="text-muted">No device category data available.</p>
          </div>
        )}
      </div>

      {/* Browsers & Operating Systems Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Browsers */}
        <div className="page-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Web Browsers</h3>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 32, borderRadius: 4 }} />)}
            </div>
          ) : data?.browsers?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.browsers.map(b => (
                <div key={b.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>{b.name}</span>
                    <span className="text-muted">{b.users.toLocaleString()} users ({b.pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${b.pct}%`, background: '#3b82f6', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">No browser data found.</p>
          )}
        </div>

        {/* Operating Systems */}
        <div className="page-card">
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Operating Systems</h3>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 32, borderRadius: 4 }} />)}
            </div>
          ) : data?.operatingSystems?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.operatingSystems.map(os => (
                <div key={os.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>{os.name}</span>
                    <span className="text-muted">{os.users.toLocaleString()} users ({os.pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${os.pct}%`, background: '#10b981', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">No operating system data found.</p>
          )}
        </div>
      </div>
    </div>
  );
};

