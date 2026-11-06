import { useState, useEffect, useCallback, useMemo } from 'react';
import { FiFileText, FiRefreshCw, FiExternalLink, FiSearch } from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

interface PageRow {
  path: string;
  title: string;
  views: number;
  users: number;
  avgDurationSec: number;
  bounceRate: number;
}

interface PagesData {
  rows: PageRow[];
  totalViews: number;
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

export const TopPagesPage = () => {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState<PagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?type=pages&range=${range}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load page views');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(
      r => r.path.toLowerCase().includes(q) || (r.title && r.title.toLowerCase().includes(q))
    );
  }, [data, search]);

  return (
    <div className="page-content">
      <PageHeader
        title="Top Pages & Screens"
        subtitle="Most visited URLs and screen paths across promptline.app"
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

      {/* Summary KPI */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="page-card" style={{ flex: 1, minWidth: 200 }}>
          <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Total Views
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.4rem 0 0' }}>
            {loading ? '—' : (data?.totalViews ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="page-card" style={{ flex: 1, minWidth: 200 }}>
          <p className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Tracked Unique Pages
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.4rem 0 0' }}>
            {loading ? '—' : (data?.rows?.length ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Search & Table */}
      <div className="page-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiFileText /> Ranked Pages
          </h3>
          <div style={{ position: 'relative', width: '240px' }}>
            <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              type="text"
              className="form-input"
              placeholder="Filter by path..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '2rem', width: '100%', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 4 }} />)}
          </div>
        ) : filteredRows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Page Path</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Views</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Users</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Avg Time</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Bounce Rate</th>
                  <th style={{ textAlign: 'center', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Live</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <p style={{ fontWeight: 600, margin: 0, fontFamily: 'monospace' }}>{row.path}</p>
                      {row.title && row.title !== row.path && (
                        <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0.15rem 0 0' }}>{row.title}</p>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{row.views.toLocaleString()}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{row.users.toLocaleString()}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{fmtSeconds(row.avgDurationSec)}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{row.bounceRate.toFixed(1)}%</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      <a
                        href={`https://promptline.app${row.path.startsWith('/') ? row.path : '/' + row.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-button"
                        title="Visit on promptline.app"
                        style={{ fontSize: '0.85rem' }}
                      >
                        <FiExternalLink />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>
            {search ? 'No pages matched your filter.' : 'No page view data recorded yet.'}
          </p>
        )}
      </div>
    </div>
  );
};

