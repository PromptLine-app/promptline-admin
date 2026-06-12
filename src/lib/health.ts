import type { Tenant, TenantBilling, TenantPlan } from '@/types/domain';

/**
 * Per-business health / churn-risk model. Combines tenant status, billing
 * state, remaining call balance, and recent call volume (rolling 30-day vs the
 * prior 30 days) into a set of flags and an overall severity. Used by the
 * Health (at-risk) page and the dashboard "needs attention" widget so the same
 * rules drive both surfaces.
 */

export type HealthSeverity = 'critical' | 'warning' | 'ok';

export type HealthFlag = {
  code: string;
  label: string;
  severity: 'critical' | 'warning';
};

export type HealthInput = {
  tenant: Tenant;
  billing: TenantBilling | null;
  plan: TenantPlan | null;
  /** Calls in the last 30 days. */
  callsRecent: number;
  /** Calls in the 30 days before that (days 31–60). */
  callsPrior: number;
};

export type BusinessHealth = HealthInput & {
  flags: HealthFlag[];
  severity: HealthSeverity;
  /** 0–100, higher is healthier. */
  score: number;
};

const SEVERITY_RANK: Record<HealthSeverity, number> = {
  critical: 0,
  warning: 1,
  ok: 2,
};

export function computeHealth(input: HealthInput): BusinessHealth {
  const { tenant, billing, plan, callsRecent, callsPrior } = input;
  const flags: HealthFlag[] = [];

  const billingActive = billing?.status === 'active' || billing?.status === 'trialing';

  // --- Billing problems ---
  if (billing?.status === 'suspended') {
    flags.push({ code: 'suspended', label: 'Billing suspended', severity: 'critical' });
  } else if (billing?.status === 'past_due') {
    flags.push({ code: 'past_due', label: 'Payment past due', severity: 'critical' });
  }

  // --- Silent failure: paying but the agent is disabled (they pay, get nothing) ---
  if (tenant.is_deleted && billingActive) {
    flags.push({
      code: 'paying_disabled',
      label: 'Paying but agent disabled',
      severity: 'critical',
    });
  }

  // --- Out of included calls (active customer being cut off) ---
  if (!tenant.is_deleted && billingActive && (plan?.calls_left ?? 1) <= 0) {
    flags.push({ code: 'no_calls_left', label: 'Out of included calls', severity: 'warning' });
  }

  // --- Usage cliff: real history last period, sharp drop this period ---
  if (
    !tenant.is_deleted &&
    billingActive &&
    callsPrior >= 5 &&
    callsRecent < callsPrior * 0.3
  ) {
    flags.push({
      code: 'usage_drop',
      label: 'Call volume dropped sharply',
      severity: 'warning',
    });
  }

  // --- Dormant: active subscription, no calls in 60 days ---
  if (!tenant.is_deleted && billingActive && callsRecent === 0 && callsPrior === 0) {
    flags.push({ code: 'no_activity', label: 'No calls in 60 days', severity: 'warning' });
  }

  // --- Scheduled to cancel ---
  if (billing?.cancel_at_period_end) {
    flags.push({ code: 'canceling', label: 'Cancellation scheduled', severity: 'warning' });
  }

  const severity: HealthSeverity = flags.some((f) => f.severity === 'critical')
    ? 'critical'
    : flags.length > 0
      ? 'warning'
      : 'ok';

  const score = Math.max(
    0,
    100 - flags.reduce((acc, f) => acc + (f.severity === 'critical' ? 50 : 20), 0),
  );

  return { ...input, flags, severity, score };
}

/** Sort comparator: most-at-risk first, then lowest score. */
export const byRisk = (a: BusinessHealth, b: BusinessHealth): number => {
  const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  return s !== 0 ? s : a.score - b.score;
};
