import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { useToast } from '@/components/common/Toast';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useRealtime } from '@/hooks/useRealtime';
import type { PromoCode } from '@/types/domain';
import { FiPlus } from 'react-icons/fi';

export const PromoCodesPage = () => {
  const { adminUser } = useAuth();
  const { toast } = useToast();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchPromos = async () => {
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPromos(data || []);
    } catch (error) {
      console.error('Error fetching promo codes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromos();
  }, []);

  useRealtime({ table: 'promo_codes', event: '*', onUpdate: fetchPromos });

  const handleGeneratePromo = async () => {
    if (!adminUser) return;
    setGenerating(true);
    try {
      // Generate a random 8-character uppercase alphanumeric string
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();

      const { error } = await supabase.from('promo_codes').insert({
        code,
        is_used: false,
      });

      if (error) throw error;

      await supabase.from('admin_activity_log').insert({
        admin_user_id: adminUser.id,
        action: 'generate_promo_code',
        details: { code },
      });

      toast(`Successfully generated new promo code: ${code}`);
      fetchPromos();
    } catch (error) {
      console.error('Error generating promo code:', error);
      toast('Failed to generate promo code', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const columns: ColumnDef<PromoCode>[] = [
    {
      header: 'Code',
      id: 'code',
      cell: (row) => <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1.1rem' }}>{row.code}</span>,
    },
    {
      header: 'Status',
      id: 'is_used',
      cell: (row) => row.is_used ? <StatusBadge status="canceled" label="Used" /> : <StatusBadge status="active" label="Available" />,
    },
    {
      header: 'Used By Tenant',
      accessorKey: 'used_by_tenant',
      cell: (row) => row.used_by_tenant ? <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.used_by_tenant}</span> : '-',
    },
    {
      header: 'Used At',
      id: 'used_at',
      cell: (row) => row.used_at ? new Date(row.used_at).toLocaleString() : '-',
    },
    {
      header: 'Created At',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString(),
    },
  ];

  return (
    <div className="page-content">
      <PageHeader 
        title="Promo Codes" 
        subtitle="Manage trial bypass codes for special customers"
        actions={
          <button className="btn btn--primary" onClick={handleGeneratePromo} disabled={generating || loading}>
            <FiPlus /> {generating ? 'Generating...' : 'Generate Code'}
          </button>
        }
      />

      <div className="dashboard-section">
        {loading ? (
          <div className="page-card"><p>Loading promo codes...</p></div>
        ) : (
          <DataTable
            data={promos}
            columns={columns}
            emptyMessage="No promo codes generated yet."
          />
        )}
      </div>
    </div>
  );
};
