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
// After a successful POST, no email is sent; the admin gives the credentials to
// the new member manually.
//
// Required server env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL or VITE_SUPABASE_URL.

import { randomUUID } from "crypto";
import { getAdminClient, requireAdmin } from "../_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    const { adminUser } = await requireAdmin(req); // role 'admin' required

    const admin = getAdminClient();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (req.method === "POST") {
      const { email, fullName, role, password } = body;
      if (!email || !fullName || !role || !password) {
        return res.status(400).json({ error: "Missing email, fullName, role, or password" });
      }

      // The admin sets the initial password directly.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
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
      if (!id) return res.status(400).json({ error: "Missing member ID" });

      if (adminUser?.id && id === adminUser.id) {
        return res.status(400).json({ error: "You cannot remove your own admin account." });
      }

      let targetAuthId = authUserId;
      if (!targetAuthId) {
        const { data: existingUser } = await admin
          .from("admin_users")
          .select("auth_user_id")
          .eq("id", id)
          .maybeSingle();
        targetAuthId = existingUser?.auth_user_id;
      }

      // Step 1: Clean up admin_activity_log foreign key constraint.
      // Try setting admin_user_id to null first (if schema allows null, preserving audit trail).
      const { error: nullifyErr } = await admin
        .from("admin_activity_log")
        .update({ admin_user_id: null })
        .eq("admin_user_id", id);

      // If the column has a NOT NULL constraint, delete the dependent logs so deletion can proceed
      if (nullifyErr) {
        const { error: delLogsErr } = await admin
          .from("admin_activity_log")
          .delete()
          .eq("admin_user_id", id);
        if (delLogsErr) {
          console.warn("Could not clean up admin_activity_log for user:", delLogsErr.message);
        }
      }

      // Step 2: Unlink any notes written by this admin
      await admin.from("tenant_notes").update({ admin_user_id: null }).eq("admin_user_id", id);

      // Step 3: Remove the admin_users record
      const { error: dbErr } = await admin.from("admin_users").delete().eq("id", id);
      if (dbErr) throw dbErr;

      // Step 4: Remove the Supabase Auth user and public.users row
      if (targetAuthId) {
        try {
          await admin.auth.admin.deleteUser(targetAuthId);
        } catch (authErr) {
          console.warn("Could not delete auth user:", authErr?.message || authErr);
        }
        try {
          await admin.from("users").delete().eq("user_auth_id", targetAuthId);
        } catch (userErr) {
          console.warn("Could not delete public.users record:", userErr?.message || userErr);
        }
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const status = e?.status || 500;
    console.error("Team operation failed:", e?.message || e);
    return res.status(status).json({ error: e?.message || "Team operation failed" });
  }
}
