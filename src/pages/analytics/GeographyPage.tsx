import { useState, useEffect, useCallback } from 'react';
import { FiGlobe, FiRefreshCw } from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

interface GeoRow {
  country: string;
  city: string;
  users: number;
  sessions: number;
  newUsers: number;
}

interface GeoData {
  countries: { country: string; users: number; sessions: number; pct: number }[];
  cities: GeoRow[];
}

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '28 days', value: '28d' },
  { label: '90 days', value: '90d' },
];

export const GeographyPage = () => {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'countries' | 'cities'>('countries');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?type=geo&range=${range}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load geography data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const topUsers = view === 'countries'
    ? Math.max(...(data?.countries.map(c => c.users) ?? [1]), 1)
    : Math.max(...(data?.cities.map(c => c.users) ?? [1]), 1);

  return (
    <div className="page-content">
      <PageHeader
        title="Geography"
        subtitle="Where your visitors are located"
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

      {/* Top 5 Country Cards */}
      {!loading && data?.countries?.length ? (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {data.countries.slice(0, 5).map((c, i) => (
            <div key={c.country} className="page-card" style={{ flex: 1, minWidth: 140 }}>
              <p style={{ fontSize: '1.6rem', margin: '0 0 0.25rem', fontWeight: 800 }}>#{i + 1}</p>
              <p style={{ fontWeight: 600, margin: 0 }}>{c.country}</p>
              <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>{c.users.toLocaleString()} users · {c.pct.toFixed(1)}%</p>
            </div>
          ))}
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ flex: 1, minWidth: 140, height: 90, borderRadius: 8 }} />)}
        </div>
      ) : null}

      {/* Table */}
      <div className="page-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiGlobe /> Detail
          </h3>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className={`btn btn--sm ${view === 'countries' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setView('countries')}>Countries</button>
            <button className={`btn btn--sm ${view === 'cities' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setView('cities')}>Cities</button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 4 }} />)}
          </div>
        ) : view === 'countries' && data?.countries?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {data.countries.map(row => (
              <div key={row.country} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ minWidth: 160, fontWeight: 500, fontSize: '0.88rem' }}>{row.country}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(row.users / topUsers) * 100}%`, background: 'var(--accent-color)', borderRadius: 4 }} />
                </div>
                <span style={{ minWidth: 80, textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{row.users.toLocaleString()}</span>
                <span className="text-muted" style={{ minWidth: 50, textAlign: 'right', fontSize: '0.8rem' }}>{row.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        ) : view === 'cities' && data?.cities?.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['City', 'Country', 'Users', 'Sessions', 'New Users'].map(h => (
                    <th key={h} style={{ textAlign: h === 'City' || h === 'Country' ? 'left' : 'right', padding: '0.5rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cities.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{row.city}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{row.country}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{row.users.toLocaleString()}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{row.sessions.toLocaleString()}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{row.newUsers.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>No geographic data for this period.</p>
        )}
      </div>
    </div>
  );
};

