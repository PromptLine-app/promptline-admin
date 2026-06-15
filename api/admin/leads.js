// Vercel Serverless Function: Lead Pipeline.
//
// Surfaces every prospect at every drop-off stage and drives per-prospect
// re-engagement. Runs server-side because reading public.users / tenants with
// joins requires the service-role key (the browser ships only the anon key).
// Mirrors the api/admin/* pattern (impersonate.js, team.js).
//
// Two kinds of subject:
//   • lead   — a registered user with NO business (no tenants.owner_user_id ref)
//   • tenant — a created business that dropped off (stalled / no_twilio /
//              no_calls / at_risk / churned)
//
//   GET                                              -> { entries, templates, thresholds }
//   POST { action:'send',   subjectType, subjectId, templateKey }
//   POST { action:'update', subjectType, subjectId, status?, notes? }
//
// GET allows viewers; POST (a write/outbound action) requires the 'admin' role.
//
// Required server env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL or VITE_SUPABASE_URL.

import { getAdminClient, requireAdmin } from "../_lib/adminAuth.js";
import {
  buildLeadList,
  leadToEntry,
  buildTenantEntries,
  aggregateCallStats,
  resolveTenantEmail,
} from "../_lib/leadsCore.js";
import { renderTemplate, templateChoices, LEAD_EMAIL_TEMPLATES } from "../_lib/leadEmailTemplates.js";

// Admin-confirmed drop-off thresholds (days).
const THRESHOLDS = { stalledDays: 2, atRiskDays: 14 };

// Which follow-up table + key column backs each subject type.
const FOLLOWUP_REF = {
  lead: { table: "admin_lead_followups", key: "user_id" },
  tenant: { table: "admin_tenant_followups", key: "tenant_id" },
};

