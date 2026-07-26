import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/adminApi';
import { PageHeader } from '@/components/common/PageHeader';
import { reportError } from '@/lib/sentry';
import {
  FiRefreshCw,
  FiDollarSign,
  FiPhone,
  FiArrowLeft,
  FiChevronDown,
  FiChevronRight,
  FiMessageSquare,
  FiBriefcase,
  FiHash,
  FiDownload,
  FiTrash2,
  FiAlertTriangle,
  FiX,
  FiServer,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

/* ── Types ── */
interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  monthlyPrice: number;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  dateCreated: string;
  env: string | null;
  accountSid: string;
  accountName: string;
  numberSid: string;
}

interface BusinessEntry {
  businessName: string;
  tenantId: string;
  env: string | null;
  monthlyPhoneCost: number;
  phoneNumbers: PhoneNumber[];
}

interface AccountInfo {
  sid: string;
  name: string;
  isMain: boolean;
  numberCount: number;
}

interface CategoryEntry {
  category: string;
  description: string;
  price: number;
  count: number;
  countUnit: string;
}

interface SpendData {
  dateRange: { from: string; to: string };
  days: number;
  totalSpend: number;
  totalPhoneNumbers: number;
  totalBusinesses: number;
  perNumberCost: number;
  accounts: AccountInfo[];
  categories: CategoryEntry[];
  businesses: BusinessEntry[];
}

/* ── Helpers ── */
function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function downloadCSV(data: SpendData) {
  const rows: string[][] = [
    ['Phone Number', 'Business Name', 'Tenant ID', 'Environment', 'Twilio Account', 'Monthly Cost ($)', 'Voice', 'SMS', 'MMS', 'Date Purchased'],
  ];

  for (const biz of data.businesses) {
    for (const pn of biz.phoneNumbers) {
      rows.push([
        pn.phoneNumber,
        biz.businessName,
        biz.tenantId || 'unassigned',
        biz.env || 'Unknown',
        pn.accountName || 'Unknown',
        pn.monthlyPrice.toFixed(2),
        pn.capabilities.voice ? 'Yes' : 'No',
        pn.capabilities.sms ? 'Yes' : 'No',
        pn.capabilities.mms ? 'Yes' : 'No',
        pn.dateCreated ? new Date(pn.dateCreated).toLocaleDateString() : '',
      ]);
    }
  }

  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `twilio-numbers-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatCategory(cat: string): string {
  return cat
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

/* ── Env Badge ── */
const EnvBadge = ({ env }: { env: string | null }) => {
  if (!env) return null;
  const isProd = env === 'Prod';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.45rem',
        borderRadius: '4px',
        fontSize: '0.65rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: isProd ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
        color: isProd ? '#ef4444' : '#3b82f6',
        border: `1px solid ${isProd ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
        marginLeft: '0.5rem',
        verticalAlign: 'middle',
      }}
    >
      {env}
    </span>
  );
};

/* ── Account Badge ── */
const AccountBadge = ({ name, isMain }: { name: string; isMain?: boolean }) => {
  const isMainAcct = isMain ?? name === 'Main Account';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.45rem',
        borderRadius: '4px',
        fontSize: '0.6rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: isMainAcct ? 'rgba(168, 85, 247, 0.12)' : 'rgba(34, 197, 94, 0.12)',
        color: isMainAcct ? '#a855f7' : '#22c55e',
        border: `1px solid ${isMainAcct ? 'rgba(168, 85, 247, 0.25)' : 'rgba(34, 197, 94, 0.25)'}`,
        marginLeft: '0.4rem',
        verticalAlign: 'middle',
      }}
    >
      <FiServer size={8} style={{ marginRight: '0.2rem', verticalAlign: '-1px' }} />
      {name}
    </span>
  );
};

