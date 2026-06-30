import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useRealtime } from '@/hooks/useRealtime';
import { reportError } from '@/lib/sentry';
import type { BusinessRow } from '@/types/domain';
import { FiSearch } from 'react-icons/fi';

export const BusinessListPage = () => {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchBusinesses = async () => {
    try {
      // 1. Fetch tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (tenantsError) throw tenantsError;

      // 2. Fetch billing for all tenants
      const { data: billingData, error: billingError } = await supabase
        .from('tenant_billing')
        .select('*');

      if (billingError) throw billingError;

      // 3. Fetch phone numbers from operational profiles (twillio_phone lives here, not in tenants)
      const { data: opsData } = await supabase
        .from('tenant_operational_profiles')
        .select('tenant_id, twillio_phone');

      const opsMap: Record<string, string | null> = {};
      (opsData || []).forEach((o) => {
        opsMap[o.tenant_id] = o.twillio_phone;
      });

      // 4. Combine them
      const combined: BusinessRow[] = (tenantsData || []).map((t) => {
        const billing = billingData?.find((b) => b.tenant_id === t.id);
        return {
          ...t,
          twillio_phone: opsMap[t.id] ?? t.twillio_phone ?? null,
          billing,
        };
      });

      setBusinesses(combined);
    } catch (error) {
      reportError(error, { where: 'BusinessListPage.fetchBusinesses' });
      console.error('Error fetching businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; setState runs after await, not during render
    fetchBusinesses();
  }, []);

  useRealtime({ table: 'tenants', event: '*', onUpdate: fetchBusinesses });
  useRealtime({ table: 'tenant_billing', event: '*', onUpdate: fetchBusinesses });

  const filteredBusinesses = useMemo(() => {
    if (!search.trim()) return businesses;
    const lower = search.toLowerCase();
    return businesses.filter(
      (b) =>
        b.company_name?.toLowerCase().includes(lower) ||
        b.id.toLowerCase().includes(lower) ||
        b.twillio_phone?.includes(search)
    );
  }, [businesses, search]);

  const columns: ColumnDef<BusinessRow>[] = [
    {
      header: 'Company Name',
      id: 'company_name',
      cell: (row) => (
        <div>
          <p style={{ fontWeight: 500 }}>{row.company_name || 'Unnamed Business'}</p>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>{row.id}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => {
        if (row.is_deleted) return <StatusBadge status="canceled" label="Disabled" />;
        if (!row.billing) return <StatusBadge status="pending" label="No Billing" />;
        return <StatusBadge status={row.billing.status} />;
      },
    },
    {
      header: 'Plan',
      id: 'plan_tier',
      cell: (row) => (
        <span style={{ textTransform: 'capitalize' }}>
          {row.billing?.plan_tier || 'None'}
        </span>
      ),
    },
    {
      header: 'Phone',
      accessorKey: 'twillio_phone',
      cell: (row) => row.twillio_phone || <span className="text-muted">Not assigned</span>,
    },
    {
      header: 'Joined',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleDateString(),
    },
  ];

  return (
    <div className="page-content">
      <PageHeader 
        title="Businesses" 
        subtitle="Manage all businesses using the PromptLine platform"
      />

      <div className="dashboard-section">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 1, maxWidth: '400px', position: 'relative' }}>
            <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.5rem' }}
              placeholder="Search by name, ID, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="page-card">
            <p>Loading businesses...</p>
          </div>
        ) : (
          <DataTable
            data={filteredBusinesses}
            columns={columns}
            onRowClick={(row) => navigate(`/businesses/${row.id}`)}
            emptyMessage="No businesses found matching your search."
          />
        )}
      </div>
    </div>
  );
};
