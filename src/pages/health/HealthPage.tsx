import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useRealtime } from '@/hooks/useRealtime';
import { computeHealth, byRisk } from '@/lib/health';
import type { BusinessHealth, HealthSeverity } from '@/lib/health';
import type { Tenant, TenantBilling, TenantPlan } from '@/types/domain';
import { exportToCsv } from '@/lib/csv';
import { reportError } from '@/lib/sentry';
import { FiRefreshCw, FiDownload, FiAlertTriangle } from 'react-icons/fi';

const DAY_MS = 24 * 60 * 60 * 1000;

const severityChip = (severity: HealthSeverity) => {
  const map: Record<HealthSeverity, { bg: string; fg: string; label: string }> = {
    critical: { bg: 'hsl(var(--destructive) / 0.12)', fg: 'hsl(var(--destructive))', label: 'Critical' },
    warning: { bg: 'hsl(var(--warning) / 0.15)', fg: 'hsl(var(--warning))', label: 'At Risk' },
    ok: { bg: 'hsl(var(--success) / 0.12)', fg: 'hsl(var(--success))', label: 'Healthy' },
  };
  const s = map[severity];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.55rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
};

export const HealthPage = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BusinessHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyAtRisk, setOnlyAtRisk] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const now = Date.now();
      const d30 = new Date(now - 30 * DAY_MS).toISOString();
      const d60 = new Date(now - 60 * DAY_MS).toISOString();

      const [{ data: tenants }, { data: billing }, { data: plans }, { data: calls }] =
        await Promise.all([
          supabase.from('tenants').select('*'),
          supabase.from('tenant_billing').select('*'),
          supabase.from('tenant_plan').select('*'),
          supabase.from('interactions').select('tenant_id, created_at').gte('created_at', d60),
        ]);

      const billingByTenant = new Map<string, TenantBilling>();
      (billing || []).forEach((b) => billingByTenant.set(b.tenant_id, b as TenantBilling));

      const planByTenant = new Map<string, TenantPlan>();
      (plans || []).forEach((p) => planByTenant.set(p.tenant_id, p as TenantPlan));

      // Bucket call counts into the last 30 days vs the prior 30 days.
      const recent = new Map<string, number>();
      const prior = new Map<string, number>();
      (calls || []).forEach((c) => {
        if (!c.tenant_id || !c.created_at) return;
        const bucket = c.created_at >= d30 ? recent : prior;
        bucket.set(c.tenant_id, (bucket.get(c.tenant_id) || 0) + 1);
      });

      const computed = (tenants || []).map((t) =>
        computeHealth({
          tenant: t as Tenant,
          billing: billingByTenant.get((t as Tenant).id) ?? null,
          plan: planByTenant.get((t as Tenant).id) ?? null,
          callsRecent: recent.get((t as Tenant).id) || 0,
          callsPrior: prior.get((t as Tenant).id) || 0,
        }),
      );

      computed.sort(byRisk);
      setRows(computed);
    } catch (error) {
      reportError(error, { where: 'HealthPage.fetchHealth' });
      console.error('Error computing health:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useRealtime({ table: 'tenant_billing', event: '*', onUpdate: fetchHealth });
  useRealtime({ table: 'tenants', event: '*', onUpdate: fetchHealth });
  useRealtime({ table: 'tenant_plan', event: '*', onUpdate: fetchHealth });

  const stats = useMemo(() => {
    let critical = 0;
    let warning = 0;
    rows.forEach((r) => {
      if (r.severity === 'critical') critical++;
      else if (r.severity === 'warning') warning++;
    });
    return { critical, warning, healthy: rows.length - critical - warning };
  }, [rows]);

  const visibleRows = useMemo(
    () => (onlyAtRisk ? rows.filter((r) => r.severity !== 'ok') : rows),
    [rows, onlyAtRisk],
  );

  const handleExport = () => {
    exportToCsv('at-risk-businesses.csv', visibleRows, [
      { header: 'Business', value: (r) => r.tenant.company_name || r.tenant.id },
      { header: 'Tenant ID', value: (r) => r.tenant.id },
      { header: 'Severity', value: (r) => r.severity },
      { header: 'Score', value: (r) => r.score },
      { header: 'Issues', value: (r) => r.flags.map((f) => f.label).join('; ') },
      { header: 'Billing Status', value: (r) => r.billing?.status ?? '' },
      { header: 'Plan', value: (r) => r.billing?.plan_tier ?? '' },
      { header: 'Calls Left', value: (r) => r.plan?.calls_left ?? '' },
      { header: 'Calls (last 30d)', value: (r) => r.callsRecent },
      { header: 'Calls (prev 30d)', value: (r) => r.callsPrior },
    ]);
  };

  const columns: ColumnDef<BusinessHealth>[] = [
    {
      header: 'Business',
      id: 'company_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{row.tenant.company_name || 'Unnamed Business'}</p>
          <p className="text-muted" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {row.tenant.id}
          </p>
        </div>
      ),
    },
    {
      header: 'Severity',
      id: 'severity',
      cell: (row) => severityChip(row.severity),
    },
    {
      header: 'Issues',
      id: 'flags',
      sortable: false,
      cell: (row) =>
        row.flags.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {row.flags.map((f) => (
              <span
                key={f.code}
                style={{
                  fontSize: '0.72rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '6px',
                  background: 'hsl(var(--muted))',
                  color:
                    f.severity === 'critical'
                      ? 'hsl(var(--destructive))'
                      : 'hsl(var(--muted-foreground))',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.label}
              </span>
            ))}
          </div>
        ),
    },
    {
      header: 'Calls 30d',
      id: 'callsRecent',
      cell: (row) => {
        const delta = row.callsRecent - row.callsPrior;
        return (
          <span>
            {row.callsRecent}{' '}
            {row.callsPrior > 0 && (
              <span
                className="text-muted"
                style={{ fontSize: '0.75rem', color: delta < 0 ? 'hsl(var(--destructive))' : undefined }}
              >
                ({delta >= 0 ? '+' : ''}
                {delta} vs prev)
              </span>
            )}
          </span>
        );
      },
    },
    {
      header: 'Calls Left',
      id: 'calls_left',
      sortable: false,
      cell: (row) => row.plan?.calls_left ?? 'N/A',
    },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Business Health"
        subtitle="Churn-risk signals across all businesses — act before customers leave"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn--secondary" onClick={handleExport} disabled={loading || visibleRows.length === 0}>
              <FiDownload /> Export CSV
            </button>
            <button className="btn btn--secondary" onClick={fetchHealth} disabled={loading}>
              <FiRefreshCw className={loading ? 'fa-spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      <div className="dashboard-kpi-row">
        <KpiCard
          label="Critical"
          value={stats.critical}
          variant={stats.critical > 0 ? 'destructive' : 'default'}
          meta="Billing failure or paying-but-disabled"
          loading={loading}
        />
        <KpiCard
          label="At Risk"
          value={stats.warning}
          variant={stats.warning > 0 ? 'warning' : 'default'}
          meta="Usage drop, dormant, or out of calls"
          loading={loading}
        />
        <KpiCard label="Healthy" value={stats.healthy} variant="success" loading={loading} />
      </div>

      <div className="dashboard-section">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <h3 className="dashboard-section__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiAlertTriangle /> Needs Attention
          </h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={onlyAtRisk} onChange={(e) => setOnlyAtRisk(e.target.checked)} />
            Show at-risk only
          </label>
        </div>
        {loading ? (
          <div className="page-card">
            <p>Computing health signals...</p>
          </div>
        ) : (
          <DataTable
            data={visibleRows}
            columns={columns}
            onRowClick={(row) => navigate(`/businesses/${row.tenant.id}`)}
            emptyMessage={onlyAtRisk ? 'No at-risk businesses. Everything looks healthy.' : 'No businesses found.'}
          />
        )}
      </div>
    </div>
  );
};