/* ── Release Confirmation Modal ── */
const ReleaseModal = ({
  phone,
  businessName,
  monthlyCost,
  onConfirm,
  onCancel,
  releasing,
}: {
  phone: string;
  businessName: string;
  monthlyCost: number;
  onConfirm: () => void;
  onCancel: () => void;
  releasing: boolean;
}) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)',
      animation: 'fadeIn 0.15s ease-out',
    }}
    onClick={(e) => { if (e.target === e.currentTarget && !releasing) onCancel(); }}
  >
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        padding: '2rem',
        maxWidth: '440px',
        width: '90%',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <FiAlertTriangle size={20} style={{ color: '#ef4444' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Release Phone Number</h3>
        </div>
        {!releasing && (
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'hsl(var(--muted-foreground))' }}
          >
            <FiX size={18} />
          </button>
        )}
      </div>

      <div style={{
        background: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid rgba(239, 68, 68, 0.15)',
        borderRadius: 'calc(var(--radius) * 0.7)',
        padding: '1rem',
        marginBottom: '1.25rem',
      }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#ef4444', fontWeight: 600, marginBottom: '0.5rem' }}>
          This action cannot be undone
        </p>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'hsl(var(--muted-foreground))' }}>
          The number will be permanently released from your Twilio account.
          {businessName !== 'Unassigned' && ' This number is currently assigned to a business.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span className="text-muted">Number</span>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{formatPhone(phone)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span className="text-muted">Business</span>
          <span style={{ fontWeight: 600, color: businessName !== 'Unassigned' ? '#f59e0b' : 'hsl(var(--muted-foreground))' }}>
            {businessName}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span className="text-muted">Monthly savings</span>
          <span style={{ fontWeight: 600, color: '#10b981' }}>{formatUSD(monthlyCost)}/mo</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button
          className="btn btn--secondary"
          onClick={onCancel}
          disabled={releasing}
          style={{ minWidth: '80px' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={releasing}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius)',
            border: 'none',
            background: releasing ? '#991b1b' : '#ef4444',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: releasing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            opacity: releasing ? 0.7 : 1,
            transition: 'all 0.15s ease',
            minWidth: '120px',
            justifyContent: 'center',
          }}
        >
          {releasing ? (
            <>
              <FiRefreshCw size={14} className="spin" /> Releasing…
            </>
          ) : (
            <>
              <FiTrash2 size={14} /> Release Number
            </>
          )}
        </button>
      </div>
    </div>
  </div>
);

