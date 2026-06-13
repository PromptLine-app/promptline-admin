// Shared server-side helpers for the privileged /api/admin/* routes.
//
// These hold the Supabase service-role key (server only, never VITE_-prefixed) to
// perform GoTrue admin operations that cannot run from the browser session:
// minting impersonation magic-links and creating/deleting admin auth users.
//
// requireAdmin() authorizes the CALLER: it reads their Supabase access token from
// the Authorization: Bearer header (the admin app sends its session token),
// verifies it, and confirms an active admin_users row — so these routes can only
// be driven by a signed-in admin, not anyone who finds the URL.
//
// The underscore-prefixed _lib/ folder is ignored by Vercel's routing, so this is
// a plain importable module, not an HTTP endpoint.

import { createClient } from "@supabase/supabase-js";

let cachedAdmin = null;

export const getAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase admin credentials are not configured on the server");
  }
  if (!cachedAdmin) {
    cachedAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedAdmin;
};

/**
 * Authorize a request as an active admin. Throws { status, message } on failure.
 *
 * @param {object} req                      the serverless request
 * @param {object} [opts]
 * @param {boolean} [opts.requireWriter=true] require role 'admin' (reject 'viewer')
 * @returns {Promise<{ user: object, adminUser: object }>}
 */
export const requireAdmin = async (req, { requireWriter = true } = {}) => {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw { status: 401, message: "Missing bearer token" };

  const admin = getAdminClient();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) throw { status: 401, message: "Invalid or expired session" };

  const { data: adminUser, error: adminErr } = await admin
    .from("admin_users")
    .select("id, role, is_active")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .single();
  if (adminErr || !adminUser) throw { status: 403, message: "Not an authorized admin" };
  if (requireWriter && adminUser.role !== "admin") {
    throw { status: 403, message: "Admin role required for this action" };
  }
  return { user: userData.user, adminUser };
};
