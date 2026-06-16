// Vercel Serverless Function: send a follow-up email to an incomplete signup.
//
// The send-ms-email edge function authorizes its caller by comparing the
// apikey/Authorization against czqth's SUPABASE_SERVICE_ROLE_KEY. That key must
// never be shipped to the browser, so the send is brokered here: the caller is
// verified as a signed-in admin (requireAdmin), then the server calls the edge
// function with the key it holds in its own env.
//
//   POST { to, subject, body, body_type? } -> forwards to send-ms-email
//
// Two different keys are needed because of czqth's 2026-06-16 key rotation:
//   - requireAdmin() validates the caller via GoTrue, which only accepts the
//     LEGACY service_role JWT (SUPABASE_SERVICE_ROLE_KEY) — the new sb_secret_
//     key is rejected by /auth/v1.
//   - send-ms-email compares the apikey against its own (rotated) env, so it
//     only accepts the NEW sb_secret_ key (SUPABASE_SECRET_KEY).
//
// Required server env: SUPABASE_SECRET_KEY (new sb_secret_ key, for the edge-fn
// call), SUPABASE_SERVICE_ROLE_KEY (legacy JWT, used by requireAdmin),
// SUPABASE_URL or VITE_SUPABASE_URL.

import { requireAdmin } from "../_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    await requireAdmin(req); // role 'admin' required

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { to, subject, body: emailBody, body_type } = body;
    if (!to || !subject || !emailBody) {
      return res.status(400).json({ error: "Missing to, subject, or body" });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    // send-ms-email checks apikey === its own SUPABASE_SERVICE_ROLE_KEY, which is
    // the NEW sb_secret_ key after the rotation. Fall back to the service-role
    // key only for environments not yet split into two vars.
    const edgeKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !edgeKey) {
      return res.status(500).json({ error: "Supabase credentials are not configured on the server" });
    }

    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-ms-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Satisfies both the Supabase API gateway and send-ms-email's own
        // apikey === SERVICE_ROLE_KEY check.
        Authorization: `Bearer ${edgeKey}`,
        apikey: edgeKey,
      },
      body: JSON.stringify({ to, subject, body: emailBody, body_type: body_type || "Text" }),
    });

    const result = await emailRes.json().catch(() => null);
    if (!emailRes.ok) {
      const detail = result?.error || result?.details || `Email failed (${emailRes.status})`;
      return res.status(emailRes.status === 401 ? 502 : emailRes.status).json({ error: detail });
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const status = e?.status || 500;
    console.error("Send follow-up email failed:", e?.message || e);
    return res.status(status).json({ error: e?.message || "Send follow-up email failed" });
  }
}