export default async function handler(req, res) {
  try {
    const admin = getAdminClient();

    if (req.method === "GET") {
      await requireAdmin(req, { requireWriter: false }); // viewers may read
      const entries = await fetchPipeline(admin);
      return res.status(200).json({ entries, templates: templateChoices(), thresholds: THRESHOLDS });
    }

    if (req.method === "POST") {
      const { adminUser } = await requireAdmin(req); // role 'admin' required
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { action } = body;

      if (action === "send") return sendEmail(admin, adminUser, body, res);
      if (action === "update") return updateFollowup(admin, body, res);
      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const status = e?.status || 500;
    console.error("Leads operation failed:", e?.message || e);
    return res.status(status).json({ error: e?.message || "Leads operation failed" });
  }
}

// Unified entries: no-business leads + dropped-off businesses.
async function fetchPipeline(admin) {
  const [usersRes, tenantsRes, billingRes, interactionsRes, leadFollowupsRes, tenantFollowupsRes] =
    await Promise.all([
      admin.from("users").select("id, email, full_name, created_at"),
      admin
        .from("tenants")
        .select("id, company_name, owner_user_id, onboarded, is_deleted, created_at, twillio_phone"),
      admin.from("tenant_billing").select("tenant_id, status, billing_email"),
      // NOTE: pulled in full and aggregated in JS. Fine at current volume; swap for
      // an aggregate RPC (tenant_id, count, max(created_at)) if interactions grow large.
      admin.from("interactions").select("tenant_id, created_at"),
      admin.from("admin_lead_followups").select("*"),
      admin.from("admin_tenant_followups").select("*"),
    ]);

  for (const r of [usersRes, tenantsRes, billingRes, interactionsRes, leadFollowupsRes, tenantFollowupsRes]) {
    if (r.error) throw r.error;
  }

  const users = usersRes.data || [];
  const tenants = tenantsRes.data || [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const billingByTenant = new Map((billingRes.data || []).map((b) => [b.tenant_id, b]));
  const callStatsByTenant = aggregateCallStats(interactionsRes.data || []);
  const followupsByTenant = new Map((tenantFollowupsRes.data || []).map((f) => [f.tenant_id, f]));

  const leadEntries = buildLeadList({
    users,
    owners: tenants, // tenants carry owner_user_id; buildLeadList reads it
    followups: leadFollowupsRes.data || [],
  }).map(leadToEntry);

  const tenantEntries = buildTenantEntries({
    tenants,
    usersById,
    billingByTenant,
    callStatsByTenant,
    followupsByTenant,
    thresholds: THRESHOLDS,
    nowMs: Date.now(),
  });

  return [...leadEntries, ...tenantEntries].sort((a, b) =>
    String(b.since || "").localeCompare(String(a.since || "")),
  );
}

// Resolve the recipient email + merge name for a subject.
async function resolveRecipient(admin, subjectType, subjectId) {
  if (subjectType === "lead") {
    const { data: user } = await admin
      .from("users")
      .select("id, email, full_name")
      .eq("id", subjectId)
      .maybeSingle();
    if (!user) return null;
    return { to: (user.email || "").trim(), fullName: user.full_name, tenantId: null };
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, company_name, owner_user_id")
    .eq("id", subjectId)
    .maybeSingle();
  if (!tenant) return null;

  let owner = null;
  if (tenant.owner_user_id) {
    const { data } = await admin
      .from("users")
      .select("email, full_name")
      .eq("id", tenant.owner_user_id)
      .maybeSingle();
    owner = data || null;
  }
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("billing_email")
    .eq("tenant_id", subjectId)
    .maybeSingle();

  return {
    to: (resolveTenantEmail(tenant, owner, billing) || "").trim(),
    fullName: owner?.full_name || tenant.company_name,
    tenantId: tenant.id,
  };
}

async function sendEmail(admin, adminUser, body, res) {
  const { subjectType, subjectId, templateKey } = body;
  const ref = FOLLOWUP_REF[subjectType];
  if (!ref || !subjectId || !templateKey) {
    return res.status(400).json({ error: "Missing subjectType, subjectId, or templateKey" });
  }
  if (!LEAD_EMAIL_TEMPLATES[templateKey]) {
    return res.status(400).json({ error: "Unknown template" });
  }

  const recipient = await resolveRecipient(admin, subjectType, subjectId);
  if (!recipient) return res.status(404).json({ error: "Subject not found" });
  if (!recipient.to) return res.status(400).json({ error: "No email on file for this prospect" });

  const rendered = renderTemplate(templateKey, { fullName: recipient.fullName });
  const { error: emailErr, data: emailData } = await admin.functions.invoke("send-ms-email", {
    body: { to: recipient.to, subject: rendered.subject, body: rendered.body, body_type: "HTML" },
  });
  if (emailErr) throw emailErr;
  if (emailData?.error) throw new Error(emailData.error);

  // Bump the counter / advance status (read-modify-write; no concurrent per-subject edits).
  const { data: current } = await admin
    .from(ref.table)
    .select("*")
    .eq(ref.key, subjectId)
    .maybeSingle();
  const attempts = (current?.attempts ?? 0) + 1;
  const keepStatus = current?.status === "engaged" || current?.status === "converted";
  const { error: upErr } = await admin.from(ref.table).upsert(
    {
      [ref.key]: subjectId,
      notes: current?.notes ?? null,
      status: keepStatus ? current.status : "contacted",
      attempts,
      last_template: templateKey,
      last_contacted_at: new Date().toISOString(),
    },
    { onConflict: ref.key },
  );
  if (upErr) throw upErr;

  await admin.from("admin_activity_log").insert({
    admin_user_id: adminUser.id,
    action: "send_lead_email",
    target_tenant_id: recipient.tenantId,
    details: { subject_type: subjectType, subject_id: subjectId, to: recipient.to, template: templateKey },
  });

  return res.status(200).json({ ok: true, attempts });
}

async function updateFollowup(admin, body, res) {
  const { subjectType, subjectId, status, notes } = body;
  const ref = FOLLOWUP_REF[subjectType];
  if (!ref || !subjectId) return res.status(400).json({ error: "Missing subjectType or subjectId" });

  const patch = { [ref.key]: subjectId };
  if (status !== undefined) {
    if (!["new", "contacted", "engaged", "converted", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    patch.status = status;
  }
  if (notes !== undefined) patch.notes = notes;
  if (patch.status === undefined && patch.notes === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const { error } = await admin.from(ref.table).upsert(patch, { onConflict: ref.key });
  if (error) throw error;
  return res.status(200).json({ ok: true });
}
