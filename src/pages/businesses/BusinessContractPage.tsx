import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { useToast } from '@/components/common/Toast';
import { PageHeader } from '@/components/common/PageHeader';
import { BusinessTabs } from '@/components/businesses/BusinessTabs';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { reportError } from '@/lib/sentry';
import { formatUsd } from '@/types/domain';
import type { TenantContract, ContractStatus, BillingCadence, SupportTier } from '@/types/domain';
import { generateContractPdf } from '@/lib/contractPdf';
import { FiArrowLeft, FiDownload, FiPlus, FiRefreshCw, FiFileText, FiSave } from 'react-icons/fi';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const PLAN_TIERS = [
  { value: 'starter', label: 'Starter', rate: 9900, calls: 100 },
  { value: 'pro', label: 'Pro', rate: 29900, calls: 500 },
  { value: 'enterprise', label: 'Enterprise', rate: 49900, calls: 1000 },
];

const BILLING_CADENCES: { value: BillingCadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual_prepaid', label: 'Annual (Prepaid)' },
];

const COMMITMENT_OPTIONS = [
  { value: 1, label: '1 Month (Month-to-Month)' },
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
  { value: 12, label: '12 Months' },
];

const SUPPORT_TIERS: { value: SupportTier; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'priority', label: 'Priority' },
  { value: 'dedicated', label: 'Dedicated' },
];

const TC_CLAUSES = [
  '1. Definitions',
  '2. Service Description & Scope',
  '3. Term & Renewal',
  '4. Fees, Billing & Payment',
  '5. Usage Limits & Overage',
  '6. Customer Obligations',
  '7. Data Privacy & Security',
  '8. Intellectual Property',
  '9. Warranties & Disclaimers',
  '10. Limitation of Liability',
  '11. Indemnification',
  '12. Termination',
  '13. General Provisions',
];

const WIZARD_STEPS = [
  'Customer Details',
  'Plan & Billing',
  'Integrations & Support',
  'Terms Preview',
  'Contract Preview',
  'Generate',
];

const generateAgreementNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PL-AGR-${year}-${rand}`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/*  Draft shape (form state before saving)                            */
/* ------------------------------------------------------------------ */

type ContractDraft = {
  agreement_number: string;
  legal_business_name: string;
  dba_name: string;
  billing_address: string;
  country: string;
  state: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  accounts_payable_email: string;
  authorized_signer_name: string;
  authorized_signer_title: string;
  authorized_signer_email: string;
  agreement_date: string;
  service_start_date: string;
  internal_notes: string;
  plan_tier: string;
  billing_cadence: BillingCadence;
  commitment_months: number;
  base_rate_cents: number;
  discount_percent: number;
  discount_label: string;
  net_rate_cents: number;
  included_calls: number;
  overage_rate_cents: number;
  integration_fees_dollars: number;
  integration_notes: string;
  support_tier: SupportTier;
};

const blankDraft = (): ContractDraft => ({
  agreement_number: generateAgreementNumber(),
  legal_business_name: '',
  dba_name: '',
  billing_address: '',
  country: 'United States',
  state: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
  accounts_payable_email: '',
  authorized_signer_name: '',
  authorized_signer_title: '',
  authorized_signer_email: '',
  agreement_date: todayStr(),
  service_start_date: todayStr(),
  internal_notes: '',
  plan_tier: 'starter',
  billing_cadence: 'monthly',
  commitment_months: 1,
  base_rate_cents: 9900,
  discount_percent: 0,
  discount_label: '',
  net_rate_cents: 9900,
  included_calls: 100,
  overage_rate_cents: 99,
  integration_fees_dollars: 0,
  integration_notes: '',
  support_tier: 'standard',
});

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const BusinessContractPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { adminUser } = useAuth();
  const { toast } = useToast();

  // Data
  const [contracts, setContracts] = useState<TenantContract[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard
  const [wizardMode, setWizardMode] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ContractDraft>(blankDraft());
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  /* ---- helpers ---- */
  const patch = (updates: Partial<ContractDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...updates };
      // Recalculate derived fields
      if ('plan_tier' in updates) {
        const tier = PLAN_TIERS.find((t) => t.value === next.plan_tier);
        if (tier) {
          next.base_rate_cents = tier.rate;
          next.included_calls = tier.calls;
          next.net_rate_cents = Math.round(tier.rate * (1 - next.discount_percent / 100));
        }
      }
      if ('discount_percent' in updates) {
        next.net_rate_cents = Math.round(next.base_rate_cents * (1 - next.discount_percent / 100));
      }
      return next;
    });
  };

  /* ---- fetch contracts ---- */
  const fetchContracts = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('tenant_contracts')
        .select('*')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      reportError(error, { where: 'BusinessContractPage.fetchContracts' });
      console.error('Error fetching contracts:', error);
      toast('Failed to load contracts', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  /* ---- auto-fill from tenant data ---- */
  const autoFillDraft = useCallback(async () => {
    if (!id) return;
    try {
      const { data: tenant } = await supabase.from('tenants').select('*').eq('id', id).single();
      const { data: billing } = await supabase.from('tenant_billing').select('*').eq('tenant_id', id).single();
      const { data: owner } = await supabase.from('users').select('full_name, email, phone').eq('tenant_id', id).limit(1).single();

      const updates: Partial<ContractDraft> = {};
      if (tenant?.company_name) updates.legal_business_name = tenant.company_name;
      if ((tenant as Record<string, unknown>)?.state) updates.state = (tenant as Record<string, unknown>).state as string;
      if (owner?.full_name) updates.primary_contact_name = owner.full_name;
      if (owner?.email) updates.primary_contact_email = owner.email;
      if ((owner as Record<string, unknown>)?.phone) updates.primary_contact_phone = (owner as Record<string, unknown>).phone as string;

      if (billing?.plan_tier) {
        const tier = PLAN_TIERS.find((t) => t.value === billing.plan_tier);
        if (tier) {
          updates.plan_tier = tier.value;
          updates.base_rate_cents = tier.rate;
          updates.included_calls = tier.calls;
          updates.net_rate_cents = tier.rate;
        }
      }
      if (billing?.subscription_amount_cents) {
        updates.base_rate_cents = billing.subscription_amount_cents;
        updates.net_rate_cents = billing.subscription_amount_cents;
      }
      if (billing?.calls_included) updates.included_calls = billing.calls_included;

      patch(updates);
    } catch {
      // Non-fatal — wizard can still be used manually
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; setState runs after await, not during render
    fetchContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally limited to avoid refetch loop
  }, [id]);

  useEffect(() => {
    autoFillDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---- open wizard ---- */
  const openWizard = () => {
    setDraft(blankDraft());
    setStep(0);
    setGenerated(false);
    setWizardMode(true);
    autoFillDraft();
  };

  /* ---- validation ---- */
  const validateStep = (s: number): string | null => {
    if (s === 0 && !draft.legal_business_name.trim()) return 'Legal Business Name is required.';
    if (s === 1) {
      if (!draft.plan_tier) return 'Select a plan tier.';
      if (draft.base_rate_cents <= 0) return 'Base rate must be greater than zero.';
      if (draft.included_calls <= 0) return 'Included calls must be greater than zero.';
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) { toast(err, 'error'); return; }
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  /* ---- generate ---- */
  const handleGenerate = async () => {
    if (!id || !adminUser) return;
    setGenerating(true);
    try {
      const contractRow: Omit<TenantContract, 'id' | 'created_at' | 'updated_at'> = {
        tenant_id: id,
        agreement_number: draft.agreement_number,
        legal_business_name: draft.legal_business_name,
        dba_name: draft.dba_name || null,
        billing_address: draft.billing_address || null,
        country: draft.country,
        state: draft.state || null,
        primary_contact_name: draft.primary_contact_name || null,
        primary_contact_email: draft.primary_contact_email || null,
        primary_contact_phone: draft.primary_contact_phone || null,
        accounts_payable_email: draft.accounts_payable_email || null,
        authorized_signer_name: draft.authorized_signer_name || null,
        authorized_signer_title: draft.authorized_signer_title || null,
        authorized_signer_email: draft.authorized_signer_email || null,
        plan_tier: draft.plan_tier,
        billing_cadence: draft.billing_cadence,
        commitment_months: draft.commitment_months,
        base_rate_cents: draft.base_rate_cents,
        discount_percent: draft.discount_percent,
        discount_label: draft.discount_label || null,
        net_rate_cents: draft.net_rate_cents,
        included_calls: draft.included_calls,
        overage_rate_cents: draft.overage_rate_cents,
        integration_fees_cents: Math.round(draft.integration_fees_dollars * 100),
        integration_notes: draft.integration_notes || null,
        support_tier: draft.support_tier,
        agreement_date: draft.agreement_date,
        service_start_date: draft.service_start_date,
        internal_notes: draft.internal_notes || null,
        status: 'draft' as ContractStatus,
        pdf_storage_path: null,
        generated_by: adminUser.id,
      };

      // Upsert contract
      const { data: saved, error: saveErr } = await supabase
        .from('tenant_contracts')
        .upsert(contractRow, { onConflict: 'agreement_number' })
        .select()
        .single();
      if (saveErr) throw saveErr;

      const contract = saved as TenantContract;

      // Generate PDF
      const doc = generateContractPdf(contract);
      const pdfBlob = doc.output('blob');
      const storagePath = `${id}/${contract.agreement_number}.pdf`;

      const { error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
      if (uploadErr) throw uploadErr;

      // Update contract record
      const { error: updateErr } = await supabase
        .from('tenant_contracts')
        .update({ status: 'generated' as ContractStatus, pdf_storage_path: storagePath })
        .eq('id', contract.id);
      if (updateErr) throw updateErr;

      // Download to browser
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${contract.agreement_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setGenerated(true);
      toast('Contract generated and downloaded successfully!');
      fetchContracts();
    } catch (error) {
      reportError(error, { where: 'BusinessContractPage.handleGenerate' });
      console.error('Error generating contract:', error);
      toast(error instanceof Error ? error.message : 'Failed to generate contract', 'error');
    } finally {
      setGenerating(false);
    }
  };

  /* ---- download existing PDF ---- */
  const handleDownloadPdf = async (contract: TenantContract) => {
    if (!contract.pdf_storage_path) return;
    try {
      const { data, error } = await supabase.storage.from('contracts').download(contract.pdf_storage_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contract.agreement_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      reportError(error, { where: 'BusinessContractPage.handleDownloadPdf' });
      console.error('Error downloading PDF:', error);
      toast('Failed to download PDF', 'error');
    }
  };

  /* ---- regenerate existing ---- */
  const handleRegenerate = async (contract: TenantContract) => {
    setDraft({
      agreement_number: contract.agreement_number,
      legal_business_name: contract.legal_business_name,
      dba_name: contract.dba_name || '',
      billing_address: contract.billing_address || '',
      country: contract.country,
      state: contract.state || '',
      primary_contact_name: contract.primary_contact_name || '',
      primary_contact_email: contract.primary_contact_email || '',
      primary_contact_phone: contract.primary_contact_phone || '',
      accounts_payable_email: contract.accounts_payable_email || '',
      authorized_signer_name: contract.authorized_signer_name || '',
      authorized_signer_title: contract.authorized_signer_title || '',
      authorized_signer_email: contract.authorized_signer_email || '',
      agreement_date: contract.agreement_date,
      service_start_date: contract.service_start_date,
      internal_notes: contract.internal_notes || '',
      plan_tier: contract.plan_tier,
      billing_cadence: contract.billing_cadence,
      commitment_months: contract.commitment_months,
      base_rate_cents: contract.base_rate_cents,
      discount_percent: contract.discount_percent,
      discount_label: contract.discount_label || '',
      net_rate_cents: contract.net_rate_cents,
      included_calls: contract.included_calls,
      overage_rate_cents: contract.overage_rate_cents,
      integration_fees_dollars: contract.integration_fees_cents / 100,
      integration_notes: contract.integration_notes || '',
      support_tier: contract.support_tier,
    });
    setStep(5);
    setGenerated(false);
    setWizardMode(true);
  };

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  const latestContract = contracts[0] ?? null;

  /* ---- styles ---- */
  const stepCircle = (_idx: number, active: boolean, done: boolean): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '0.85rem',
    background: active ? 'hsl(var(--primary))' : done ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
    color: active ? '#fff' : done ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
    border: active ? 'none' : done ? '2px solid hsl(var(--primary))' : '2px solid hsl(var(--border))',
    flexShrink: 0,
  });

  const stepLine: React.CSSProperties = {
    flex: 1, height: 2, background: 'hsl(var(--border))', margin: '0 4px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem',
    fontWeight: 600, color: 'hsl(var(--muted-foreground))',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px',
    border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
    fontSize: '0.9rem', color: 'inherit',
  };

  const readonlyInputStyle: React.CSSProperties = {
    ...inputStyle, background: 'hsl(var(--muted))', cursor: 'default',
  };

  const radioGroupStyle: React.CSSProperties = {
    display: 'flex', gap: '0.75rem', flexWrap: 'wrap',
  };

  const radioCardStyle = (selected: boolean): React.CSSProperties => ({
    padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
    border: selected ? '2px solid hsl(var(--primary))' : '2px solid hsl(var(--border))',
    background: selected ? 'hsl(var(--primary) / 0.06)' : 'hsl(var(--card))',
    fontWeight: selected ? 600 : 400, fontSize: '0.9rem',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  });

  const sidebarRowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0',
    borderBottom: '1px solid hsl(var(--border))', fontSize: '0.85rem',
  };

  const discountCents = Math.round(draft.base_rate_cents * (draft.discount_percent / 100));
  const projectedInvoice =
    draft.billing_cadence === 'annual_prepaid'
      ? draft.base_rate_cents * (draft.commitment_months > 1 ? draft.commitment_months : 12) -
        discountCents +
        Math.round(draft.integration_fees_dollars * 100)
      : draft.net_rate_cents + Math.round(draft.integration_fees_dollars * 100);

  /* ---- Sidebar ---- */
  const renderSidebar = () => (
    <div style={{
      flex: '0 0 320px', background: 'hsl(var(--card))', borderRadius: '12px',
      border: '1px solid hsl(var(--border))', padding: '1.25rem', alignSelf: 'flex-start',
      position: 'sticky', top: '1rem',
    }}>
      <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>Order Summary</h4>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Plan</span>
        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{draft.plan_tier}</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Base Rate</span>
        <span>{formatUsd(draft.base_rate_cents)}/mo</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Discount</span>
        <span>{draft.discount_percent}%</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Net Subscription</span>
        <span style={{ fontWeight: 600 }}>{formatUsd(draft.net_rate_cents)}/mo</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Billing</span>
        <span>{draft.billing_cadence === 'monthly' ? 'Monthly' : 'Annual'}</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Commitment</span>
        <span>{draft.commitment_months} month{draft.commitment_months !== 1 ? 's' : ''}</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Included Calls</span>
        <span>{draft.included_calls}/mo</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Overage Rate</span>
        <span>{formatUsd(draft.overage_rate_cents)}/call</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">One-time Fees</span>
        <span>{formatUsd(Math.round(draft.integration_fees_dollars * 100))}</span>
      </div>
      <div style={sidebarRowStyle}>
        <span className="text-muted">Support</span>
        <span style={{ textTransform: 'capitalize' }}>{draft.support_tier}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0 0',
        marginTop: '0.5rem', borderTop: '2px solid hsl(var(--primary))',
        fontWeight: 700, fontSize: '0.95rem',
      }}>
        <span>Projected First Invoice</span>
        <span style={{ color: 'hsl(var(--primary))' }}>{formatUsd(projectedInvoice)}</span>
      </div>
    </div>
  );

  /* ---- Step indicators ---- */
  const renderStepIndicators = () => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
      {WIZARD_STEPS.map((label, idx) => (
        <div key={label} style={{ display: 'contents' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
            <div style={stepCircle(idx, idx === step, idx < step)}>{idx + 1}</div>
            <span style={{
              fontSize: '0.7rem', fontWeight: idx === step ? 700 : 500, whiteSpace: 'nowrap',
              color: idx === step ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}>{label}</span>
          </div>
          {idx < WIZARD_STEPS.length - 1 && <div style={stepLine} />}
        </div>
      ))}
    </div>
  );

  /* ---- Step 1: Customer Details ---- */
  const renderStep1 = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label className="form-label" style={labelStyle}>Legal Business Name *</label>
        <input className="form-input" style={inputStyle} value={draft.legal_business_name}
          onChange={(e) => patch({ legal_business_name: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>DBA / Trade Name</label>
        <input className="form-input" style={inputStyle} value={draft.dba_name}
          onChange={(e) => patch({ dba_name: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Billing Address</label>
        <input className="form-input" style={inputStyle} value={draft.billing_address}
          onChange={(e) => patch({ billing_address: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Country</label>
        <input className="form-input" style={inputStyle} value={draft.country}
          onChange={(e) => patch({ country: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>State</label>
        <input className="form-input" style={inputStyle} value={draft.state}
          onChange={(e) => patch({ state: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Primary Contact Name</label>
        <input className="form-input" style={inputStyle} value={draft.primary_contact_name}
          onChange={(e) => patch({ primary_contact_name: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Primary Contact Email</label>
        <input className="form-input" style={inputStyle} type="email" value={draft.primary_contact_email}
          onChange={(e) => patch({ primary_contact_email: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Primary Contact Phone</label>
        <input className="form-input" style={inputStyle} type="tel" value={draft.primary_contact_phone}
          onChange={(e) => patch({ primary_contact_phone: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Accounts Payable Email</label>
        <input className="form-input" style={inputStyle} type="email" value={draft.accounts_payable_email}
          onChange={(e) => patch({ accounts_payable_email: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Authorized Signer Name</label>
        <input className="form-input" style={inputStyle} value={draft.authorized_signer_name}
          onChange={(e) => patch({ authorized_signer_name: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Authorized Signer Title</label>
        <input className="form-input" style={inputStyle} value={draft.authorized_signer_title}
          onChange={(e) => patch({ authorized_signer_title: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Authorized Signer Email</label>
        <input className="form-input" style={inputStyle} type="email" value={draft.authorized_signer_email}
          onChange={(e) => patch({ authorized_signer_email: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Agreement Date</label>
        <input className="form-input" style={inputStyle} type="date" value={draft.agreement_date}
          onChange={(e) => patch({ agreement_date: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Service Start Date</label>
        <input className="form-input" style={inputStyle} type="date" value={draft.service_start_date}
          onChange={(e) => patch({ service_start_date: e.target.value })} />
      </div>
      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label className="form-label" style={labelStyle}>Internal Notes</label>
        <textarea className="form-input" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          value={draft.internal_notes} onChange={(e) => patch({ internal_notes: e.target.value })} />
      </div>
    </div>
  );

  /* ---- Step 2: Plan & Billing ---- */
  const renderStep2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Plan Tier */}
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Plan Tier</label>
        <div style={radioGroupStyle}>
          {PLAN_TIERS.map((t) => (
            <label key={t.value} style={radioCardStyle(draft.plan_tier === t.value)}>
              <input type="radio" name="plan_tier" value={t.value}
                checked={draft.plan_tier === t.value}
                onChange={() => patch({ plan_tier: t.value })}
                style={{ display: 'none' }} />
              <span>{t.label} — {formatUsd(t.rate)}/mo</span>
            </label>
          ))}
        </div>
      </div>
      {/* Billing Cadence */}
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Billing Cadence</label>
        <div style={radioGroupStyle}>
          {BILLING_CADENCES.map((c) => (
            <label key={c.value} style={radioCardStyle(draft.billing_cadence === c.value)}>
              <input type="radio" name="billing_cadence" value={c.value}
                checked={draft.billing_cadence === c.value}
                onChange={() => patch({ billing_cadence: c.value })}
                style={{ display: 'none' }} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>
      {/* Commitment Term */}
      <div className="form-group" style={{ maxWidth: 320 }}>
        <label className="form-label" style={labelStyle}>Commitment Term</label>
        <select className="form-input" style={inputStyle}
          value={draft.commitment_months}
          onChange={(e) => patch({ commitment_months: parseInt(e.target.value, 10) })}>
          {COMMITMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {/* Rates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label" style={labelStyle}>Base Monthly Rate</label>
          <input className="form-input" style={readonlyInputStyle} readOnly
            value={formatUsd(draft.base_rate_cents)} />
        </div>
        <div className="form-group">
          <label className="form-label" style={labelStyle}>Discount %</label>
          <input className="form-input" style={inputStyle} type="number" min={0} max={100}
            value={draft.discount_percent}
            onChange={(e) => patch({ discount_percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} />
        </div>
        <div className="form-group">
          <label className="form-label" style={labelStyle}>Net Monthly Rate</label>
          <input className="form-input" style={readonlyInputStyle} readOnly
            value={formatUsd(draft.net_rate_cents)} />
        </div>
      </div>
      <div className="form-group" style={{ maxWidth: 320 }}>
        <label className="form-label" style={labelStyle}>Discount Label</label>
        <input className="form-input" style={inputStyle} placeholder='e.g. "10%, first invoice"'
          value={draft.discount_label} onChange={(e) => patch({ discount_label: e.target.value })} />
      </div>
      {/* Calls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label" style={labelStyle}>Included Calls / Month</label>
          <input className="form-input" style={inputStyle} type="number" min={0}
            value={draft.included_calls}
            onChange={(e) => patch({ included_calls: parseInt(e.target.value, 10) || 0 })} />
        </div>
        <div className="form-group">
          <label className="form-label" style={labelStyle}>Overage Rate (cents / call)</label>
          <input className="form-input" style={inputStyle} type="number" min={0}
            value={draft.overage_rate_cents}
            onChange={(e) => patch({ overage_rate_cents: parseInt(e.target.value, 10) || 0 })} />
        </div>
      </div>
    </div>
  );

  /* ---- Step 3: Integrations & Support ---- */
  const renderStep3 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="form-group" style={{ maxWidth: 320 }}>
        <label className="form-label" style={labelStyle}>Integration / Setup Fees ($)</label>
        <input className="form-input" style={inputStyle} type="number" min={0} step="0.01"
          value={draft.integration_fees_dollars}
          onChange={(e) => patch({ integration_fees_dollars: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Integration Notes</label>
        <textarea className="form-input" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          value={draft.integration_notes}
          onChange={(e) => patch({ integration_notes: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>Support Tier</label>
        <div style={radioGroupStyle}>
          {SUPPORT_TIERS.map((t) => (
            <label key={t.value} style={radioCardStyle(draft.support_tier === t.value)}>
              <input type="radio" name="support_tier" value={t.value}
                checked={draft.support_tier === t.value}
                onChange={() => patch({ support_tier: t.value })}
                style={{ display: 'none' }} />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  /* ---- Step 4: Terms Preview ---- */
  const renderStep4 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
        The following terms and conditions will be included in the generated contract PDF.
      </p>
      <div style={{
        background: 'hsl(var(--muted))', borderRadius: '8px', padding: '1.25rem',
        border: '1px solid hsl(var(--border))',
      }}>
        {TC_CLAUSES.map((clause) => (
          <div key={clause} style={{
            padding: '0.5rem 0', borderBottom: '1px solid hsl(var(--border))',
            fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <FiFileText style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
            {clause}
          </div>
        ))}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
        Full terms will be included in the generated PDF.
      </p>
    </div>
  );

  /* ---- Step 5: Contract Preview ---- */
  const renderStep5 = () => {
    const tierLabel = PLAN_TIERS.find((t) => t.value === draft.plan_tier)?.label ?? draft.plan_tier;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Parties */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem',
        }}>
          <div style={{
            background: 'hsl(var(--muted))', borderRadius: '8px', padding: '1.25rem',
            border: '1px solid hsl(var(--border))',
          }}>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem' }}>Provider</h4>
            <p style={{ fontWeight: 600 }}>PromptLine AI, Inc.</p>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Service Provider</p>
          </div>
          <div style={{
            background: 'hsl(var(--muted))', borderRadius: '8px', padding: '1.25rem',
            border: '1px solid hsl(var(--border))',
          }}>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem' }}>Customer</h4>
            <p style={{ fontWeight: 600 }}>{draft.legal_business_name}</p>
            {draft.dba_name && <p className="text-muted" style={{ fontSize: '0.85rem' }}>DBA: {draft.dba_name}</p>}
            {draft.billing_address && <p className="text-muted" style={{ fontSize: '0.85rem' }}>{draft.billing_address}</p>}
            {(draft.state || draft.country) && (
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>{[draft.state, draft.country].filter(Boolean).join(', ')}</p>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div style={{
          background: 'hsl(var(--card))', borderRadius: '8px', padding: '1.25rem',
          border: '1px solid hsl(var(--border))',
        }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem' }}>Order Summary</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <tbody>
              {[
                ['Agreement #', draft.agreement_number],
                ['Plan Tier', tierLabel],
                ['Base Rate', `${formatUsd(draft.base_rate_cents)}/mo`],
                ['Discount', `${draft.discount_percent}%${draft.discount_label ? ` — ${draft.discount_label}` : ''}`],
                ['Net Monthly Rate', `${formatUsd(draft.net_rate_cents)}/mo`],
                ['Billing Cadence', draft.billing_cadence === 'monthly' ? 'Monthly' : 'Annual (Prepaid)'],
                ['Commitment', `${draft.commitment_months} month${draft.commitment_months !== 1 ? 's' : ''}`],
                ['Included Calls', `${draft.included_calls}/mo`],
                ['Overage Rate', `${formatUsd(draft.overage_rate_cents)}/call`],
                ['Setup / Integration Fees', formatUsd(Math.round(draft.integration_fees_dollars * 100))],
                ['Support Tier', draft.support_tier.charAt(0).toUpperCase() + draft.support_tier.slice(1)],
              ].map(([label, value]) => (
                <tr key={label as string} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <td style={{ padding: '0.5rem 0.5rem 0.5rem 0', color: 'hsl(var(--muted-foreground))' }}>{label}</td>
                  <td style={{ padding: '0.5rem 0', fontWeight: 600, textAlign: 'right' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Key Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{
            background: 'hsl(var(--muted))', borderRadius: '8px', padding: '1rem',
            border: '1px solid hsl(var(--border))',
          }}>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>Agreement Date</span>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{draft.agreement_date}</p>
          </div>
          <div style={{
            background: 'hsl(var(--muted))', borderRadius: '8px', padding: '1rem',
            border: '1px solid hsl(var(--border))',
          }}>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>Service Start Date</span>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{draft.service_start_date}</p>
          </div>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
          Generate the PDF to see the full contract with terms &amp; conditions.
        </p>
      </div>
    );
  };

  /* ---- Step 6: Generate ---- */
  const renderStep6 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem 0' }}>
      <FiFileText style={{ fontSize: '3rem', color: 'hsl(var(--primary))' }} />
      <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
        {generated ? 'Contract Generated Successfully!' : 'Ready to Generate Contract'}
      </h3>
      <p className="text-muted" style={{ textAlign: 'center', maxWidth: 480 }}>
        {generated
          ? 'Your contract PDF has been saved and downloaded. You can find it in the contract history below.'
          : 'This will save the contract details, generate a PDF, upload it to storage, and download it to your browser.'}
      </p>
      {!generated && (
        <button className="btn btn--primary" onClick={handleGenerate} disabled={generating}
          style={{ padding: '0.75rem 2rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {generating ? <FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} /> : <FiDownload />}
          {generating ? 'Generating…' : 'Generate PDF'}
        </button>
      )}
      {generated && (
        <button className="btn btn--secondary" onClick={() => { setWizardMode(false); setGenerated(false); }}
          style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
          View Contract History
        </button>
      )}
    </div>
  );

  /* ---- Wizard renderer ---- */
  const renderWizard = () => {
    const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {renderStepIndicators()}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Main form area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="page-card" style={{ padding: '1.5rem' }}>
              <div className="page-card__header" style={{ marginBottom: '1.25rem' }}>
                <h3 className="page-card__title">{WIZARD_STEPS[step]}</h3>
              </div>
              {stepRenderers[step]()}
              {/* Navigation */}
              {step < 5 && (
                <div style={{
                  display: 'flex', justifyContent: step === 0 ? 'flex-end' : 'space-between',
                  marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid hsl(var(--border))',
                }}>
                  {step > 0 && (
                    <button className="btn btn--secondary" onClick={handleBack}>
                      Back
                    </button>
                  )}
                  <button className="btn btn--primary" onClick={handleNext}>
                    Next
                  </button>
                </div>
              )}
              {step === 5 && !generated && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-start',
                  marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid hsl(var(--border))',
                }}>
                  <button className="btn btn--secondary" onClick={handleBack}>
                    Back
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Sidebar */}
          {renderSidebar()}
        </div>
      </div>
    );
  };

  /* ---- Contract history table columns ---- */
  const contractColumns: ColumnDef<TenantContract>[] = [
    {
      header: 'Agreement #',
      id: 'agreement_number',
      cell: (row) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{row.agreement_number}</span>,
    },
    {
      header: 'Status',
      id: 'status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Plan',
      id: 'plan_tier',
      cell: (row) => <span style={{ textTransform: 'capitalize' }}>{row.plan_tier}</span>,
    },
    {
      header: 'Net Rate',
      id: 'net_rate_cents',
      cell: (row) => <span style={{ fontWeight: 600 }}>{formatUsd(row.net_rate_cents)}/mo</span>,
    },
    {
      header: 'Agreement Date',
      id: 'agreement_date',
      cell: (row) => row.agreement_date,
    },
    {
      header: 'Created',
      id: 'created_at',
      cell: (row) => new Date(row.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
    },
  ];

  /* ---- Latest contract card ---- */
  const renderLatestContract = () => {
    if (!latestContract) return null;
    const tierLabel = PLAN_TIERS.find((t) => t.value === latestContract.plan_tier)?.label ?? latestContract.plan_tier;
    return (
      <div className="page-card" style={{ marginBottom: '1.5rem' }}>
        <div className="page-card__header">
          <h3 className="page-card__title">Latest Contract</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {latestContract.pdf_storage_path && (
              <button className="btn btn--secondary btn--sm" onClick={() => handleDownloadPdf(latestContract)}>
                <FiDownload /> Download PDF
              </button>
            )}
            <button className="btn btn--secondary btn--sm" onClick={() => handleRegenerate(latestContract)}>
              <FiRefreshCw /> Regenerate
            </button>
            <button className="btn btn--primary btn--sm" onClick={openWizard}>
              <FiPlus /> Create New Version
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Agreement #</span>
            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{latestContract.agreement_number}</span>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Status</span>
            <StatusBadge status={latestContract.status} />
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Plan &amp; Rate</span>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{tierLabel} — {formatUsd(latestContract.net_rate_cents)}/mo</span>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Agreement Date</span>
            <span style={{ fontWeight: 600 }}>{latestContract.agreement_date}</span>
          </div>
        </div>
      </div>
    );
  };

  /* ---- View mode (contracts exist) ---- */
  const renderViewMode = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {renderLatestContract()}
      <div className="page-card">
        <div className="page-card__header">
          <h3 className="page-card__title">Contract History</h3>
        </div>
        {contracts.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <p className="empty-state__text">No contracts found for this business.</p>
          </div>
        ) : (
          <DataTable data={contracts} columns={contractColumns} />
        )}
      </div>
    </div>
  );

  /* ---- Empty state (no contracts) ---- */
  const renderEmptyState = () => (
    <div className="page-card">
      <div className="empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <FiFileText style={{ fontSize: '2.5rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Contract Yet</h3>
        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
          Create a contract for this business to define plan terms, billing, and conditions.
        </p>
        <button className="btn btn--primary" onClick={openWizard} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <FiPlus /> Create Contract
        </button>
      </div>
    </div>
  );

  /* ================================================================ */
  /*  Main Return                                                     */
  /* ================================================================ */

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
        title="Contract"
        subtitle={`Contract management for Tenant ID: ${id}`}
      />

      {id && <BusinessTabs tenantId={id} />}

      <div className="dashboard-section">
        {loading ? (
          <p>Loading contracts...</p>
        ) : wizardMode ? (
          renderWizard()
        ) : contracts.length > 0 ? (
          renderViewMode()
        ) : (
          renderEmptyState()
        )}
      </div>

      {/* Spin animation for the generating spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
