import { getAdminClient, requireAdmin } from "../_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req, { requireWriter: false }); // any active admin

    const admin = getAdminClient();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (req.method === "POST") {
      const { id, name, category, subject, body_html, body_text, variables, is_active } = body;

      if (!name || !subject || !body_html) {
        return res.status(400).json({ error: "Missing required fields (name, subject, or body_html)" });
      }

      const payload = {
        name: name.trim(),
        category: category || "general",
        subject: subject.trim(),
        body_html,
        body_text: body_text || null,
        variables: variables || [],
        is_active: is_active !== undefined ? is_active : true,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        const { data, error } = await admin
          .from("email_templates")
          .update(payload)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      } else {
        const { data, error } = await admin
          .from("email_templates")
          .insert({ ...payload, is_starter: false })
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ ok: true, data });
      }
    }

    if (req.method === "DELETE") {
      const { id } = body;
      if (!id) return res.status(400).json({ error: "Missing template id" });

      const { error } = await admin
        .from("email_templates")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const status = e?.status || 500;
    console.error("Template operation failed:", e?.message || e);
    return res.status(status).json({ error: e?.message || "Failed to process template" });
  }
}
