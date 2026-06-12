import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { AdminOnly } from '@/auth/AdminOnly';
import { useToast } from '@/components/common/Toast';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { useRealtime } from '@/hooks/useRealtime';
import { PLAN_OPTIONS, formatUsd } from '@/types/domain';
import type { BusinessRow, TenantBillingCharge } from '@/types/domain';
import { sendPaymentReminder } from '@/lib/billingReminder';
import {
  FiArrowLeft,
  FiPhoneOff,
  FiPhoneCall,
  FiSettings,
  FiEdit2,
  FiCornerUpLeft,
  FiPlusCircle,
  FiRotateCcw,
  FiBell,
} from 'react-icons/fi';

const PAST_DUE_STATUSES = ['past_due', 'suspended'];
// Statuses representing a live paid subscription, where a plan change must wait
// for the next renewal rather than re-pricing mid-cycle.
const ACTIVE_BILLED_STATUSES = ['active', 'past_due', 'suspended'];

export const BusinessDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { adminUser } = useAuth();
  const { toast } = useToast();

  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [charges, setCharges] = useState<TenantBillingCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  // Dialogs & Modals
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState<string>('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBillingEmail, setEditBillingEmail] = useState('');

  // Comp calls form
  const [compCalls, setCompCalls] = useState('');
  const [compJunk, setCompJunk] = useState('');

  // Refund form
  const [refundChargeId, setRefundChargeId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

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

      const { data: chargeRows } = await supabase
        .from('tenant_billing_charges')
        .select('*')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false });

      const allCharges = (chargeRows || []) as TenantBillingCharge[];
      setCharges(allCharges);

      const revenueCents = allCharges
        .filter((c) => c.status === 'succeeded')
        .reduce((acc, c) => acc + (c.amount_cents || 0) - (c.refunded_amount_cents || 0), 0);

      setBusiness({
        ...tenantData,
        billing: billingData,
        plan: planData,
        call_count: callCount || 0,
        revenue_cents: revenueCents,
      });

      if (billingData?.plan_tier) setSelectedPlan(billingData.plan_tier);
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
  useRealtime({ table: 'tenant_billing_charges', event: '*', onUpdate: fetchDetails });

  const logActivity = async (action: string, details: any) => {
    if (!adminUser) return;
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUser.id,
      action,
      target_tenant_id: id,
      details,
    });
  };

  const handleToggleStatus = async () => {
    if (!business || !id) return;
    try {
      const newStatus = !business.is_deleted;
      const { error } = await supabase.from('tenants').update({ is_deleted: newStatus }).eq('id', id);
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
    if (!business.billing) {
      toast('This customer has no billing record yet — they must add a payment method first.', 'error');
      return;
    }
    try {
      const planOpt = PLAN_OPTIONS.find((p) => p.tier === selectedPlan);
      if (!planOpt) return;

      // A live paid subscription keeps its current pricing until the next renewal:
      // we stage the change in pending_plan_tier, which paypal-charge promotes to
      // plan_tier (and re-prices) when next_charge_at comes due. For a customer not
      // yet on a paid cycle (trialing/pending), apply the new plan immediately.
      const appliesNextCycle = ACTIVE_BILLED_STATUSES.includes(business.billing.status);

      if (appliesNextCycle) {
        const { error } = await supabase
          .from('tenant_billing')
          .update({ pending_plan_tier: selectedPlan })
          .eq('tenant_id', id);
        if (error) throw error;
        await logActivity('change_plan', { new_plan: selectedPlan, effective: 'next_cycle' });
        toast(`${planOpt.label} plan scheduled for the next billing cycle.`);
      } else {
        const { error } = await supabase
          .from('tenant_billing')
          .update({
            plan_tier: selectedPlan,
            pending_plan_tier: null,
            subscription_amount_cents: planOpt.amountCents,
            calls_included: planOpt.monthlyCalls,
            junk_calls_included: planOpt.junkCalls,
          })
          .eq('tenant_id', id);
        if (error) throw error;
        await logActivity('change_plan', { new_plan: selectedPlan, effective: 'immediate' });
        toast(`Plan changed to ${planOpt.label}.`);
      }
      setShowPlanModal(false);
      fetchDetails();
    } catch (error) {
      console.error('Error changing plan:', error);
      toast('Failed to change plan', 'error');
    }
  };

  const handleSendReminder = async () => {
    if (!business || !id) return;
    setSendingReminder(true);
    try {
      await sendPaymentReminder({
        tenantId: id,
        companyName: business.company_name,
        billingEmail: business.billing?.billing_email ?? null,
        amountCents: business.billing?.subscription_amount_cents ?? null,
        adminUserId: adminUser?.id ?? null,
      });
      toast('Payment reminder emailed to the customer.');
      fetchDetails();
    } catch (error: any) {
      console.error('Error sending reminder:', error);
      toast(error?.message || 'Failed to send reminder', 'error');
    } finally {
      setSendingReminder(false);
    }
  };

  const openEditModal = () => {
    if (!business) return;
    setEditName(business.company_name || '');
    setEditIndustry(business.industry || '');
    setEditPhone(business.twillio_phone || '');
    setEditBillingEmail(business.billing?.billing_email || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    try {
      const { error: tErr } = await supabase
        .from('tenants')
        .update({
          company_name: editName.trim() || null,
          industry: editIndustry.trim() || null,
          twillio_phone: editPhone.trim() || null,
        })
        .eq('id', id);
      if (tErr) throw tErr;

      if (business?.billing) {
        const { error: bErr } = await supabase
          .from('tenant_billing')
          .update({ billing_email: editBillingEmail.trim() || null })
          .eq('tenant_id', id);
        if (bErr) throw bErr;
      }

      await logActivity('edit_business', {
        company_name: editName.trim(),
        industry: editIndustry.trim(),
        billing_email: editBillingEmail.trim(),
      });
      toast('Business details updated.');
      setShowEditModal(false);
      fetchDetails();
    } catch (error: any) {
      console.error('Error saving edit:', error);
      toast(error?.message || 'Failed to update business', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleComp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !business?.plan) {
      toast('No plan balance record exists for this tenant.', 'error');
      return;
    }
    const addCalls = parseInt(compCalls || '0', 10) || 0;
    const addJunk = parseInt(compJunk || '0', 10) || 0;
    if (addCalls === 0 && addJunk === 0) {
      toast('Enter a number of calls to grant.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('tenant_plan')
        .update({
          calls_left: Math.max(0, (business.plan.calls_left || 0) + addCalls),
          junk_calls_left: Math.max(0, (business.plan.junk_calls_left || 0) + addJunk),
        })
        .eq('tenant_id', id);
      if (error) throw error;
      await logActivity('grant_calls', { calls: addCalls, junk_calls: addJunk });
      toast(`Granted ${addCalls} calls${addJunk ? ` and ${addJunk} junk calls` : ''}.`);
      setShowCompModal(false);
      setCompCalls('');
      setCompJunk('');
      fetchDetails();
    } catch (error: any) {
      console.error('Error granting calls:', error);
      toast(error?.message || 'Failed to grant calls', 'error');
    } finally {
      setBusy(false);
    }
  };

  const refundableCharges = charges.filter(
    (c) => c.status === 'succeeded' && (c.amount_cents || 0) - (c.refunded_amount_cents || 0) > 0,
  );

  const openRefundModal = () => {
    setRefundChargeId(refundableCharges[0]?.id || '');
    setRefundAmount('');
    setShowRefundModal(true);
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundChargeId) return;
    const charge = charges.find((c) => c.id === refundChargeId);
    if (!charge) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { chargeId: refundChargeId };
      const amt = Math.round(parseFloat(refundAmount || '0') * 100);
      if (amt > 0) body.amountCents = amt;

      const { data, error } = await supabase.functions.invoke('paypal-refund', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await logActivity('refund_charge', {
        charge_id: refundChargeId,
        refunded_cents: data?.refundedCents,
        refund_id: data?.refundId,
      });
      toast(`Refunded ${formatUsd(data?.refundedCents || amt || charge.amount_cents)}.`);
      setShowRefundModal(false);
      fetchDetails();
    } catch (error: any) {
      console.error('Error issuing refund:', error);
      toast(error?.message || 'Failed to issue refund', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRetryCharge = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const lastFailed = charges.find((c) => c.status === 'failed');
      const body: Record<string, unknown> = { tenantId: id };
      if (lastFailed?.idempotency_key) body.idempotencyKey = lastFailed.idempotency_key;

      const { data, error } = await supabase.functions.invoke('paypal-charge', { body });
      if (error) throw error;

      if (data?.success) {
        toast('Payment charged successfully.');
      } else {
        toast(`Charge failed: ${data?.error || `now ${data?.status || 'past_due'}`}`, 'error');
      }
      await logActivity('retry_charge', { result: data?.success ? 'succeeded' : 'failed', status: data?.status });
      fetchDetails();
    } catch (error: any) {
      console.error('Error retrying charge:', error);
      toast(error?.message || 'Failed to charge card', 'error');
    } finally {
      setBusy(false);
    }
  };

  const chargeColumns: ColumnDef<TenantBillingCharge>[] = [
    {
      header: 'Date',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      header: 'Type',
      id: 'kind',
      cell: (row) => <span style={{ textTransform: 'capitalize' }}>{row.kind}</span>,
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Amount',
      id: 'amount_cents',
      cell: (row) => <span style={{ fontWeight: 600 }}>{formatUsd(row.amount_cents)}</span>,
    },
    {
      header: 'Invoice #',
      id: 'invoice_number',
      cell: (row) => row.invoice_number || '—',
    },
    {
      header: 'Refunded',
      id: 'refunded_amount_cents',
      cell: (row) =>
        row.refunded_amount_cents > 0 ? (
          <span style={{ color: 'hsl(var(--destructive))' }}>{formatUsd(row.refunded_amount_cents)}</span>
        ) : (
          '—'
        ),
    },
  ];

  if (loading) {
    return (
      <div className="page-content">
        <p>Loading...</p>
      </div>
    );
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

  const isPastDue = PAST_DUE_STATUSES.includes(business.billing?.status || '');

  return (
    <div className="page-content">
      <button
        className="btn btn--ghost"
        style={{ padding: 0, marginBottom: '1rem', color: 'hsl(var(--muted-foreground))' }}
        onClick={() => navigate('/businesses')}
      >
        <FiArrowLeft /> Back to Businesses
      </button>

      <PageHeader
        title={business.company_name || 'Unnamed Business'}
        subtitle={`Tenant ID: ${business.id}`}
        actions={
          <AdminOnly>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn--secondary" onClick={openEditModal}>
                <FiEdit2 /> Edit Details
              </button>
              <button
                className={`btn ${business.is_deleted ? 'btn--primary' : 'btn--destructive'}`}
                onClick={() => setShowStatusConfirm(true)}
              >
                {business.is_deleted ? <FiPhoneCall /> : <FiPhoneOff />}
                {business.is_deleted ? 'Enable Agent' : 'Disable Agent'}
              </button>
            </div>
          </AdminOnly>
        }
      />

      <div className="dashboard-kpi-row" style={{ marginTop: '2rem' }}>
        <KpiCard label="Net Revenue Collected" value={formatUsd(business.revenue_cents || 0)} variant="success" />
        <KpiCard label="Total Calls Answered" value={(business.call_count || 0).toLocaleString()} />
        <KpiCard label="Member Since" value={new Date(business.created_at).toLocaleDateString()} />
      </div>

      <div className="dashboard-chart-grid">
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Billing & Plan Details</h3>
            <AdminOnly>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn--secondary btn--sm" onClick={() => setShowPlanModal(true)}>
                  <FiSettings /> Change Plan
                </button>
              </div>
            </AdminOnly>
          </div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Account Status</span>
              <span>
                {business.is_deleted ? (
                  <StatusBadge status="canceled" label="Disabled" />
                ) : (
                  <StatusBadge status={business.billing?.status || 'pending'} />
                )}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Current Plan</span>
              <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{business.billing?.plan_tier || 'None'}</span>
            </div>
            {business.billing?.pending_plan_tier && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
                <span className="text-muted">Pending Plan (next cycle)</span>
                <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'hsl(var(--primary))' }}>
                  {business.billing.pending_plan_tier}
                  {business.billing.next_charge_at
                    ? ` · ${new Date(business.billing.next_charge_at).toLocaleDateString()}`
                    : ''}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Calls Left (This Period)</span>
              <span>{business.plan?.calls_left ?? 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem' }}>
              <span className="text-muted">Junk Calls Left</span>
              <span>{business.plan?.junk_calls_left ?? 'N/A'}</span>
            </div>
          </div>

          <AdminOnly>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
              <button className="btn btn--secondary btn--sm" onClick={() => setShowCompModal(true)}>
                <FiPlusCircle /> Grant Calls
              </button>
              <button
                className="btn btn--secondary btn--sm"
                onClick={openRefundModal}
                disabled={refundableCharges.length === 0}
                title={refundableCharges.length === 0 ? 'No refundable charges' : undefined}
              >
                <FiCornerUpLeft /> Issue Refund
              </button>
              {isPastDue && (
                <>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={handleSendReminder}
                    disabled={sendingReminder || !business.billing?.billing_email}
                    title={business.billing?.billing_email ? undefined : 'No billing email on file'}
                  >
                    <FiBell /> {sendingReminder ? 'Sending…' : 'Send Reminder'}
                  </button>
                  <button className="btn btn--primary btn--sm" onClick={() => setShowRetryConfirm(true)} disabled={busy}>
                    <FiRotateCcw /> Retry Charge
                  </button>
                </>
              )}
            </div>
          </AdminOnly>
        </div>

        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Contact Info</h3>
          </div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <p className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                Twilio Phone
              </p>
              <p>{business.twillio_phone || 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                Industry
              </p>
              <p>{business.industry || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                Billing Email
              </p>
              <p>{business.billing?.billing_email || 'Not set'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Billing History &amp; Invoices</h3>
          </div>
          {charges.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <p className="empty-state__text">No transactions yet.</p>
            </div>
          ) : (
            <DataTable data={charges} columns={chargeColumns} />
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showStatusConfirm}
        title={business.is_deleted ? 'Enable Agent' : 'Disable Agent'}
        message={`Are you sure you want to ${business.is_deleted ? 'enable' : 'disable'} the AI agent for ${business.company_name}? ${
          !business.is_deleted ? 'They will no longer receive any automated calls until re-enabled.' : ''
        }`}
        isDestructive={!business.is_deleted}
        confirmLabel={business.is_deleted ? 'Yes, Enable' : 'Yes, Disable'}
        onConfirm={handleToggleStatus}
        onCancel={() => setShowStatusConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showRetryConfirm}
        title="Retry Payment"
        message={`Re-attempt the failed charge for ${business.company_name}? This will charge their vaulted card now.`}
        confirmLabel="Yes, Charge Now"
        onConfirm={handleRetryCharge}
        onCancel={() => setShowRetryConfirm(false)}
      />

      {/* Change Plan Modal */}
      {showPlanModal && (
        <div className="dialog-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Change Subscription Plan</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              {ACTIVE_BILLED_STATUSES.includes(business.billing?.status || '')
                ? `This customer is on a live ${business.billing?.plan_tier || ''} subscription. The new plan and pricing take effect at their next billing cycle${
                    business.billing?.next_charge_at
                      ? ` (${new Date(business.billing.next_charge_at).toLocaleDateString()})`
                      : ''
                  } — their current cycle is not re-charged.`
                : 'This customer is not on a paid cycle yet, so the new plan applies immediately.'}
            </p>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Plan Tier</label>
              <select className="form-input" value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
                <option value="" disabled>
                  Select a plan...
                </option>
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.tier} value={p.tier}>
                    {p.label} - {p.priceLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="dialog-actions">
              <button className="btn btn--ghost" onClick={() => setShowPlanModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn--primary"
                onClick={handleChangePlan}
                disabled={!selectedPlan || selectedPlan === business.billing?.plan_tier}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {showEditModal && (
        <div className="dialog-overlay" onClick={() => setShowEditModal(false)}>
          <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Business Details</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Company Name</label>
                <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Industry</label>
                <input className="form-input" value={editIndustry} onChange={(e) => setEditIndustry(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Twilio Phone</label>
                <input className="form-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Billing Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={editBillingEmail}
                  onChange={(e) => setEditBillingEmail(e.target.value)}
                  disabled={!business.billing}
                  placeholder={business.billing ? '' : 'No billing record'}
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy}>
                  {busy ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grant Calls Modal */}
      {showCompModal && (
        <div className="dialog-overlay" onClick={() => setShowCompModal(false)}>
          <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Grant Calls</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              Add calls to this customer's current balance (e.g. as a goodwill credit). Current balance:{' '}
              {business.plan?.calls_left ?? 'N/A'} calls.
            </p>
            <form onSubmit={handleComp}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Calls to add</label>
                <input
                  type="number"
                  className="form-input"
                  value={compCalls}
                  onChange={(e) => setCompCalls(e.target.value)}
                  placeholder="e.g. 50"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Junk calls to add (optional)</label>
                <input
                  type="number"
                  className="form-input"
                  value={compJunk}
                  onChange={(e) => setCompJunk(e.target.value)}
                  placeholder="e.g. 20"
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowCompModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy}>
                  {busy ? 'Granting...' : 'Grant Calls'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="dialog-overlay" onClick={() => setShowRefundModal(false)}>
          <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Issue Refund</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              Refund a previously-succeeded charge via PayPal. Leave the amount blank for a full refund of the
              remaining balance.
            </p>
            <form onSubmit={handleRefund}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Charge</label>
                <select className="form-input" value={refundChargeId} onChange={(e) => setRefundChargeId(e.target.value)}>
                  {refundableCharges.map((c) => {
                    const remaining = (c.amount_cents || 0) - (c.refunded_amount_cents || 0);
                    return (
                      <option key={c.id} value={c.id}>
                        {new Date(c.created_at).toLocaleDateString()} · {c.kind} · {formatUsd(remaining)} refundable
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Amount (USD, optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Full remaining balance"
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setShowRefundModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--destructive" disabled={busy || !refundChargeId}>
                  {busy ? 'Refunding...' : 'Issue Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
