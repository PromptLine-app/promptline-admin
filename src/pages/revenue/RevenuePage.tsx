import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { KpiCard } from '@/components/common/KpiCard';
import { useRealtime } from '@/hooks/useRealtime';
import { formatUsd } from '@/types/domain';
import type { TenantBillingCharge } from '@/types/domain';

export const RevenuePage = () => {
  const [charges, setCharges] = useState<TenantBillingCharge[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCharges = async () => {
    try {
      const { data, error } = await supabase
        .from('tenant_billing_charges')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCharges(data || []);
    } catch (error) {
      console.error('Error fetching charges:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharges();
  }, []);

  useRealtime({ table: 'tenant_billing_charges', event: '*', onUpdate: fetchCharges });

  const metrics = useMemo(() => {
    let totalSucceeded = 0;
    let totalRefunded = 0;
    let totalPending = 0;

    charges.forEach((c) => {
      if (c.status === 'succeeded') totalSucceeded += c.amount_cents;
      if (c.status === 'refunded') totalRefunded += c.refunded_amount_cents || c.amount_cents;
      if (c.status === 'pending') totalPending += c.amount_cents;
    });

    return { totalSucceeded, totalRefunded, totalPending };
  }, [charges]);

  const columns: ColumnDef<TenantBillingCharge>[] = [
    {
      header: 'Date',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      header: 'Tenant ID',
      accessorKey: 'tenant_id',
      cell: (row) => <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.tenant_id}</span>,
    },
    {
      header: 'Type',
      id: 'kind',
      cell: (row) => <span style={{ textTransform: 'capitalize' }}>{row.kind}</span>,
    },
    {
      header: 'Amount',
      id: 'amount_cents',
      cell: (row) => <span style={{ fontWeight: 600 }}>{formatUsd(row.amount_cents)}</span>,
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Invoice #',
      accessorKey: 'invoice_number',
      cell: (row) => row.invoice_number || '-',
    },
  ];

  return (
    <div className="page-content">
      <PageHeader 
        title="Revenue Analytics" 
        subtitle="Track platform MRR, cash flow, and charge ledgers" 
      />

      <div className="dashboard-kpi-row">
        <KpiCard
          label="Total Revenue Collected"
          value={formatUsd(metrics.totalSucceeded)}
          variant="success"
          loading={loading}
        />
        <KpiCard
          label="Pending Charges"
          value={formatUsd(metrics.totalPending)}
          variant="warning"
          loading={loading}
        />
        <KpiCard
          label="Total Refunded"
          value={formatUsd(metrics.totalRefunded)}
          variant={metrics.totalRefunded > 0 ? 'destructive' : 'default'}
          loading={loading}
        />
      </div>

      <div className="dashboard-section">
        <h3 className="dashboard-section__title" style={{ marginBottom: '1rem' }}>Charge Ledger</h3>
        {loading ? (
          <div className="page-card"><p>Loading ledger...</p></div>
        ) : (
          <DataTable
            data={charges}
            columns={columns}
            emptyMessage="No charge records found."
          />
        )}
      </div>
    </div>
  );
};
