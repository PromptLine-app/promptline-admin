import { getAdminClient, requireAdmin } from "../_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req, { requireWriter: false });

    const admin = getAdminClient();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (req.method === "POST") {
      const { contacts } = body;

      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: "No contacts provided" });
      }

      // Deduplicate by email and lead_source to avoid Postgres ON CONFLICT DO UPDATE errors
      const seen = new Set();
      const cleanContacts = [];
      for (const c of contacts) {
        const email = (c.email || "").trim().toLowerCase();
        const source = c.lead_source || "manual";
        const key = `${email}:${source}`;
        if (!email || seen.has(key)) continue;
        seen.add(key);
        cleanContacts.push({
          full_name: c.full_name || "Unknown",
          email,
          phone: c.phone || null,
          company: c.company || null,
          lead_source: source,
          source_id: c.source_id || null,
          industry: c.industry || null,
          monthly_loss: c.monthly_loss || null,
          status: c.status || "active",
          engagement_state: c.engagement_state || "warm",
          tags: c.tags || [],
          updated_at: new Date().toISOString(),
        });
      }

      const { data, error } = await admin
        .from("email_contacts")
        .upsert(cleanContacts, { onConflict: "email,lead_source" })
        .select("id, email, full_name, engagement_state, status");

      if (error) throw error;

      return res.status(200).json({ ok: true, count: cleanContacts.length, data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const status = e?.status || 500;
    console.error("Contacts operation failed:", e?.message || e);
    return res.status(status).json({ error: e?.message || "Failed to upsert contacts" });
  }
}