/* ── Component ── */
export const TwilioUsagePage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<SpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBusiness, setExpandedBusiness] = useState<string | null>(null);
  const [period, setPeriod] = useState<30 | 60 | 90>(30);
  const [accountFilter, setAccountFilter] = useState<string>('all');

  // Release state
  const [releaseTarget, setReleaseTarget] = useState<{
    numberSid: string;
    accountSid: string;
    phoneNumber: string;
    businessName: string;
    monthlyPrice: number;
  } | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseSuccess, setReleaseSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async (days: 30 | 60 | 90 = period) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi<SpendData>('/api/admin/twilio-numbers', 'POST', { days });
      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      reportError(err, { where: 'TwilioUsagePage.fetchData' });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const handlePeriodChange = (days: 30 | 60 | 90) => {
    setPeriod(days);
    setData(null);
    setExpandedBusiness(null);
    fetchData(days);
  };

  const handleRelease = async () => {
    if (!releaseTarget) return;
    setReleasing(true);
    try {
      await adminApi('/api/admin/twilio-release', 'POST', {
        numberSid: releaseTarget.numberSid,
        accountSid: releaseTarget.accountSid,
      });
      setReleaseSuccess(releaseTarget.phoneNumber);
      setReleaseTarget(null);
      // Auto-refresh data after release
      setTimeout(() => {
        setReleaseSuccess(null);
        fetchData(period);
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      reportError(err, { where: 'TwilioUsagePage.handleRelease' });
      setError(`Release failed: ${message}`);
      setReleaseTarget(null);
    } finally {
      setReleasing(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBusiness = (key: string) => {
    setExpandedBusiness((prev) => (prev === key ? null : key));
  };

  // Filter businesses by account
  const filteredBusinesses = data?.businesses.map((biz) => {
    if (accountFilter === 'all') return biz;
    const filtered = biz.phoneNumbers.filter((pn) => pn.accountSid === accountFilter);
    if (filtered.length === 0) return null;
    return {
      ...biz,
      phoneNumbers: filtered,
      monthlyPhoneCost: filtered.reduce((s, p) => s + p.monthlyPrice, 0),
    };
  }).filter(Boolean) as BusinessEntry[] ?? [];

  const filteredTotalNumbers = accountFilter === 'all'
    ? data?.totalPhoneNumbers ?? 0
    : data?.accounts.find(a => a.sid === accountFilter)?.numberCount ?? 0;

  // Segmented control styles
  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '0.35rem 1rem',
    fontSize: '0.82rem',
    fontWeight: active ? 700 : 500,
    border: '1px solid hsl(var(--border))',
    background: active ? 'hsl(var(--primary))' : 'transparent',
    color: active ? '#fff' : 'hsl(var(--foreground))',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
  });

  // Account filter pill style
  const acctPill = (active: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.85rem',
    fontSize: '0.78rem',
    fontWeight: active ? 700 : 500,
    border: `1px solid ${active ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
    background: active ? 'hsl(var(--primary) / 0.1)' : 'transparent',
    color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
    borderRadius: '9999px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div className="page-content">
      <PageHeader
        title="Twilio Spend Tracker"
        subtitle={
          data
            ? `${formatDate(data.dateRange.from)} – ${formatDate(data.dateRange.to)}`
            : 'Loading…'
        }
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* 30 / 60 / 90 day toggle */}
            <div style={{ display: 'flex', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid hsl(var(--border))' }}>
              {([30, 60, 90] as const).map((d, i) => (
                <button
                  key={d}
                  style={{
                    ...segBtn(period === d),
                    borderRadius: i === 0 ? 'var(--radius) 0 0 var(--radius)' : i === 2 ? '0 var(--radius) var(--radius) 0' : '0',
                    borderLeft: i > 0 ? 'none' : undefined,
                  }}
                  onClick={() => handlePeriodChange(d)}
                  disabled={loading}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button className="btn btn--secondary" onClick={() => navigate('/infra/services')}>
              <FiArrowLeft /> Services
            </button>
            {data && (
              <button className="btn btn--secondary" onClick={() => downloadCSV(data)} title="Download phone number list as CSV">
                <FiDownload /> Export CSV
              </button>
            )}
            <button className="btn btn--secondary" onClick={() => fetchData(period)} disabled={loading}>
              <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      {/* Release success toast */}
      {releaseSuccess && (
        <div style={{
          position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9998,
          background: '#10b981', color: '#fff', padding: '0.75rem 1.25rem',
          borderRadius: 'var(--radius)', fontWeight: 600, fontSize: '0.85rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)', animation: 'fadeIn 0.2s ease-out',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <FiTrash2 size={16} /> Released {formatPhone(releaseSuccess)}
        </div>
      )}

      {/* Release confirmation modal */}
      {releaseTarget && (
        <ReleaseModal
          phone={releaseTarget.phoneNumber}
          businessName={releaseTarget.businessName}
          monthlyCost={releaseTarget.monthlyPrice}
          onConfirm={handleRelease}
          onCancel={() => !releasing && setReleaseTarget(null)}
          releasing={releasing}
        />
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="page-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <FiDollarSign size={40} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }} />
          <p className="text-muted">Fetching phone numbers from all Twilio accounts…</p>
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="page-card" style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
          <p>Failed to load Twilio data.</p>
          <p style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{error}</p>
        </div>
      )}

      {/* Main Content */}
      {data && (
        <>
          {/* ── KPI Row ── */}
          <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="kpi-card">
              <p className="kpi-card__label">Total Spend ({period} days)</p>
              <p className="kpi-card__value" style={{ color: '#6366f1' }}>{formatUSD(data.totalSpend)}</p>
              <p className="kpi-card__meta">across all categories</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-card__label">Phone Numbers</p>
              <p className="kpi-card__value">{data.totalPhoneNumbers}</p>
              <p className="kpi-card__meta">
                {data.accounts.length > 1
                  ? data.accounts.map(a => `${a.name}: ${a.numberCount}`).join(' · ')
                  : `~${formatUSD(data.perNumberCost)} each/mo`
                }
              </p>
            </div>
            <div className="kpi-card">
              <p className="kpi-card__label">Businesses</p>
              <p className="kpi-card__value">{data.totalBusinesses}</p>
              <p className="kpi-card__meta">assigned to PromptLine tenants</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-card__label">Unassigned</p>
              <p className="kpi-card__value">{data.totalPhoneNumbers - data.businesses.reduce((s, b) => s + (b.tenantId ? b.phoneNumbers.length : 0), 0)}</p>
              <p className="kpi-card__meta">numbers not linked to a business</p>
            </div>
          </div>

          {/* ── Account Filter Pills ── */}
          {data.accounts.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.78rem', fontWeight: 600, marginRight: '0.25rem' }}>
                <FiServer size={12} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
                Filter by Account:
              </span>
              <button style={acctPill(accountFilter === 'all')} onClick={() => setAccountFilter('all')}>
                All ({data.totalPhoneNumbers})
              </button>
              {data.accounts.map(acct => (
                <button
                  key={acct.sid}
                  style={acctPill(accountFilter === acct.sid)}
                  onClick={() => setAccountFilter(acct.sid)}
                >
                  {acct.name} ({acct.numberCount})
                </button>
              ))}
            </div>
          )}

          {/* ── Per-Business Breakdown (Clickable) ── */}
          <div className="page-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="page-card__header">
              <h3 className="page-card__title">
                <FiBriefcase style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
                Spend by Business
                {accountFilter !== 'all' && (
                  <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 400, marginLeft: '0.5rem' }}>
                    ({filteredTotalNumbers} numbers)
                  </span>
                )}
              </h3>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Click a row to see phone numbers · Click 🗑️ to release
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {filteredBusinesses.map((biz) => {
                const key = biz.tenantId || biz.businessName;
                const isExpanded = expandedBusiness === key;

                return (
                  <div key={key}>
                    {/* Business Row */}
                    <div
                      onClick={() => toggleBusiness(key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid hsl(var(--border))',
                        transition: 'background 0.15s ease',
                        borderRadius: isExpanded ? 'var(--radius) var(--radius) 0 0' : '0',
                        background: isExpanded ? 'hsl(var(--accent))' : 'transparent',
                      }}
                      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'hsl(var(--accent))'; }}
                      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ color: 'hsl(var(--muted-foreground))', transition: 'transform 0.2s' }}>
                        {isExpanded ? <FiChevronDown size={18} /> : <FiChevronRight size={18} />}
                      </span>

                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          {biz.businessName}
                          <EnvBadge env={biz.env} />
                        </p>
                        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>
                          {biz.phoneNumbers.length} phone number{biz.phoneNumbers.length !== 1 ? 's' : ''}
                        </p>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 700, fontSize: '1.1rem', fontFamily: 'var(--font-mono, monospace)' }}>
                          {formatUSD(biz.monthlyPhoneCost)}
                        </p>
                        <p className="text-muted" style={{ fontSize: '0.75rem' }}>/ month</p>
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div
                        style={{
                          background: 'hsl(var(--muted))',
                          padding: '1.25rem',
                          borderBottom: '1px solid hsl(var(--border))',
                          borderRadius: '0 0 var(--radius) var(--radius)',
                          animation: 'fadeIn 0.2s ease-out',
                        }}
                      >
                        {/* Phone Numbers */}
                        <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                          Phone Numbers
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {biz.phoneNumbers.map((pn) => (
                            <div
                              key={pn.phoneNumber}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.75rem 1rem',
                                background: 'hsl(var(--card))',
                                borderRadius: 'calc(var(--radius) * 0.7)',
                                border: '1px solid hsl(var(--border))',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                <FiHash size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                <div>
                                  <p style={{ fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem' }}>
                                    {formatPhone(pn.phoneNumber)}
                                    <AccountBadge name={pn.accountName} />
                                  </p>
                                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                                    {pn.capabilities.voice && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: '#10b981', fontWeight: 500 }}>
                                        <FiPhone size={10} /> Voice
                                      </span>
                                    )}
                                    {pn.capabilities.sms && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: '#3b82f6', fontWeight: 500 }}>
                                        <FiMessageSquare size={10} /> SMS
                                      </span>
                                    )}
                                    {pn.dateCreated && (
                                      <span style={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))' }}>
                                        Since {formatDate(pn.dateCreated)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <p style={{ fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
                                  {formatUSD(pn.monthlyPrice)}/mo
                                </p>
                                <button
                                  title="Release this phone number"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReleaseTarget({
                                      numberSid: pn.numberSid,
                                      accountSid: pn.accountSid,
                                      phoneNumber: pn.phoneNumber,
                                      businessName: biz.businessName,
                                      monthlyPrice: pn.monthlyPrice,
                                    });
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    width: '32px', height: '32px', borderRadius: '6px',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                    background: 'rgba(239, 68, 68, 0.06)',
                                    color: '#ef4444', cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'; }}
                                >
                                  <FiTrash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Why this costs money */}
                        <div style={{
                          marginTop: '1rem',
                          padding: '0.75rem 1rem',
                          background: 'rgba(99, 102, 241, 0.08)',
                          borderRadius: 'calc(var(--radius) * 0.7)',
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          fontSize: '0.82rem',
                          color: 'hsl(var(--muted-foreground))',
                        }}>
                          <strong style={{ color: 'hsl(var(--foreground))' }}>Why does this cost money?</strong>
                          <p style={{ marginTop: '0.25rem' }}>
                            Each phone number costs ~{formatUSD(data.perNumberCost)}/mo to keep active on Twilio.
                            {biz.phoneNumbers.some(p => p.capabilities.voice) && ' Voice-enabled numbers receive inbound calls handled by the PromptLine AI agent.'}
                            {biz.phoneNumbers.some(p => p.capabilities.sms) && ' SMS-enabled numbers send/receive text messages for follow-ups and confirmations.'}
                          </p>
                        </div>

                        {/* Link to business detail */}
                        {biz.tenantId && (
                          <button
                            className="btn btn--secondary btn--sm"
                            style={{ marginTop: '1rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/businesses/${biz.tenantId}`);
                            }}
                          >
                            View Business in Admin →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredBusinesses.length === 0 && (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <p>
                    {accountFilter !== 'all'
                      ? 'No phone numbers found in this account.'
                      : 'No phone numbers found on any Twilio account.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Category Breakdown ── */}
          <div className="page-card" style={{ padding: '1.5rem' }}>
            <div className="page-card__header">
              <h3 className="page-card__title">
                <FiDollarSign style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
                Spend by Category
              </h3>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Last {period} days
              </span>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>What It Is</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>% of Total</th>
                    <th style={{ textAlign: 'right' }}>Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => {
                    const pct = data.totalSpend > 0
                      ? ((c.price / data.totalSpend) * 100).toFixed(1)
                      : '0.0';
                    return (
                      <tr key={c.category}>
                        <td style={{ fontWeight: 600 }}>{formatCategory(c.category)}</td>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{c.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
                          {formatUSD(c.price)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <div style={{ width: '60px', height: '6px', background: 'hsl(var(--border))', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, parseFloat(pct))}%`, height: '100%', background: '#6366f1', borderRadius: '3px' }} />
                            </div>
                            <span style={{ fontSize: '0.82rem' }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
                          {c.count.toLocaleString()} {c.countUnit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
