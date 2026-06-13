// Vercel Serverless Function: mint a one-time impersonation magic-link for a
// tenant's owner so an admin can "open customer view".
//
// The GoTrue generateLink call needs the service-role key, so it runs here on the
// server instead of in the browser (where the key used to be leaked). The caller
// must be a signed-in admin with the 'admin' role (requireAdmin).
//
// Required server env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL or VITE_SUPABASE_URL.
// Optional: CUSTOMER_APP_URL / VITE_CUSTOMER_APP_URL (redirect target; must be
// allow-listed in the czqth Supabase auth settings for the magic link to land).

import { getAdminClient, requireAdmin } from "../_lib/adminAuth.js";

const CUSTOMER_APP_URL =
  process.env.CUSTOMER_APP_URL ||
  process.env.VITE_CUSTOMER_APP_URL ||
  "https://promptline-secure.vercel.app";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await requireAdmin(req);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { tenantId } = body;
    if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });

    const admin = getAdminClient();

    // Resolve the tenant owner's login email (owner_user_id -> users.email),
    // falling back to any member with a role on the tenant.
    const { data: tenant } = await admin
      .from("tenants").select("owner_user_id").eq("id", tenantId).single();
    let userId = tenant?.owner_user_id ?? null;
    if (!userId) {
      const { data: role } = await admin
        .from("user_roles").select("user_id").eq("tenant_id", tenantId).limit(1).maybeSingle();
      userId = role?.user_id ?? null;
    }
    if (!userId) return res.status(404).json({ error: "No owner account found for this business" });

    const { data: user } = await admin.from("users").select("email").eq("id", userId).single();
    const email = user?.email;
    if (!email) return res.status(404).json({ error: "Owner has no login email" });

    // Trailing slash so the redirect matches a `https://host/**` allow-list entry.
    const redirectTo = CUSTOMER_APP_URL.endsWith("/") ? CUSTOMER_APP_URL : `${CUSTOMER_APP_URL}/`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error) throw error;
    const link = data?.properties?.action_link;
    if (!link) throw new Error("No action link returned by Supabase");

    return res.status(200).json({ action_link: link, email });
  } catch (e) {
    const status = e?.status || 500;
    console.error("Impersonation failed:", e?.message || e);
    return res.status(status).json({ error: e?.message || "Failed to open customer view" });
  }
}
