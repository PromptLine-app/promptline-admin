import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { AdminOnly } from '@/auth/AdminOnly';
import { useToast } from '@/components/common/Toast';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useRealtime } from '@/hooks/useRealtime';
import { formatUsd } from '@/types/domain';
import type { TenantBilling, TenantBillingCharge } from '@/types/domain';
import { exportToCsv } from '@/lib/csv';
import { sendPaymentReminder } from '@/lib/billingReminder';
import { reportError } from '@/lib/sentry';
import { FiRefreshCw, FiDownload, FiRotateCcw, FiBell } from 'react-icons/fi';

type DunningRow = TenantBilling & {
  company_name: string | null;
  last_error: string | null;
  last_charge_id: string | null;
  last_charge_key: string | null;
};

export const DunningPage = () => {
  const navigate = useNavigate();
  const { adminUser } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState<DunningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<DunningRow | null>(null);

  const fetchDunning = useCallback(async () => {
    try {
      // Tenants in trouble: explicitly past_due/suspended, or carrying failures.
      const { data: billing, error } = await supabase
        .from('tenant_billing')
        .select('*')
        .or('status.in.(past_due,suspended),failed_attempts.gt.0')
        .order('last_failed_at', { ascending: false, nullsFirst: false });
      if (error) throw error;

      const billingRows = (billing || []) as TenantBilling[];
      const tenantIds = billingRows.map((b) => b.tenant_id);

      const [{ data: tenants }, { data: failedCharges }] = await Promise.all([
        tenantIds.length
          ? supabase.from('tenants').select('id, company_name').in('id', tenantIds)
          : Promise.resolve({ data: [] as { id: string; company_name: string | null }[] }),
        tenantIds.length
          ? supabase
              .from('tenant_billing_charges')
              .select('id, tenant_id, idempotency_key, error_message, created_at, status')
              .in('tenant_id', tenantIds)
              .eq('status', 'failed')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as Partial<TenantBillingCharge>[] }),
      ]);

      const nameByTenant = new Map<string, string | null>();
      (tenants || []).forEach((t: { id: string; company_name: string | null }) =>
        nameByTenant.set(t.id, t.company_name),
      );

      // Keep only the most recent failed charge per tenant (rows arrive desc).
      const latestFailure = new Map<string, Partial<TenantBillingCharge>>();
      (failedCharges || []).forEach((c: Partial<TenantBillingCharge>) => {
        if (c.tenant_id && !latestFailure.has(c.tenant_id)) latestFailure.set(c.tenant_id, c);
      });

      setRows(
        billingRows.map((b) => {
          const f = latestFailure.get(b.tenant_id);
          return {
            ...b,
            company_name: nameByTenant.get(b.tenant_id) ?? null,
            last_error: (f?.error_message as string) ?? null,
            last_charge_id: (f?.id as string) ?? null,
            last_charge_key: (f?.idempotency_key as string) ?? null,
          };
        }),
      );
    } catch (error) {
      reportError(error, { where: 'DunningPage.fetchDunning' });
      console.error('Error loading dunning data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; setState runs after await, not during render
    fetchDunning();
  }, [fetchDunning]);

  useRealtime({ table: 'tenant_billing', event: '*', onUpdate: fetchDunning });
  useRealtime({ table: 'tenant_billing_charges', event: '*', onUpdate: fetchDunning });

  const stats = useMemo(() => {
    let pastDue = 0;
    let suspended = 0;
    let atRiskCents = 0;
    rows.forEach((r) => {
      if (r.status === 'suspended') suspended++;
      else if (r.status === 'past_due') pastDue++;
      atRiskCents += r.subscription_amount_cents || 0;
    });
    return { pastDue, suspended, atRiskCents };
  }, [rows]);

  const handleRetry = async (row: DunningRow) => {
    setRetrying(row.tenant_id);
    try {
      // Reuse the failed charge's idempotency key so paypal-charge re-attempts
      // the same ledger row rather than creating a duplicate charge.
      const body: Record<string, unknown> = { tenantId: row.tenant_id };
      if (row.last_charge_key) body.idempotencyKey = row.last_charge_key;

      const { data, error } = await supabase.functions.invoke('paypal-charge', { body });
      if (error) throw error;

      if (data?.success) {
        toast(`Payment retried successfully for ${row.company_name || row.tenant_id}.`);
      } else {
        toast(`Retry failed: ${data?.error || `tenant is now ${data?.status || 'past_due'}`}`, 'error');
      }

      if (adminUser) {
        await supabase.from('admin_activity_log').insert({
          admin_user_id: adminUser.id,
          action: 'retry_charge',
          target_tenant_id: row.tenant_id,
          details: { result: data?.success ? 'succeeded' : 'failed', status: data?.status },
        });
      }
      
      if (!data?.success) {
        await supabase.from('system_error_logs').insert({
          category: 'billing',
          level: 'error',
          tenant_id: row.tenant_id,
          error_message: data?.error || 'Retry charge failed',
          details: { context: 'Manual charge retry', status: data?.status }
        });
      }
      
      fetchDunning();
    } catch (err) {
      reportError(err, { where: 'DunningPage.handleRetry' });
      console.error('Retry failed:', err);

      const message = err instanceof Error ? err.message : String(err);
      await supabase.from('system_error_logs').insert({
        category: 'billing',
        level: 'error',
        tenant_id: row.tenant_id,
        error_message: message,
        details: { context: 'Manual charge retry exception' }
      });

      toast(message || 'Failed to retry payment', 'error');
    } finally {
      setRetrying(null);
    }
  };

  const handleReminder = async (row: DunningRow) => {
    setReminding(row.tenant_id);
    try {
      await sendPaymentReminder({
        tenantId: row.tenant_id,
        companyName: row.company_name,
        billingEmail: row.billing_email,
        amountCents: row.subscription_amount_cents,
        adminUserId: adminUser?.id ?? null,
      });
      toast(`Reminder emailed to ${row.company_name || row.tenant_id}.`);
    } catch (err) {
      reportError(err, { where: 'DunningPage.handleReminder' });
      console.error('Reminder failed:', err);
      toast(err instanceof Error ? err.message : 'Failed to send reminder', 'error');
    } finally {
      setReminding(null);
    }
  };

  const handleExport = () => {
    exportToCsv('failed-payments.csv', rows, [
      { header: 'Business', value: (r) => r.company_name || r.tenant_id },
      { header: 'Tenant ID', value: (r) => r.tenant_id },
      { header: 'Status', value: (r) => r.status },
      { header: 'Plan', value: (r) => r.plan_tier ?? '' },
      { header: 'Amount', value: (r) => formatUsd(r.subscription_amount_cents || 0) },
      { header: 'Failed Attempts', value: (r) => r.failed_attempts },
      { header: 'Last Failed', value: (r) => (r.last_failed_at ? new Date(r.last_failed_at).toISOString() : '') },
      { header: 'Last Error', value: (r) => r.last_error ?? '' },
    ]);
  };

  const columns: ColumnDef<DunningRow>[] = [
    {
      header: 'Business',
      id: 'company_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{row.company_name || 'Unnamed Business'}</p>
          <p className="text-muted" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {row.tenant_id}
          </p>
        </div>
      ),
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Amount',
      id: 'subscription_amount_cents',
      cell: (row) => <span style={{ fontWeight: 600 }}>{formatUsd(row.subscription_amount_cents || 0)}</span>,
    },
    {
      header: 'Attempts',
      id: 'failed_attempts',
      cell: (row) => row.failed_attempts || 0,
    },
    {
      header: 'Last Failed',
      id: 'last_failed_at',
      cell: (row) => (row.last_failed_at ? new Date(row.last_failed_at).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '—'),
    },
    {
      header: 'Last Error',
      id: 'last_error',
      sortable: false,
      cell: (row) =>
        row.last_error ? (
          <span className="text-muted" style={{ fontSize: '0.8rem' }} title={row.last_error}>
            {row.last_error.length > 40 ? `${row.last_error.slice(0, 40)}…` : row.last_error}
          </span>
        ) : (
          '—'
        ),
    },
    {
      header: '',
      id: 'actions',
      sortable: false,
      cell: (row) => (
        <AdminOnly>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
            <button
              className="btn btn--ghost btn--sm"
              disabled={reminding === row.tenant_id || !row.billing_email}
              title={row.billing_email ? 'Email a payment reminder' : 'No billing email on file'}
              onClick={(e) => {
                e.stopPropagation();
                handleReminder(row);
              }}
            >
              <FiBell /> {reminding === row.tenant_id ? 'Sending…' : 'Remind'}
            </button>
            <button
              className="btn btn--secondary btn--sm"
              disabled={retrying === row.tenant_id || row.status === 'canceled'}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmRow(row);
              }}
            >
              <FiRotateCcw /> {retrying === row.tenant_id ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        </AdminOnly>
      ),
    },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Failed Payments"
        subtitle="Dunning queue — recover revenue from past-due and suspended subscriptions"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn--secondary" onClick={handleExport} disabled={loading || rows.length === 0}>
              <FiDownload /> Export CSV
            </button>
            <button className="btn btn--secondary" onClick={fetchDunning} disabled={loading}>
              <FiRefreshCw className={loading ? 'fa-spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      <div className="dashboard-kpi-row">
        <KpiCard
          label="Past Due"
          value={stats.pastDue}
          variant={stats.pastDue > 0 ? 'warning' : 'default'}
          loading={loading}
        />
        <KpiCard
          label="Suspended"
          value={stats.suspended}
          variant={stats.suspended > 0 ? 'destructive' : 'default'}
          loading={loading}
        />
        <KpiCard
          label="Revenue At Risk"
          value={formatUsd(stats.atRiskCents)}
          variant={stats.atRiskCents > 0 ? 'destructive' : 'default'}
          meta="Monthly subscription value of affected accounts"
          loading={loading}
        />
      </div>

      <div className="dashboard-section">
        <h3 className="dashboard-section__title" style={{ marginBottom: '1rem' }}>
          Dunning Queue
        </h3>
        {loading ? (
          <div className="page-card">
            <p>Loading failed payments...</p>
          </div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            onRowClick={(row) => navigate(`/businesses/${row.tenant_id}`)}
            emptyMessage="No failed payments. All subscriptions are current."
          />
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmRow}
        title="Retry Payment"
        message={
          confirmRow
            ? `Re-attempt the failed charge for ${confirmRow.company_name || confirmRow.tenant_id}? This will charge their vaulted card now.`
            : ''
        }
        confirmLabel="Yes, Retry Charge"
        onConfirm={() => {
          if (confirmRow) handleRetry(confirmRow);
        }}
        onCancel={() => setConfirmRow(null)}
      />
    </div>
  );
};
