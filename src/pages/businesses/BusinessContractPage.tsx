import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { useToast } from '@/components/common/Toast';
import { BusinessSubLayout } from '@/components/businesses/BusinessSubLayout';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DataTable, ColumnDef } from '@/components/common/DataTable';
import { reportError } from '@/lib/sentry';
import { formatUsd } from '@/types/domain';
import type {
  TenantContract,
  ContractStatus,
  BillingCadence,
  SupportTier,
  ContractClause,
} from '@/types/domain';
import { generateContractPdf } from '@/lib/contractPdf';
import {
  FiArrowLeft,
  FiDownload,
  FiPlus,
  FiRefreshCw,
  FiFileText,
  FiX,
  FiRotateCcw,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';

/* ------------------------------------------------------------------ */
/*  Constants & Options                                               */
/* ------------------------------------------------------------------ */

const PLAN_TIERS = [
  { value: 'starter', label: 'Starter', rate: 9900, calls: 100, overage: 99 },
  { value: 'pro', label: 'Pro', rate: 29900, calls: 500, overage: 100 },
  { value: 'enterprise', label: 'Enterprise', rate: 49900, calls: 1000, overage: 100, quoteBased: true },
];

const BILLING_CADENCES: { value: BillingCadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual_prepaid', label: 'Annual prepaid' },
];

const COMMITMENT_OPTIONS = [
  { value: 1, label: 'Month-to-month' },
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
  { value: 12, label: '12-month commitment' },
  { value: 24, label: '24 months' },
];

const SUPPORT_CHANNELS = [
  'Email',
  'Phone',
  'Slack / Discord',
  'Dedicated Account Manager',
];

const SUPPORT_TIERS: { value: SupportTier; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'priority', label: 'Priority' },
  { value: 'dedicated', label: 'Dedicated' },
];

const DISCOUNT_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5%' },
  { value: 10, label: '10%' },
  { value: 15, label: '15%' },
  { value: 20, label: '20%' },
  { value: -1, label: 'Custom' },
];

const WIZARD_STEPS = [
  '1. Customer',
  '2. Plan & Billing',
  '3. Integrations & Support',
  '4. Terms',
  '5. Preview',
  '6. Generate',
];

const DEFAULT_TERMS_CLAUSES: ContractClause[] = [
  {
    id: 'c1',
    title: 'Parties and Definitions',
    body: 'This Recurring Services Agreement is entered into between {provider} ("Provider") and {customer} ("Customer"). Capitalized terms have the meanings given in this Agreement and its Schedules, which control in the order: Special Terms, Order Summary, these Terms.',
  },
  {
    id: 'c2',
    title: 'Services and Usage',
    body: 'Provider will make the PromptLine {plan} plan available to Customer, including {calls} billable calls per billing month. Unused calls do not roll over. Billable calls are defined in the Call Usage Schedule as approved by Provider.',
  },
  {
    id: 'c3',
    title: 'Term, Renewal and Cancellation',
    body: 'The subscription begins on {start} on a {term} committed basis and renews automatically for like periods unless either party gives written notice at least {notice} days before renewal.',
  },
  {
    id: 'c4',
    title: 'Fees and Overages',
    body: "Customer authorizes recurring charges per the Order Summary. Billable calls exceeding the monthly allowance are charged at {overage} per call. Taxes are calculated by Provider's billing provider at invoicing. Disputes must be raised in writing within 30 days of invoice.",
  },
  {
    id: 'c5',
    title: 'Implementation and Integrations',
    body: 'No custom integration is included in this Agreement.',
  },
  {
    id: 'c6',
    title: 'Support',
    body: 'Support is provided via {support_channel} at {support_email} at the {support_tier} tier, {support_hours}. Service levels are as defined in the attached SLA exhibit.',
  },
  {
    id: 'c7',
    title: 'Customer Responsibilities',
    body: 'Customer will use the Services lawfully, honor opt-out requests, and is responsible for obtaining all consents required under TCPA, telemarketing and state recording and SMS laws.',
  },
  {
    id: 'c8',
    title: 'Recording, AI Disclosure and Limitations',
    body: 'Calls may be recorded and transcribed. AI agents may produce errors, inaccurate bookings or outages. The Services are not intended for emergency or high-risk use. Except as expressly stated, the Services are provided without warranties.',
  },
  {
    id: 'c9',
    title: 'Data Privacy',
    body: 'Each party will comply with applicable data protection law. Data processing, security, retention and subprocessors are governed by the Data Processing Addendum where attached.',
  },
  {
    id: 'c10',
    title: 'IP and Confidentiality',
    body: "Provider retains all rights in the Services. Customer retains rights in Customer data. Each party will protect the other's confidential information.",
  },
  {
    id: 'c11',
    title: 'Limitation of Liability',
    body: "Neither party is liable for indirect or consequential damages. Each party's aggregate liability is capped as set out in counsel-approved terms, except where non-waivable law provides otherwise.",
  },
  {
    id: 'c12',
    title: 'Termination',
    body: 'Either party may terminate for material breach not cured within 30 days of written notice. Provisions that by nature survive termination will survive.',
  },
  {
    id: 'c13',
    title: 'General',
    body: 'This Agreement is governed by the laws of the State of North Carolina. Electronic signatures are binding. Amendments must be in writing and signed by both parties.',
  },
];

const generateAgreementNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PL-AGR-${year}-${rand}`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/*  Draft shape (100% editable form state)                            */
/* ------------------------------------------------------------------ */

type ContractDraft = {
  agreement_number: string;

  // Step 1: Customer details
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

  // Step 2: Plan & Billing
  plan_tier: string;
  billing_cadence: BillingCadence;
  commitment_months: number;
  base_rate_cents: number;
  discount_percent: number;
  discount_label: string;
  net_rate_cents: number;
  included_calls: number;
  overage_rate_cents: number;
  renewal_notice_days: number;

  // Step 3: Integrations & Support
  custom_integration_required: boolean;
  integration_fees_dollars: number;
  integration_notes: string;
  support_channel: string;
  support_tier: SupportTier;
  support_email: string;
  support_hours: string;
  sla_guaranteed: boolean;

  // Step 4: Terms (editable clauses)
  terms_clauses: ContractClause[];
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

  plan_tier: 'pro',
  billing_cadence: 'monthly',
  commitment_months: 1,
  base_rate_cents: 29900,
  discount_percent: 0,
  discount_label: '',
  net_rate_cents: 29900,
  included_calls: 500,
  overage_rate_cents: 100,
  renewal_notice_days: 30,

  custom_integration_required: false,
  integration_fees_dollars: 0,
  integration_notes: '',
  support_channel: 'Email',
  support_tier: 'standard',
  support_email: 'info@promptline.app',
  support_hours: 'Mon–Fri 9am–5pm ET',
  sla_guaranteed: false,

  terms_clauses: DEFAULT_TERMS_CLAUSES.map((c) => ({ ...c })),
});

/* ------------------------------------------------------------------ */
/*  Interpolate variables in clause template                          */
/* ------------------------------------------------------------------ */

const interpolateClause = (template: string, draft: ContractDraft): string => {
  const planName = draft.plan_tier
    ? draft.plan_tier.charAt(0).toUpperCase() + draft.plan_tier.slice(1)
    : 'Pro';
  const overageFormatted = `$${(draft.overage_rate_cents / 100).toFixed(2)}`;
  const termFormatted =
    draft.commitment_months > 1
      ? `${draft.commitment_months}-month`
      : 'month-to-month';
  const integrationText =
    draft.integration_fees_dollars > 0
      ? `Custom integration and setup is included as specified in the Order Summary (${formatUsd(Math.round(draft.integration_fees_dollars * 100))}${draft.integration_notes ? `: ${draft.integration_notes}` : ''}).`
      : 'No custom integration is included in this Agreement.';

  return template
    .replace(/\{provider\}/g, 'Theoremlabs Partners LLC')
    .replace(/\{customer\}/g, draft.legal_business_name.trim() || '[Customer]')
    .replace(/\{plan\}/g, planName)
    .replace(/\{calls\}/g, draft.included_calls.toLocaleString('en-US'))
    .replace(/\{overage\}/g, overageFormatted)
    .replace(/\{start\}/g, draft.service_start_date || todayStr())
    .replace(/\{term\}/g, termFormatted)
    .replace(/\{notice\}/g, String(draft.renewal_notice_days || 30))
    .replace(
      /\{support_tier\}/g,
      draft.support_tier.charAt(0).toUpperCase() + draft.support_tier.slice(1)
    )
    .replace(/\{support_channel\}/g, (draft.support_channel || 'email').toLowerCase())
    .replace(/\{support_email\}/g, draft.support_email?.trim() || 'info@promptline.app')
    .replace(/\{support_hours\}/g, draft.support_hours || 'Mon–Fri 9am–5pm ET')
    .replace(
      /\{integration_fee\}/g,
      formatUsd(Math.round(draft.integration_fees_dollars * 100))
    )
    .replace(
      /\{onboarding_fee\}/g,
      formatUsd(Math.round(draft.integration_fees_dollars * 100))
    )
    .replace(/\{integration_text\}/g, integrationText);
};

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

  // Wizard state
  const [wizardMode, setWizardMode] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ContractDraft>(blankDraft());
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Step 5 interactive preview state
  const [previewTestCalls, setPreviewTestCalls] = useState(550);
  const [customerExpanded, setCustomerExpanded] = useState(true);

  /* ---- helpers ---- */
  const patch = (updates: Partial<ContractDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...updates };

      // Base rate edits recalculate net rate
      if ('base_rate_cents' in updates || 'discount_percent' in updates) {
        const discountMultiplier = Math.max(0, 1 - next.discount_percent / 100);
        next.net_rate_cents = Math.round(next.base_rate_cents * discountMultiplier);
      }

      // If custom integration unchecked, zero out fee
      if (updates.custom_integration_required === false) {
        next.integration_fees_dollars = 0;
        next.integration_notes = '';
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
      const { data: owner } = await supabase
        .from('users')
        .select('full_name, email, phone')
        .eq('tenant_id', id)
        .limit(1)
        .single();

      const updates: Partial<ContractDraft> = {};
      if (tenant?.company_name) updates.legal_business_name = tenant.company_name;

      // Address
      const addressParts = [
        tenant?.business_address,
        tenant?.city,
      ].filter(Boolean);
      if (addressParts.length > 0) {
        updates.billing_address = addressParts.join(', ');
      }
      if (tenant?.state) updates.state = tenant.state;
      if (tenant?.country) updates.country = tenant.country;

      // Contact & Signer
      if (owner?.full_name) {
        updates.primary_contact_name = owner.full_name;
        updates.authorized_signer_name = owner.full_name;
      }
      if (owner?.email) {
        updates.primary_contact_email = owner.email;
        updates.authorized_signer_email = owner.email;
      }
      if (owner?.phone) {
        updates.primary_contact_phone = owner.phone;
      } else if (tenant?.business_phone) {
        updates.primary_contact_phone = tenant.business_phone;
      }

      // Billing info
      if (billing?.billing_email) {
        updates.accounts_payable_email = billing.billing_email;
      } else if (owner?.email) {
        updates.accounts_payable_email = owner.email;
      }

      if (billing?.plan_tier) {
        const tier = PLAN_TIERS.find((t) => t.value === billing.plan_tier);
        if (tier) {
          updates.plan_tier = tier.value;
          updates.base_rate_cents = tier.rate;
          updates.included_calls = tier.calls;
          updates.overage_rate_cents = tier.overage;
          updates.net_rate_cents = tier.rate;
        }
      }
      if (billing?.subscription_amount_cents && billing.subscription_amount_cents > 0) {
        updates.base_rate_cents = billing.subscription_amount_cents;
        updates.net_rate_cents = billing.subscription_amount_cents;
      }
      if (billing?.calls_included && billing.calls_included > 0) {
        updates.included_calls = billing.calls_included;
      }

      patch(updates);
    } catch {
      // Non-fatal — wizard remains fully editable
    }
  }, [id]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  useEffect(() => {
    autoFillDraft();
  }, [autoFillDraft]);

  /* ---- open wizard ---- */
  const openWizard = () => {
    setDraft(blankDraft());
    setStep(0);
    setGenerated(false);
    setWizardMode(true);
    autoFillDraft();
  };

  /* ---- calculation helpers ---- */
  const discountCents = Math.round(draft.base_rate_cents * (draft.discount_percent / 100));
  const integrationCents = Math.round(draft.integration_fees_dollars * 100);

  const projectedInvoice =
    draft.billing_cadence === 'annual_prepaid'
      ? draft.base_rate_cents * (draft.commitment_months > 1 ? draft.commitment_months : 12) -
        discountCents +
        integrationCents
      : draft.net_rate_cents + integrationCents;

  /* ---- validation issues counter ---- */
  const validationIssues = useMemo(() => {
    const issues: string[] = [];
    if (!draft.legal_business_name.trim()) issues.push('Legal business name required');
    if (!draft.billing_address.trim()) issues.push('Billing address required');
    if (!draft.state.trim()) issues.push('State required');
    if (!draft.country.trim()) issues.push('Country required');
    if (!draft.primary_contact_name.trim()) issues.push('Primary contact name required');
    if (!draft.primary_contact_email.trim()) issues.push('Primary contact email required');
    if (!draft.primary_contact_phone.trim()) issues.push('Primary contact phone required');
    if (!draft.authorized_signer_name.trim()) issues.push('Authorized signer name required');
    if (!draft.authorized_signer_title.trim()) issues.push('Authorized signer title required');
    if (!draft.authorized_signer_email.trim()) issues.push('Authorized signer email required');
    if (draft.base_rate_cents <= 0) issues.push('Base rate must be positive');
    if (draft.included_calls <= 0) issues.push('Included calls must be positive');
    if (draft.terms_clauses.length === 0) issues.push('At least one contract clause required');
    return issues;
  }, [draft]);

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!draft.legal_business_name.trim()) return 'Legal Business Name is required.';
    }
    if (s === 1) {
      if (draft.base_rate_cents <= 0) return 'Base rate must be greater than zero.';
      if (draft.included_calls <= 0) return 'Included calls must be greater than zero.';
    }
    if (s === 3) {
      if (draft.terms_clauses.length === 0) return 'Please add at least one terms clause.';
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      toast(err, 'error');
      return;
    }
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  /* ---- generate PDF & save contract ---- */
  const handleGenerate = async () => {
    if (!id || !adminUser) return;
    setGenerating(true);
    try {
      // 1. Resolve all template tokens in the clauses
      const resolvedClauses = draft.terms_clauses.map((c) => ({
        ...c,
        body: interpolateClause(c.body, draft),
      }));

      // 2. Prepare contract row
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
        renewal_notice_days: draft.renewal_notice_days,
        custom_integration_required: draft.custom_integration_required,
        integration_fees_cents: Math.round(draft.integration_fees_dollars * 100),
        integration_notes: draft.integration_notes || null,
        support_tier: draft.support_tier,
        support_channel: draft.support_channel,
        support_email: draft.support_email,
        support_hours: draft.support_hours,
        sla_guaranteed: draft.sla_guaranteed,
        terms_clauses: resolvedClauses,
        agreement_date: draft.agreement_date,
        service_start_date: draft.service_start_date,
        internal_notes: draft.internal_notes || null,
        status: 'draft' as ContractStatus,
        pdf_storage_path: null,
        generated_by: adminUser.id,
      };

      // 3. Save row to database (with fallback if schema hasn't been updated)
      let savedContract: TenantContract;
      const { data: saved, error: saveErr } = await supabase
        .from('tenant_contracts')
        .upsert(contractRow, { onConflict: 'agreement_number' })
        .select()
        .single();

      if (saveErr) {
        // Fallback: retry with core columns only in case custom columns haven't been run yet
        const {
          terms_clauses: _tc,
          renewal_notice_days: _rnd,
          custom_integration_required: _cir,
          support_channel: _sc,
          support_email: _se,
          support_hours: _sh,
          sla_guaranteed: _sg,
          ...coreRow
        } = contractRow;

        const { data: fallbackSaved, error: fallbackErr } = await supabase
          .from('tenant_contracts')
          .upsert(coreRow, { onConflict: 'agreement_number' })
          .select()
          .single();

        if (fallbackErr) {
          console.error('Error saving contract to database:', fallbackErr);
          throw new Error(`Database save error: ${fallbackErr.message}`);
        }
        savedContract = { ...(fallbackSaved as TenantContract), terms_clauses: resolvedClauses };
      } else {
        savedContract = saved as TenantContract;
      }

      // 4. Generate PDF using the resolved clauses
      const doc = generateContractPdf(savedContract);
      const pdfBlob = doc.output('blob');
      const storagePath = `${id}/${savedContract.agreement_number}.pdf`;

      // 5. Upload to storage bucket
      const { error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
      if (uploadErr) {
        console.error('Error uploading contract PDF to storage:', uploadErr);
        throw new Error(`Storage upload error: ${uploadErr.message}`);
      }

      // 6. Update contract record with pdf path and status
      const { error: updateErr } = await supabase
        .from('tenant_contracts')
        .update({ status: 'generated' as ContractStatus, pdf_storage_path: storagePath })
        .eq('id', savedContract.id);
      if (updateErr) {
        console.error('Error updating contract status:', updateErr);
        throw new Error(`Status update error: ${updateErr.message}`);
      }

      // 7. Download PDF to browser
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${savedContract.agreement_number}.pdf`;
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
      const { data, error } = await supabase.storage
        .from('contracts')
        .download(contract.pdf_storage_path);
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

  /* ---- regenerate existing contract ---- */
  const handleRegenerate = async (contract: TenantContract) => {
    setDraft({
      agreement_number: contract.agreement_number,
      legal_business_name: contract.legal_business_name,
      dba_name: contract.dba_name || '',
      billing_address: contract.billing_address || '',
      country: contract.country || 'United States',
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
      renewal_notice_days: contract.renewal_notice_days || 30,
      custom_integration_required:
        contract.custom_integration_required || contract.integration_fees_cents > 0,
      integration_fees_dollars: contract.integration_fees_cents / 100,
      integration_notes: contract.integration_notes || '',
      support_channel: contract.support_channel || 'Email',
      support_tier: contract.support_tier || 'standard',
      support_email: contract.support_email || 'info@promptline.app',
      support_hours: contract.support_hours || 'Mon–Fri 9am–5pm ET',
      sla_guaranteed: contract.sla_guaranteed || false,
      terms_clauses:
        contract.terms_clauses && contract.terms_clauses.length > 0
          ? contract.terms_clauses.map((c, i) => ({ id: `c_${i}`, ...c }))
          : DEFAULT_TERMS_CLAUSES.map((c) => ({ ...c })),
    });
    setStep(4);
    setGenerated(false);
    setWizardMode(true);
  };

  /* ================================================================ */
  /*  STYLES                                                          */
  /* ================================================================ */

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '0.35rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'hsl(var(--muted-foreground))',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.85rem',
    borderRadius: '6px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    fontSize: '0.9rem',
    color: 'inherit',
    outline: 'none',
  };

  const sidebarRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.45rem 0',
    borderBottom: '1px solid hsl(var(--border))',
    fontSize: '0.85rem',
  };

  /* ================================================================ */
  /*  WIZARD STEP RENDERERS                                           */
  /* ================================================================ */

  /* ---- Step 1: Customer Details ---- */
  const renderStep1 = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.1rem' }}>
      <div className="form-group">
        <label style={labelStyle}>Legal Business Name *</label>
        <input
          style={inputStyle}
          value={draft.legal_business_name}
          onChange={(e) => patch({ legal_business_name: e.target.value })}
          placeholder="e.g. Acme Corp LLC"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>DBA / Trade Name</label>
        <input
          style={inputStyle}
          value={draft.dba_name}
          onChange={(e) => patch({ dba_name: e.target.value })}
          placeholder="e.g. Acme Health"
        />
      </div>

      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Billing Address *</label>
        <input
          style={inputStyle}
          value={draft.billing_address}
          onChange={(e) => patch({ billing_address: e.target.value })}
          placeholder="Street address, Suite, City"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Country *</label>
        <input
          style={inputStyle}
          value={draft.country}
          onChange={(e) => patch({ country: e.target.value })}
          placeholder="e.g. United States"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>State *</label>
        <input
          style={inputStyle}
          value={draft.state}
          onChange={(e) => patch({ state: e.target.value })}
          placeholder="e.g. NC or North Carolina"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Primary Contact Name *</label>
        <input
          style={inputStyle}
          value={draft.primary_contact_name}
          onChange={(e) => patch({ primary_contact_name: e.target.value })}
          placeholder="Full name"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Primary Contact Email *</label>
        <input
          style={inputStyle}
          type="email"
          value={draft.primary_contact_email}
          onChange={(e) => patch({ primary_contact_email: e.target.value })}
          placeholder="contact@example.com"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Primary Contact Phone *</label>
        <input
          style={inputStyle}
          type="tel"
          value={draft.primary_contact_phone}
          onChange={(e) => patch({ primary_contact_phone: e.target.value })}
          placeholder="(555) 000-0000"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Accounts Payable Email</label>
        <input
          style={inputStyle}
          type="email"
          value={draft.accounts_payable_email}
          onChange={(e) => patch({ accounts_payable_email: e.target.value })}
          placeholder="ap@example.com"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Authorized Signer Name *</label>
        <input
          style={inputStyle}
          value={draft.authorized_signer_name}
          onChange={(e) => patch({ authorized_signer_name: e.target.value })}
          placeholder="Full name of signatory"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Authorized Signer Title *</label>
        <input
          style={inputStyle}
          value={draft.authorized_signer_title}
          onChange={(e) => patch({ authorized_signer_title: e.target.value })}
          placeholder="e.g. CEO, Managing Member"
        />
      </div>

      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Authorized Signer Email *</label>
        <input
          style={inputStyle}
          type="email"
          value={draft.authorized_signer_email}
          onChange={(e) => patch({ authorized_signer_email: e.target.value })}
          placeholder="signer@example.com"
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Agreement Date</label>
        <input
          style={inputStyle}
          type="date"
          value={draft.agreement_date}
          onChange={(e) => patch({ agreement_date: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label style={labelStyle}>Service Start Date</label>
        <input
          style={inputStyle}
          type="date"
          value={draft.service_start_date}
          onChange={(e) => patch({ service_start_date: e.target.value })}
        />
      </div>

      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Internal Notes (Not in contract)</label>
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
          value={draft.internal_notes}
          onChange={(e) => patch({ internal_notes: e.target.value })}
          placeholder="Add any internal onboarding or sales notes here..."
        />
      </div>
    </div>
  );

  /* ---- Step 2: Plan & Billing ---- */
  const renderStep2 = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Plan Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {PLAN_TIERS.map((t) => {
            const isSelected = draft.plan_tier === t.value;
            return (
              <div
                key={t.value}
                onClick={() => {
                  patch({
                    plan_tier: t.value,
                    base_rate_cents: t.rate,
                    included_calls: t.calls,
                    overage_rate_cents: t.overage,
                  });
                }}
                style={{
                  padding: '1.25rem',
                  borderRadius: '8px',
                  border: isSelected
                    ? '2px solid hsl(var(--primary))'
                    : '1px solid hsl(var(--border))',
                  background: isSelected
                    ? 'hsl(var(--primary) / 0.08)'
                    : 'hsl(var(--card))',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>
                  {t.label}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
                  {t.quoteBased
                    ? 'Quote-based'
                    : `${formatUsd(t.rate)}/mo · ${t.calls} calls`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Editable Rate Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.1rem' }}>
          <div className="form-group">
            <label style={labelStyle}>Base Rate (USD / Month)</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              step="0.01"
              value={draft.base_rate_cents / 100}
              onChange={(e) => {
                const dollars = parseFloat(e.target.value) || 0;
                patch({ base_rate_cents: Math.round(dollars * 100) });
              }}
            />
          </div>

          <div className="form-group">
            <label style={labelStyle}>Included Billable Calls / Month</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={draft.included_calls}
              onChange={(e) => patch({ included_calls: parseInt(e.target.value, 10) || 0 })}
            />
          </div>

          <div className="form-group">
            <label style={labelStyle}>Overage Rate per Call (USD)</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              step="0.01"
              value={draft.overage_rate_cents / 100}
              onChange={(e) => {
                const dollars = parseFloat(e.target.value) || 0;
                patch({ overage_rate_cents: Math.round(dollars * 100) });
              }}
            />
          </div>

          <div className="form-group">
            <label style={labelStyle}>One-time Onboarding Fee (USD)</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              step="0.01"
              value={draft.integration_fees_dollars}
              onChange={(e) =>
                patch({
                  integration_fees_dollars: parseFloat(e.target.value) || 0,
                  custom_integration_required:
                    parseFloat(e.target.value) > 0 ? true : draft.custom_integration_required,
                })
              }
            />
          </div>

          <div className="form-group">
            <label style={labelStyle}>Billing Cadence</label>
            <select
              style={inputStyle}
              value={draft.billing_cadence}
              onChange={(e) => patch({ billing_cadence: e.target.value as BillingCadence })}
            >
              {BILLING_CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label style={labelStyle}>Commitment</label>
            <select
              style={inputStyle}
              value={draft.commitment_months}
              onChange={(e) => patch({ commitment_months: parseInt(e.target.value, 10) || 1 })}
            >
              {COMMITMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label style={labelStyle}>Discount</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                style={{ ...inputStyle, flex: 1 }}
                value={
                  [0, 5, 10, 15, 20].includes(draft.discount_percent)
                    ? draft.discount_percent
                    : -1
                }
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val >= 0) {
                    patch({ discount_percent: val });
                  } else {
                    patch({ discount_percent: 10 });
                  }
                }}
              >
                {DISCOUNT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              {![0, 5, 10, 15, 20].includes(draft.discount_percent) && (
                <input
                  style={{ ...inputStyle, width: 90 }}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="%"
                  value={draft.discount_percent}
                  onChange={(e) =>
                    patch({
                      discount_percent: Math.min(
                        100,
                        Math.max(0, parseFloat(e.target.value) || 0)
                      ),
                    })
                  }
                />
              )}
            </div>
          </div>

          <div className="form-group">
            <label style={labelStyle}>Renewal Notice (Days)</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={draft.renewal_notice_days}
              onChange={(e) =>
                patch({ renewal_notice_days: parseInt(e.target.value, 10) || 30 })
              }
            />
          </div>
        </div>
      </div>
    );
  };

  /* ---- Step 3: Integrations & Support ---- */
  const renderStep3 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Custom integration checkbox */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.95rem',
        }}
      >
        <input
          type="checkbox"
          checked={draft.custom_integration_required}
          onChange={(e) => patch({ custom_integration_required: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: 'hsl(var(--primary))' }}
        />
        <span>Custom integration required</span>
      </label>

      {draft.custom_integration_required && (
        <div
          style={{
            padding: '1.25rem',
            borderRadius: '8px',
            background: 'hsl(var(--muted) / 0.5)',
            border: '1px solid hsl(var(--border))',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div className="form-group">
            <label style={labelStyle}>Integration &amp; Setup Fee (USD)</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              step="0.01"
              value={draft.integration_fees_dollars}
              onChange={(e) =>
                patch({ integration_fees_dollars: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div className="form-group">
            <label style={labelStyle}>Integration Notes / Scope</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              value={draft.integration_notes}
              onChange={(e) => patch({ integration_notes: e.target.value })}
              placeholder="e.g. Zoho CRM sync, custom webhook routing, database import..."
            />
          </div>
        </div>
      )}

      {/* Support fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.1rem' }}>
        <div className="form-group">
          <label style={labelStyle}>Support Channel</label>
          <select
            style={inputStyle}
            value={draft.support_channel}
            onChange={(e) => patch({ support_channel: e.target.value })}
          >
            {SUPPORT_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label style={labelStyle}>Support Tier</label>
          <select
            style={inputStyle}
            value={draft.support_tier}
            onChange={(e) => patch({ support_tier: e.target.value as SupportTier })}
          >
            {SUPPORT_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label style={labelStyle}>Support Email *</label>
          <input
            style={inputStyle}
            type="email"
            value={draft.support_email}
            onChange={(e) => patch({ support_email: e.target.value })}
            placeholder="info@promptline.app"
          />
        </div>

        <div className="form-group">
          <label style={labelStyle}>Support Hours / Time Zone</label>
          <input
            style={inputStyle}
            value={draft.support_hours}
            onChange={(e) => patch({ support_hours: e.target.value })}
            placeholder="Mon–Fri 9am–5pm ET"
          />
        </div>
      </div>

      {/* SLA guaranteed checkbox */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          cursor: 'pointer',
          fontSize: '0.9rem',
          color: 'hsl(var(--muted-foreground))',
          paddingTop: '0.5rem',
        }}
      >
        <input
          type="checkbox"
          checked={draft.sla_guaranteed}
          onChange={(e) => patch({ sla_guaranteed: e.target.checked })}
          style={{ width: 17, height: 17, accentColor: 'hsl(var(--primary))' }}
        />
        <span>Guaranteed SLA promised (requires SLA exhibit &amp; approval)</span>
      </label>
    </div>
  );

  /* ---- Step 4: Terms (Full Editable Clauses Editor) ---- */
  const renderStep4 = () => {
    const handleResetTerms = () => {
      if (
        window.confirm(
          'This will restore all 13 standard clauses to their default templates. Any custom edits to clauses will be reset. Proceed?'
        )
      ) {
        patch({
          terms_clauses: DEFAULT_TERMS_CLAUSES.map((c) => ({ ...c })),
        });
        toast('Terms reset to standard template');
      }
    };

    const handleUpdateClause = (index: number, field: 'title' | 'body', value: string) => {
      const updated = [...draft.terms_clauses];
      updated[index] = { ...updated[index], [field]: value };
      patch({ terms_clauses: updated });
    };

    const handleDeleteClause = (index: number) => {
      if (draft.terms_clauses.length <= 1) {
        toast('Contract must have at least one clause', 'error');
        return;
      }
      const updated = draft.terms_clauses.filter((_, i) => i !== index);
      patch({ terms_clauses: updated });
    };

    const handleAddClause = () => {
      const newClause: ContractClause = {
        id: `c_${Date.now()}`,
        title: 'New Clause',
        body: 'Terms and conditions for this section.',
      };
      patch({ terms_clauses: [...draft.terms_clauses, newClause] });
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Header bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid hsl(var(--border))',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'uppercase',
              }}
            >
              Terms and Conditions — Template V1.0
            </span>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleResetTerms}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <FiRotateCcw size={14} />
            <span>Reset to template</span>
          </button>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.45 }}>
          Words in <code style={{ color: 'hsl(var(--primary))' }}>{'{braces}'}</code> are filled in
          automatically from the contract (e.g.{' '}
          <code>{'{customer}'}</code>, <code>{'{plan}'}</code>, <code>{'{calls}'}</code>,{' '}
          <code>{'{overage}'}</code>, <code>{'{term}'}</code>). Edits to standard clauses should be
          reviewed by legal.
        </p>

        {/* List of clause cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {draft.terms_clauses.map((clause, idx) => {
            const previewText = interpolateClause(clause.body, draft);
            return (
              <div
                key={clause.id || idx}
                style={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  padding: '1.1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                {/* Clause Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: 'hsl(var(--muted-foreground))',
                      width: 24,
                    }}
                  >
                    {idx + 1}.
                  </span>
                  <input
                    style={{
                      ...inputStyle,
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      flex: 1,
                    }}
                    value={clause.title}
                    onChange={(e) => handleUpdateClause(idx, 'title', e.target.value)}
                    placeholder="Clause Title"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteClause(idx)}
                    title="Remove clause"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'hsl(var(--muted-foreground))',
                      cursor: 'pointer',
                      padding: '0.35rem',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')
                    }
                  >
                    <FiX size={18} />
                  </button>
                </div>

                {/* Clause Body Textarea */}
                <textarea
                  style={{
                    ...inputStyle,
                    minHeight: 80,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    fontSize: '0.85rem',
                  }}
                  value={clause.body}
                  onChange={(e) => handleUpdateClause(idx, 'body', e.target.value)}
                  placeholder="Enter clause body template..."
                />

                {/* Live Preview Strip */}
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'hsl(var(--muted-foreground))',
                    background: 'hsl(var(--muted) / 0.5)',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '6px',
                    lineHeight: 1.45,
                    borderLeft: '3px solid hsl(var(--primary))',
                  }}
                >
                  <strong style={{ color: 'hsl(var(--foreground))' }}>Preview: </strong>
                  {previewText}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add clause button */}
        <button
          type="button"
          className="btn btn--secondary"
          onClick={handleAddClause}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.25rem',
          }}
        >
          <FiPlus />
          <span>Add Clause</span>
        </button>
      </div>
    );
  };

  /* ---- Step 5: Interactive Contract Preview ---- */
  const renderStep5 = () => {
    const tierLabel =
      PLAN_TIERS.find((t) => t.value === draft.plan_tier)?.label ?? draft.plan_tier;

    const overageExcess = Math.max(0, previewTestCalls - draft.included_calls);
    const overageAmount = (overageExcess * draft.overage_rate_cents) / 100;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Customer Header summary (collapsible) */}
        <div
          style={{
            background: 'hsl(var(--card))',
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            padding: '1rem 1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setCustomerExpanded(!customerExpanded)}
          >
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
              Customer: {draft.legal_business_name || 'Not specified'}
            </h4>
            {customerExpanded ? <FiChevronUp /> : <FiChevronDown />}
          </div>

          {customerExpanded && (
            <div
              style={{
                marginTop: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid hsl(var(--border))',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span className="text-muted">Signer: </span>
                <span>
                  {draft.authorized_signer_name} ({draft.authorized_signer_title})
                </span>
              </div>
              <div>
                <span className="text-muted">Signer Email: </span>
                <span>{draft.authorized_signer_email}</span>
              </div>
              <div>
                <span className="text-muted">Billing Address: </span>
                <span>
                  {[draft.billing_address, draft.state, draft.country]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
              <div>
                <span className="text-muted">Service Start Date: </span>
                <span>{draft.service_start_date}</span>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Table */}
        <div
          style={{
            background: 'hsl(var(--card))',
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <tbody>
              {[
                ['Plan', `${tierLabel} · ${draft.billing_cadence === 'monthly' ? 'Monthly' : 'Annual'}`],
                ['Base rate', `${formatUsd(draft.base_rate_cents)}/mo`],
                [
                  'Net subscription',
                  `${formatUsd(draft.net_rate_cents)}/mo${draft.discount_percent > 0 ? ` (${draft.discount_percent}% off)` : ''}`,
                ],
                ['Recurring monthly', `${formatUsd(draft.net_rate_cents)}/mo`],
                ['Included calls', `${draft.included_calls}/mo`],
                ['Overage', `${formatUsd(draft.overage_rate_cents)}/call`],
                ['One-time fees', formatUsd(Math.round(draft.integration_fees_dollars * 100))],
                ['Projected first invoice', formatUsd(projectedInvoice)],
              ].map(([label, value], i, arr) => (
                <tr
                  key={label as string}
                  style={{
                    borderBottom: i < arr.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                    fontWeight: i === 3 || i === 7 ? 700 : 500,
                    background:
                      i === 7 ? 'hsl(var(--primary) / 0.08)' : i % 2 === 0 ? 'transparent' : 'hsl(var(--muted) / 0.25)',
                  }}
                >
                  <td style={{ padding: '0.65rem 1rem', color: i === 7 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
                    {label}
                  </td>
                  <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Overage Example with Interactive Test Input */}
        <div
          style={{
            background: 'hsl(var(--card))',
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <label style={labelStyle}>Overage Example — Billable Calls in a Month</label>
          <input
            style={{ ...inputStyle, maxWidth: 220, fontWeight: 700, fontSize: '1.05rem' }}
            type="number"
            min={0}
            value={previewTestCalls}
            onChange={(e) => setPreviewTestCalls(parseInt(e.target.value, 10) || 0)}
          />
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              background: 'hsl(var(--muted) / 0.5)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
            }}
          >
            Allowance {draft.included_calls}, usage {previewTestCalls} &rArr;{' '}
            {overageExcess} &times; {formatUsd(draft.overage_rate_cents)} ={' '}
            <strong>${overageAmount.toFixed(2)}</strong> overage. Usage charges are variable and
            never part of a fixed total.
          </div>
        </div>

        {/* Invoice Schedule */}
        <div
          style={{
            background: 'hsl(var(--card))',
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            padding: '1.25rem',
          }}
        >
          <label style={labelStyle}>Invoice Schedule</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            <div style={sidebarRowStyle}>
              <span>Month 1 (includes one-time onboarding fee)</span>
              <strong>{formatUsd(projectedInvoice)}</strong>
            </div>
            <div style={sidebarRowStyle}>
              <span>Month 2</span>
              <span>{formatUsd(draft.net_rate_cents)}</span>
            </div>
            <div style={{ ...sidebarRowStyle, borderBottom: 'none' }}>
              <span>Month 3</span>
              <span>{formatUsd(draft.net_rate_cents)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ---- Step 6: Generate ---- */
  const renderStep6 = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '2.5rem 0',
      }}
    >
      <FiFileText style={{ fontSize: '3.5rem', color: 'hsl(var(--primary))' }} />
      <h3 style={{ fontSize: '1.35rem', fontWeight: 700 }}>
        {generated ? 'Contract Generated Successfully!' : 'Ready to Generate Contract'}
      </h3>
      <p className="text-muted" style={{ textAlign: 'center', maxWidth: 480, lineHeight: 1.5 }}>
        {generated
          ? 'Your contract PDF has been saved and downloaded. You can view or download it anytime from the contract history table.'
          : 'This will compile all customer details, pricing terms, and customized clauses into a PromptLine branded PDF, save it to storage, and download it.'}
      </p>
      {!generated && (
        <button
          className="btn btn--primary"
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: '0.85rem 2.25rem',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 600,
          }}
        >
          {generating ? <FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} /> : <FiDownload />}
          {generating ? 'Generating PDF…' : 'Generate PDF'}
        </button>
      )}
      {generated && (
        <button
          className="btn btn--secondary"
          onClick={() => {
            setWizardMode(false);
            setGenerated(false);
          }}
          style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
        >
          View Contract History
        </button>
      )}
    </div>
  );

  /* ---- Live Summary Sidebar (Visible on Steps 0-4) ---- */
  const renderSidebar = () => {
    const tierLabel =
      PLAN_TIERS.find((t) => t.value === draft.plan_tier)?.label ?? draft.plan_tier;
    const issueCount = validationIssues.length;

    return (
      <div
        style={{
          width: 290,
          background: 'hsl(var(--card))',
          borderRadius: '8px',
          border: '1px solid hsl(var(--border))',
          padding: '1.25rem',
          flexShrink: 0,
          position: 'sticky',
          top: '1.5rem',
        }}
      >
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Live summary</h4>
        <div style={sidebarRowStyle}>
          <span className="text-muted">Plan</span>
          <span style={{ fontWeight: 600 }}>
            {tierLabel} · {draft.billing_cadence === 'monthly' ? 'Monthly' : 'Annual'}
          </span>
        </div>
        <div style={sidebarRowStyle}>
          <span className="text-muted">Base rate</span>
          <span>{formatUsd(draft.base_rate_cents)}/mo</span>
        </div>
        <div style={sidebarRowStyle}>
          <span className="text-muted">Net subscription</span>
          <span>{formatUsd(draft.net_rate_cents)}/mo</span>
        </div>
        <div style={{ ...sidebarRowStyle, fontWeight: 700 }}>
          <span>Recurring monthly</span>
          <span>{formatUsd(draft.net_rate_cents)}/mo</span>
        </div>
        <div style={sidebarRowStyle}>
          <span className="text-muted">Included calls</span>
          <span>{draft.included_calls.toLocaleString('en-US')}/mo</span>
        </div>
        <div style={sidebarRowStyle}>
          <span className="text-muted">Overage</span>
          <span>{formatUsd(draft.overage_rate_cents)}/call</span>
        </div>
        <div style={sidebarRowStyle}>
          <span className="text-muted">One-time fees</span>
          <span>{formatUsd(Math.round(draft.integration_fees_dollars * 100))}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.75rem 0 0',
            marginTop: '0.5rem',
            borderTop: '2px solid hsl(var(--primary))',
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          <span>Projected first invoice</span>
          <span style={{ color: 'hsl(var(--primary))' }}>{formatUsd(projectedInvoice)}</span>
        </div>

        {/* Validation issues counter */}
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.6rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.78rem',
            background:
              issueCount === 0
                ? 'hsl(142 76% 36% / 0.12)'
                : 'hsl(var(--muted) / 0.6)',
            color:
              issueCount === 0
                ? 'hsl(142 76% 36%)'
                : 'hsl(var(--muted-foreground))',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {issueCount === 0
            ? '✓ All required fields complete'
            : `${issueCount} open issue${issueCount !== 1 ? 's' : ''} · 0 approval flags`}
        </div>
      </div>
    );
  };

  /* ---- Wizard step top pill navigation ---- */
  const renderStepPills = () => (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginBottom: '1.5rem',
      }}
    >
      {WIZARD_STEPS.map((label, idx) => {
        const isActive = idx === step;
        const isPast = idx < step;
        return (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (idx <= step) setStep(idx);
            }}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '20px',
              border: isActive
                ? '2px solid hsl(var(--primary))'
                : isPast
                  ? '1px solid hsl(var(--border))'
                  : '1px solid hsl(var(--border))',
              background: isActive
                ? 'hsl(var(--primary))'
                : isPast
                  ? 'hsl(var(--muted) / 0.5)'
                  : 'transparent',
              color: isActive
                ? '#fff'
                : isPast
                  ? 'hsl(var(--foreground))'
                  : 'hsl(var(--muted-foreground))',
              fontWeight: isActive ? 700 : 500,
              fontSize: '0.85rem',
              cursor: idx <= step ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  /* ---- Main Wizard Renderer ---- */
  const renderWizard = () => {
    const stepRenderers = [
      renderStep1,
      renderStep2,
      renderStep3,
      renderStep4,
      renderStep5,
      renderStep6,
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {renderStepPills()}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Main content form */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="page-card" style={{ padding: '1.75rem' }}>
              <div className="page-card__header" style={{ marginBottom: '1.5rem' }}>
                <h3 className="page-card__title" style={{ fontSize: '1.35rem' }}>
                  {WIZARD_STEPS[step].replace(/^\d+\.\s*/, '')}
                </h3>
              </div>

              {stepRenderers[step]()}

              {/* Navigation buttons */}
              {step < 5 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: step === 0 ? 'flex-end' : 'space-between',
                    marginTop: '2rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid hsl(var(--border))',
                  }}
                >
                  {step > 0 && (
                    <button className="btn btn--secondary" onClick={handleBack}>
                      Back
                    </button>
                  )}
                  <button className="btn btn--primary" onClick={handleNext}>
                    Continue
                  </button>
                </div>
              )}

              {step === 5 && !generated && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    marginTop: '2rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid hsl(var(--border))',
                  }}
                >
                  <button className="btn btn--secondary" onClick={handleBack}>
                    Back
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Live Summary Sidebar (Steps 0-4) */}
          {step < 5 && renderSidebar()}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  CONTRACT HISTORY VIEW                                           */
  /* ================================================================ */

  const columns: ColumnDef<TenantContract>[] = [
    {
      id: 'agreement_number',
      header: 'Agreement #',
      cell: (row) => <strong>{row.agreement_number}</strong>,
    },
    {
      id: 'plan_tier',
      header: 'Plan',
      cell: (row) => (
        <span style={{ textTransform: 'capitalize' }}>
          {row.plan_tier} · {row.billing_cadence}
        </span>
      ),
    },
    {
      id: 'net_rate_cents',
      header: 'Rate',
      cell: (row) => `${formatUsd(row.net_rate_cents)}/mo`,
    },
    {
      id: 'commitment_months',
      header: 'Term',
      cell: (row) =>
        row.commitment_months > 1 ? `${row.commitment_months} mo` : 'Month-to-month',
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: 'created_at',
      header: 'Date',
      cell: (row) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row) => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {row.pdf_storage_path && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => handleDownloadPdf(row)}
              title="Download PDF"
            >
              <FiDownload /> PDF
            </button>
          )}
          <button
            className="btn btn--secondary btn--sm"
            onClick={() => handleRegenerate(row)}
            title="Edit / Regenerate"
          >
            <FiRefreshCw />
          </button>
        </div>
      ),
    },
  ];

  if (!id) return null;

  return (
    <BusinessSubLayout tenantId={id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Contract</h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            Contract management and PDF generation for this business
          </p>
        </div>
        {!wizardMode ? (
          <button className="btn btn--primary" onClick={openWizard}>
            <FiPlus /> New Contract
          </button>
        ) : (
          <button
            className="btn btn--secondary"
            onClick={() => {
              setWizardMode(false);
              setGenerated(false);
            }}
          >
            <FiArrowLeft /> Exit Wizard
          </button>
        )}
      </div>

      {wizardMode && renderWizard()}

      {!wizardMode && (
        <div className="page-card">
          <div className="page-card__header">
            <h3 className="page-card__title">Contract History</h3>
          </div>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : contracts.length === 0 ? (
            <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <FiFileText style={{ fontSize: '2.5rem', opacity: 0.4, marginBottom: '0.75rem' }} />
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                No contracts generated yet for this business.
              </p>
              <button className="btn btn--primary" onClick={openWizard}>
                <FiPlus /> Generate First Contract
              </button>
            </div>
          ) : (
            <DataTable columns={columns} data={contracts} />
          )}
        </div>
      )}
    </BusinessSubLayout>
  );
};
