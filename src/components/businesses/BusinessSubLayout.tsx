import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { supabase } from '@/config/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { BusinessTabs } from './BusinessTabs';
import { FiArrowLeft } from 'react-icons/fi';

/** Shared chrome for the per-business sub-pages: back link, header, tab strip. */
export const BusinessSubLayout = ({
  tenantId,
  children,
}: {
  tenantId: string;
  children: ReactNode;
}) => {
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('tenants')
      .select('company_name')
      .eq('id', tenantId)
      .single()
      .then(({ data }) => {
        if (active) setName((data?.company_name as string) ?? null);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  return (
    <div className="page-content">
      <button
        className="btn btn--ghost"
        style={{ padding: 0, marginBottom: '1rem', color: 'hsl(var(--muted-foreground))' }}
        onClick={() => navigate('/businesses')}
      >
        <FiArrowLeft /> Back to Businesses
      </button>
      <PageHeader title={name || 'Business'} subtitle={`Tenant ID: ${tenantId}`} />
      <BusinessTabs tenantId={tenantId} />
      {children}
    </div>
  );
};
