import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { useToast } from '@/components/common/Toast';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useRealtime } from '@/hooks/useRealtime';
import { PLAN_OPTIONS, formatUsd } from '@/types/domain';
import type { BusinessRow, TenantPlan, Interaction } from '@/types/domain';
import { FiArrowLeft, FiPhoneOff, FiPhoneCall, FiSettings } from 'react-icons/fi';

export const BusinessDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { adminUser } = useAuth();
  const { toast } = useToast();

  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Dialogs & Modals
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', id)
        .single();
      
      if (tenantError) throw tenantError;

      const { data: billingData } = await supabase
        .from('tenant_billing')
        .select('*')
        .eq('tenant_id', id)
        .single();

      const { data: planData } = await supabase
        .from('tenant_plan')
        .select('*')
        .eq('tenant_id', id)
        .single();

      const { count: callCount } = await supabase
        .from('interactions')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', id);

      const { data: charges } = await supabase
        .from('tenant_billing_charges')
        .select('amount_cents')
        .eq('tenant_id', id)
        .eq('status', 'succeeded');

      const revenueCents = charges?.reduce((acc, charge) => acc + (charge.amount_cents || 0), 0) || 0;

      setBusiness({
        ...tenantData,
        billing: billingData,
        plan: planData,
        call_count: callCount || 0,
        revenue_cents: revenueCents,
      });

      if (billingData?.plan_tier) {
        setSelectedPlan(billingData.plan_tier);
      }
    } catch (error) {
      console.error('Error fetching business details:', error);
      toast('Failed to load business details', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useRealtime({ table: 'tenants', event: '*', onUpdate: fetchDetails });
  useRealtime({ table: 'tenant_billing', event: '*', onUpdate: fetchDetails });
  useRealtime({ table: 'tenant_plan', event: '*', onUpdate: fetchDetails });

  const logActivity = async (action: string, details: any) => {
    if (!adminUser) return;
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUser.id,
      action,
      target_tenant_id: id,
      details
    });
  };

  const handleToggleStatus = async () => {
    if (!business || !id) return;
    try {
      const newStatus = !business.is_deleted;
      const { error } = await supabase
        .from('tenants')
        .update({ is_deleted: newStatus })
        .eq('id', id);
      
      if (error) throw error;
      
      await logActivity('toggle_tenant_status', { is_deleted: newStatus });
      toast(`Agent successfully ${newStatus ? 'disabled' : 'enabled'}.`);
      fetchDetails();
    } catch (error) {
      console.error('Error toggling status:', error);
      toast('Failed to update agent status', 'error');
    }
  };

  const handleChangePlan = async () => {
    if (!business || !id || !selectedPlan) return;
    try {
      const planOpt = PLAN_OPTIONS.find(p => p.tier === selectedPlan);
      if (!planOpt) return;

      const { error } = await supabase
        .from('tenant_billing')
        .update({ 
          plan_tier: selectedPlan,
          subscription_amount_cents: planOpt.amountCents,
          calls_included: planOpt.monthlyCalls,
          junk_calls_included: planOpt.junkCalls
        })
        .eq('tenant_id', id);

      if (error) throw error;

      await logActivity('change_plan', { new_plan: selectedPlan });
      toast(`Plan successfully changed to ${planOpt.label}.`);
      setShowPlanModal(false);
      fetchDetails();
    } catch (error) {
      console.error('Error changing plan:', error);
      toast('Failed to change plan', 'error');
    }
  };

  if (loading) {
    return <div className="page-content"><p>Loading...</p></div>;
  }

  if (!business) {
    return (
      <div className="page-content">
        <PageHeader title="Business Not Found" />
        <button className="btn btn--ghost" onClick={() => navigate('/businesses')}>
          <FiArrowLeft /> Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="page-content">
      <button className="btn btn--ghost" style={{ padding: 0, marginBottom: '1rem', color: 'hsl(var(--muted-foreground))' }} onClick={() => navigate('/businesses')}>
        <FiArrowLeft /> Back to Businesses
      </button>

      <PageHeader 
        title={business.company_name || 'Unnamed Business'} 
        subtitle={`Tenant ID: ${business.id}`}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`btn ${business.is_deleted ? 'btn--primary' : 'btn--destructive'}`}
              onClick={() => setShowStatusConfirm(true)}
            >
              {business.is_deleted ? <FiPhoneCall /> : <FiPhoneOff />}
              {business.is_deleted ? 'Enable Agent' : 'Disable Agent'}
            </button>
          </div>
        }
      />

      <div className="dashboard-kpi-row" style={{ marginTop: '2rem' }}>
        <KpiCard
          label="Total Revenue Collected"
          value={formatUsd(business.revenue_cents || 0)}
          variant="success"
        />
        <KpiCard
          label="Total Calls Answered"
          value={(business.call_count || 0).toLocaleString()}
        />
        <KpiCard
          label="Member Since"
          value={new Date(business.created_at).toLocaleDateString()}
        />
      </div>

      <div className="dashboard-chart-grid">
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Billing & Plan Details</h3>
            <button className="btn btn--secondary btn--sm" onClick={() => setShowPlanModal(true)}>
              <FiSettings /> Change Plan
            </button>
          </div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Account Status</span>
              <span>
                {business.is_deleted ? <StatusBadge status="canceled" label="Disabled" /> : <StatusBadge status={business.billing?.status || 'pending'} />}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Current Plan</span>
              <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{business.billing?.plan_tier || 'None'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Calls Left (This Period)</span>
              <span>{business.plan?.calls_left ?? 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Junk Calls Left</span>
              <span>{business.plan?.junk_calls_left ?? 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Contact Info</h3>
          </div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <p className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Twilio Phone</p>
              <p>{business.twillio_phone || 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Industry</p>
              <p>{business.industry || 'Unknown'}</p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showStatusConfirm}
        title={business.is_deleted ? 'Enable Agent' : 'Disable Agent'}
        message={`Are you sure you want to ${business.is_deleted ? 'enable' : 'disable'} the AI agent for ${business.company_name}? ${!business.is_deleted ? 'They will no longer receive any automated calls until re-enabled.' : ''}`}
        isDestructive={!business.is_deleted}
        confirmLabel={business.is_deleted ? 'Yes, Enable' : 'Yes, Disable'}
        onConfirm={handleToggleStatus}
        onCancel={() => setShowStatusConfirm(false)}
      />

      {/* Basic Plan Modal */}
      {showPlanModal && (
        <div className="dialog-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="dialog-panel" onClick={e => e.stopPropagation()}>
            <h3>Change Subscription Plan</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Select a new plan tier for this business. This will update their billing limits immediately.</p>
            
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Plan Tier</label>
              <select 
                className="form-input" 
                value={selectedPlan} 
                onChange={(e) => setSelectedPlan(e.target.value)}
              >
                <option value="" disabled>Select a plan...</option>
                {PLAN_OPTIONS.map(p => (
                  <option key={p.tier} value={p.tier}>{p.label} - {p.priceLabel}</option>
                ))}
              </select>
            </div>

            <div className="dialog-actions">
              <button className="btn btn--ghost" onClick={() => setShowPlanModal(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleChangePlan} disabled={!selectedPlan || selectedPlan === business.billing?.plan_tier}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
