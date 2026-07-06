import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
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
}

interface BusinessEntry {
  businessName: string;
  tenantId: string;
  env: string | null;
  monthlyPhoneCost: number;
  phoneNumbers: PhoneNumber[];
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
  categories: CategoryEntry[];
  businesses: BusinessEntry[];
}

/* ── Helpers ── */
function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function downloadCSV(data: SpendData) {
  const rows: string[][] = [
    ['Phone Number', 'Business Name', 'Tenant ID', 'Environment', 'Monthly Cost ($)', 'Voice', 'SMS', 'MMS', 'Date Purchased'],
  ];

  for (const biz of data.businesses) {
    for (const pn of biz.phoneNumbers) {
      rows.push([
        pn.phoneNumber,
        biz.businessName,
        biz.tenantId || 'unassigned',
        biz.env || 'Unknown',
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

/* ── Component ── */
export const TwilioUsagePage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<SpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBusiness, setExpandedBusiness] = useState<string | null>(null);
  const [period, setPeriod] = useState<30 | 60 | 90>(30);

  const fetchData = async (days: 30 | 60 | 90 = period) => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        'fetch-twilio-recent-spend',
        { body: { days } },
      );
      if (fnError) throw fnError;
      setData(result as SpendData);
    } catch (err: any) {
      reportError(err, { where: 'TwilioUsagePage.fetchData' });
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (days: 30 | 60 | 90) => {
    setPeriod(days);
    setData(null);
    setExpandedBusiness(null);
    fetchData(days);
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBusiness = (key: string) => {
    setExpandedBusiness((prev) => (prev === key ? null : key));
  };

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

      {/* Loading */}
      {loading && !data && (
        <div className="page-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <FiDollarSign size={40} style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }} />
          <p className="text-muted">Querying Twilio and cross-referencing with PromptLine businesses…</p>
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="page-card" style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
          <p>Failed to load Twilio spend data.</p>
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
              <p className="kpi-card__meta">~{formatUSD(data.perNumberCost)} each/mo</p>
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

          {/* ── Per-Business Breakdown (Clickable) ── */}
          <div className="page-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="page-card__header">
              <h3 className="page-card__title">
                <FiBriefcase style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
                Spend by Business
              </h3>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Click a row to see phone numbers & details
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {data.businesses.map((biz) => {
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <FiHash size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                <div>
                                  <p style={{ fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem' }}>
                                    {formatPhone(pn.phoneNumber)}
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
                                  </div>
                                </div>
                              </div>
                              <p style={{ fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
                                {formatUSD(pn.monthlyPrice)}/mo
                              </p>
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

              {data.businesses.length === 0 && (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <p>No phone numbers found on this Twilio account.</p>
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
                Last 30 days
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
