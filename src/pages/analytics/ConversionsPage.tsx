import { useState, useEffect, useCallback } from 'react';
import { FiActivity, FiRefreshCw, FiCheckCircle } from 'react-icons/fi';
import { PageHeader } from '@/components/common/PageHeader';

interface EventGoal {
  eventName: string;
  category: string;
  eventCount: number;
  totalUsers: number;
  conversionRatePct: number;
}

interface ConversionsData {
  goals: EventGoal[];
  totalConversions: number;
  overallRatePct: number;
}

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '28 days', value: '28d' },
  { label: '90 days', value: '90d' },
];

export const ConversionsPage = () => {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState<ConversionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?type=goals&range=${range}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversions');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="page-content">
      <PageHeader
        title="Conversions & Events"
        subtitle="Key user actions, lead form submissions, and conversion funnel milestones"
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

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div className="page-card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Conversions
            </span>
            <FiCheckCircle style={{ opacity: 0.5, color: 'var(--success-color)' }} />
          </div>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0.5rem 0 0' }}>
            {loading ? '—' : (data?.totalConversions ?? 0).toLocaleString()}
          </p>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0' }}>Across all tagged funnel events</p>
        </div>

        <div className="page-card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Overall Conversion Rate
            </span>
            <FiActivity style={{ opacity: 0.5, color: '#6366f1' }} />
          </div>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0.5rem 0 0' }}>
            {loading ? '—' : `${(data?.overallRatePct ?? 0).toFixed(2)}%`}
          </p>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0' }}>Conversion rate vs total sessions</p>
        </div>
      </div>

      {/* Event Details Table */}
      <div className="page-card">
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FiActivity /> Tracked Conversion Events
        </h3>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 4 }} />)}
          </div>
        ) : data?.goals?.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Event Name</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Category</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Events Triggered</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Unique Users</th>
                  <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', opacity: 0.65, fontWeight: 600 }}>Conversion Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.goals.map((g, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>{g.eventName}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span className="badge badge--neutral" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                        {g.category}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{g.eventCount.toLocaleString()}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{g.totalUsers.toLocaleString()}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: 'var(--success-color)' }}>
                      {g.conversionRatePct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>
            No conversion events recorded in this time period yet.
          </p>
        )}
      </div>
    </div>
  );
};

