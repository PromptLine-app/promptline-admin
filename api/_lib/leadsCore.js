// Pure, side-effect-free helpers for the Lead Pipeline. No DB, no network — so
// they can be unit-tested directly (see src/lib/leadPipeline.test.ts, which
// imports this module).

const ENGAGE_STATUSES = new Set(['new', 'contacted', 'engaged', 'converted', 'dismissed']);

/**
 * Build the "registered but no business" lead list.
 *
 * A lead is a public.users row whose id is NOT referenced by any tenants.owner_user_id
 * (i.e. the user signed up but never created a business). Each lead is merged with
 * its admin_lead_followups row when one exists; otherwise it defaults to stage 'new'
 * with zero attempts.
 *
 * @param {object}   args
 * @param {Array}    args.users     [{ id, email, full_name, created_at }]
 * @param {Array}    args.owners    [{ owner_user_id }] from tenants (any, incl. soft-deleted)
 * @param {Array}    args.followups [{ user_id, status, attempts, notes, last_template, last_contacted_at }]
 * @returns {Array} leads, newest signup first
 */
export const buildLeadList = ({ users = [], owners = [], followups = [] }) => {
  const ownerIds = new Set(owners.map((o) => o && o.owner_user_id).filter(Boolean));
  const followupByUser = new Map(followups.map((f) => [f.user_id, f]));

  return users
    .filter((u) => u && u.id && !ownerIds.has(u.id))
    .map((u) => {
      const f = followupByUser.get(u.id) || null;
      return {
        user_id: u.id,
        email: u.email ?? null,
        full_name: u.full_name ?? null,
        created_at: u.created_at ?? null,
        status: f?.status ?? 'new',
        attempts: f?.attempts ?? 0,
        notes: f?.notes ?? '',
        last_template: f?.last_template ?? null,
        last_contacted_at: f?.last_contacted_at ?? null,
      };
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
};

/**
 * Compute the next admin_lead_followups row after a re-engagement email is sent.
 * Increments the attempt counter and advances the lead to 'contacted' (unless it
 * has already progressed past that — we never regress 'engaged'/'converted').
 *
 * @param {object|null} current  existing followup row (or null for a first touch)
 * @param {object} args  { templateKey, nowIso }
 */
export const nextFollowupOnSend = (current, { templateKey, nowIso }) => {
  const attempts = (current?.attempts ?? 0) + 1;
  const keepStatus = current?.status === 'engaged' || current?.status === 'converted';
  return {
    status: keepStatus ? current.status : 'contacted',
    attempts,
    last_template: templateKey,
    last_contacted_at: nowIso,
  };
};

/** Validate a manual status edit. Returns the status or null if not allowed. */
export const normalizeStatus = (status) =>
  ENGAGE_STATUSES.has(status) ? status : null;

/** Count leads grouped by status — drives the page summary chips. */
export const summarizeLeads = (leads = []) => {
  const counts = { new: 0, contacted: 0, engaged: 0, converted: 0, dismissed: 0 };
  for (const l of leads) {
    if (counts[l.status] !== undefined) counts[l.status] += 1;
  }
  return { total: leads.length, ...counts };
};

// ───────────────────────────── Tenant (business) stages ─────────────────────
//
// A tenant (a created business) is classified into exactly one drop-off stage by
// priority. Active/healthy businesses return null (not a drop-off — hidden from
// the pipeline). Thresholds are passed in (set from admin-confirmed business
// rules), not hard-coded here.

export const TENANT_STAGES = ['churned', 'stalled', 'no_twilio', 'no_calls', 'at_risk'];

const ageDays = (iso, nowMs) =>
  iso ? (nowMs - new Date(iso).getTime()) / 86_400_000 : Infinity;

/**
 * @param {object} t  { onboarded, is_deleted, created_at, twillio_phone,
 *                      billing_status, call_count, last_call_at }
 * @param {object} opts { stalledDays, atRiskDays, nowMs }
 * @returns {string|null} stage, or null when the business is healthy/active
 */
export const classifyTenantStage = (t, { stalledDays, atRiskDays, nowMs }) => {
  if (t.is_deleted || t.billing_status === 'canceled') return 'churned';

  if (!t.onboarded) {
    // Still onboarding — only a drop-off once it's been stalled long enough.
    return ageDays(t.created_at, nowMs) >= stalledDays ? 'stalled' : null;
  }

  if (!t.twillio_phone) return 'no_twilio';
  if ((t.call_count ?? 0) === 0) return 'no_calls';
  if (ageDays(t.last_call_at, nowMs) >= atRiskDays) return 'at_risk';

  return null; // has recent calls → active, not a drop-off
};

/** Owner account email wins; fall back to billing email. */
export const resolveTenantEmail = (tenant, owner, billing) =>
  owner?.email || billing?.billing_email || null;

/**
 * Build the unified pipeline entries for businesses that have dropped off.
 *
 * @param {object} args
 * @param {Array}  args.tenants   [{ id, company_name, owner_user_id, onboarded, is_deleted, created_at, twillio_phone }]
 * @param {Map}    args.usersById          id -> { email, full_name }
 * @param {Map}    args.billingByTenant     tenant_id -> { status, billing_email }
 * @param {Map}    args.callStatsByTenant   tenant_id -> { call_count, last_call_at }
 * @param {Map}    args.followupsByTenant   tenant_id -> followup row
 * @param {object} args.thresholds { stalledDays, atRiskDays }
 * @param {number} args.nowMs
 * @returns {Array} entries (subject_type 'tenant')
 */
export const buildTenantEntries = ({
  tenants = [],
  usersById = new Map(),
  billingByTenant = new Map(),
  callStatsByTenant = new Map(),
  followupsByTenant = new Map(),
  thresholds,
  nowMs,
}) => {
  const entries = [];
  for (const t of tenants) {
    if (!t || !t.id) continue;
    const billing = billingByTenant.get(t.id) || null;
    const stats = callStatsByTenant.get(t.id) || { call_count: 0, last_call_at: null };
    const stage = classifyTenantStage(
      {
        onboarded: t.onboarded,
        is_deleted: t.is_deleted,
        created_at: t.created_at,
        twillio_phone: t.twillio_phone,
        billing_status: billing?.status ?? null,
        call_count: stats.call_count,
        last_call_at: stats.last_call_at,
      },
      { ...thresholds, nowMs },
    );
    if (!stage) continue;

    const owner = t.owner_user_id ? usersById.get(t.owner_user_id) || null : null;
    const f = followupsByTenant.get(t.id) || null;
    entries.push({
      subject_type: 'tenant',
      subject_id: t.id,
      stage,
      name: t.company_name ?? null,
      email: resolveTenantEmail(t, owner, billing),
      since: t.created_at ?? null,
      last_activity_at: stats.last_call_at ?? null,
      status: f?.status ?? 'new',
      attempts: f?.attempts ?? 0,
      notes: f?.notes ?? '',
      last_template: f?.last_template ?? null,
      last_contacted_at: f?.last_contacted_at ?? null,
    });
  }
  return entries;
};

/** Reduce an interactions list (tenant_id, created_at) to per-tenant call stats. */
export const aggregateCallStats = (interactions = []) => {
  const map = new Map();
  for (const i of interactions) {
    if (!i || !i.tenant_id) continue;
    const cur = map.get(i.tenant_id) || { call_count: 0, last_call_at: null };
    cur.call_count += 1;
    if (!cur.last_call_at || String(i.created_at) > String(cur.last_call_at)) {
      cur.last_call_at = i.created_at;
    }
    map.set(i.tenant_id, cur);
  }
  return map;
};

/** Map a no-business lead (buildLeadList output) to a unified pipeline entry. */
export const leadToEntry = (lead) => ({
  subject_type: 'lead',
  subject_id: lead.user_id,
  stage: 'lead',
  name: lead.full_name ?? null,
  email: lead.email ?? null,
  since: lead.created_at ?? null,
  last_activity_at: null,
  status: lead.status,
  attempts: lead.attempts,
  notes: lead.notes,
  last_template: lead.last_template,
  last_contacted_at: lead.last_contacted_at,
});

/** Count pipeline entries grouped by stage — drives the page filter tabs. */
export const summarizeStages = (entries = []) => {
  const counts = { lead: 0, stalled: 0, no_twilio: 0, no_calls: 0, at_risk: 0, churned: 0 };
  for (const e of entries) {
    if (counts[e.stage] !== undefined) counts[e.stage] += 1;
  }
  return { total: entries.length, ...counts };
};
