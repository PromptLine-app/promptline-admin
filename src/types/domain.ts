/* === Domain Types for Admin Dashboard === */

export type AdminRole = 'admin' | 'viewer';

export type AdminUser = {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  is_active: boolean;
  has_business_access: boolean;
  has_infra_access: boolean;
  created_at: string;
  updated_at: string;
};

export type Tenant = {
  id: string;
  company_name: string | null;
  industry: string | null;
  twillio_phone: string | null;
  onboarded: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type TenantBilling = {
  id: string;
  tenant_id: string;
  provider: string;
  paypal_env: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp: string | null;
  status: 'pending' | 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';
  payment_method: string | null;
  plan_tier: 'starter' | 'pro' | null;
  subscription_amount_cents: number | null;
  currency: string;
  calls_included: number | null;
  junk_calls_included: number | null;
  trial_calls_total: number;
  next_charge_at: string | null;
  billing_email: string | null;
  failed_attempts: number;
  last_failed_at: string | null;
  suspended_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  overage_calls: number;
  pending_plan_tier: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantBillingCharge = {
  id: string;
  tenant_id: string;
  paypal_env: string;
  idempotency_key: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  plan_tier: string | null;
  amount_cents: number;
  currency: string;
  kind: 'subscription' | 'overage' | 'manual';
  subtotal_cents: number;
  tax_cents: number;
  overage_cents: number;
  overage_calls: number;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  error_message: string | null;
  invoice_number: string | null;
  refunded_amount_cents: number;
  paypal_refund_id: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantPlan = {
  id: string;
  tenant_id: string;
  calls_left: number;
  junk_calls_left: number;
  created_at: string;
  updated_at: string;
};

export type Interaction = {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  type: string | null;
  channel: string | null;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  summary: string | null;
  eleven_conv_id: string | null;
  created_at: string;
};

export type PromoCode = {
  id: string;
  code: string;
  is_used: boolean;
  discount_type: 'trial_bypass' | 'percentage';
  discount_value: number | null;
  used_by_tenant: string | null;
  used_by_user: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminActivityLog = {
  id: string;
  admin_user_id: string;
  action: string;
  target_tenant_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type SystemErrorLog = {
  id: string;
  category: 'promo' | 'email' | 'billing' | 'twilio' | 'other';
  level: 'error' | 'warning' | 'info';
  tenant_id: string | null;
  error_message: string;
  details: Record<string, unknown>;
  created_at: string;
};

/** Joined view for business list */
export type BusinessRow = Tenant & {
  billing?: TenantBilling | null;
  plan?: TenantPlan | null;
  call_count?: number;
  revenue_cents?: number;
};

/** Plan config (mirrors promptline-secure/src/constants/billing.ts) */
export const PLAN_OPTIONS = [
  {
    tier: 'starter' as const,
    label: 'Starter',
    amountCents: 9900,
    priceLabel: '$99/month',
    monthlyCalls: 100,
    junkCalls: 100,
  },
  {
    tier: 'pro' as const,
    label: 'Pro',
    amountCents: 29900,
    priceLabel: '$299/month',
    monthlyCalls: 500,
    junkCalls: 300,
  },
] as const;

export const getPlanOption = (tier: string | null | undefined) =>
  PLAN_OPTIONS.find((p) => p.tier === tier) ?? null;

export const formatUsd = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
