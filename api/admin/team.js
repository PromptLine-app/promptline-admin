// Vercel Serverless Function: create / remove an admin team member.
//
// Creating and deleting the auth.users record needs the GoTrue admin API
// (service-role key), so it runs here on the server. The admin_users row (and, on
// delete, the public.users row) are written in the same handler so the operation
// is atomic. The caller must be a signed-in admin with the 'admin' role.
//
//   POST   { email, fullName, role }  -> create auth user + admin_users row
//   DELETE { id, authUserId }         -> remove admin_users + auth user + users
//
// After a successful POST the browser still sends the password-reset "invite"
// email itself (anon-key operation), so the new member sets their own password.
//
// Required server env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL or VITE_SUPABASE_URL.

import { randomUUID } from "crypto";
import { getAdminClient, requireAdmin } from "../_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req); // role 'admin' required

    const admin = getAdminClient();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (req.method === "POST") {
      const { email, fullName, role } = body;
      if (!email || !fullName || !role) {
        return res.status(400).json({ error: "Missing email, fullName, or role" });
      }

      // Throwaway strong password; the member sets their real one via the reset
      // email the browser sends after this returns — no shared secret.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: `Aa1!${randomUUID()}`,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr && !/already|registered|exists/i.test(createErr.message)) throw createErr;

      const authUserId = created?.user?.id;
      if (!authUserId) {
        return res.status(409).json({ error: "A user with that email already exists" });
      }

      const { error: dbErr } = await admin.from("admin_users").insert({
        auth_user_id: authUserId,
        email,
        full_name: fullName,
        role,
        is_active: true,
      });
      if (dbErr) throw dbErr;

      return res.status(200).json({ ok: true, auth_user_id: authUserId });
    }

    if (req.method === "DELETE") {
      const { id, authUserId } = body;
      if (!id || !authUserId) return res.status(400).json({ error: "Missing id or authUserId" });

      const { error: dbErr } = await admin.from("admin_users").delete().eq("id", id);
      if (dbErr) throw dbErr;
      await admin.auth.admin.deleteUser(authUserId);
      await admin.from("users").delete().eq("user_auth_id", authUserId);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const status = e?.status || 500;
    console.error("Team operation failed:", e?.message || e);
    return res.status(status).json({ error: e?.message || "Team operation failed" });
  }
}
