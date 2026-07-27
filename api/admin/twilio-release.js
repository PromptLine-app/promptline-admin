// Vercel Serverless Function: Release (delete) a Twilio phone number.
//
// POST { numberSid, accountSid }
//
// Calls DELETE on the Twilio API to release the phone number from the
// specified account (main or sub-account). This is destructive — once
// released, the number cannot be recovered.
//
// Required server env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
// Auth: requireAdmin (admin role, not viewer)

import { requireAdmin } from "../_lib/adminAuth.js";
import { createClient } from "@supabase/supabase-js";

function twilioAuth(sid, token) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).json({});
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { adminUser } = await requireAdmin(req, { requireWriter: true });

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
    const { numberSid, accountSid, phoneNumber } = body;

    if (!numberSid || !accountSid) {
      return res
        .status(400)
        .json({ error: "Missing numberSid or accountSid" });
    }

    // Validate SID formats
    if (!numberSid.startsWith("PN")) {
      return res
        .status(400)
        .json({ error: "Invalid numberSid — must start with PN" });
    }
    if (!accountSid.startsWith("AC")) {
      return res
        .status(400)
        .json({ error: "Invalid accountSid — must start with AC" });
    }

    const mainSid = process.env.TWILIO_ACCOUNT_SID;
    const mainToken = process.env.TWILIO_AUTH_TOKEN;
    if (!mainSid || !mainToken) {
      return res
        .status(500)
        .json({ error: "Twilio credentials not configured" });
    }

    // Always authenticate with main account credentials (works for sub-accounts too)
    const auth = twilioAuth(mainSid, mainToken);
    const deleteUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${numberSid}.json`;

    console.log(
      `[twilio-release] Admin ${adminUser.id} releasing number ${numberSid} from account ${accountSid}`
    );

    const deleteRes = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: auth },
    });

    if (!deleteRes.ok) {
      const errorBody = await deleteRes.text().catch(() => "");
      console.error(
        `[twilio-release] Twilio DELETE failed ${deleteRes.status}:`,
        errorBody.slice(0, 300)
      );
      return res.status(deleteRes.status).json({
        error: `Twilio API error: ${deleteRes.status}`,
        detail: errorBody.slice(0, 200),
      });
    }

    console.log(
      `[twilio-release] Successfully released ${numberSid} from ${accountSid}`
    );

    // If we have the phoneNumber string, remove it from the Supabase DB(s)
    if (phoneNumber) {
      const dbs = [
        {
          url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
          key: process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        {
          url: process.env.OTHER_SUPABASE_URL,
          key: process.env.OTHER_SUPABASE_SERVICE_KEY,
        },
      ];

      for (const db of dbs) {
        if (!db.url || !db.key) continue;
        try {
          const client = createClient(db.url, db.key, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const { error } = await client
            .from("tenant_operational_profiles")
            .update({ twillio_phone: null })
            .eq("twillio_phone", phoneNumber);
          if (error) {
            console.warn(
              `[twilio-release] Failed to update DB ${db.url}:`,
              error.message
            );
          } else {
            console.log(
              `[twilio-release] Cleared phone ${phoneNumber} in DB ${db.url}`
            );
          }
        } catch (dbErr) {
          console.warn(
            `[twilio-release] DB connection error for ${db.url}:`,
            dbErr.message
          );
        }
      }
    }

    return res.status(200).json({
      success: true,
      released: numberSid,
      accountSid,
    });
  } catch (e) {
    const status = e?.status || 500;
    console.error("[twilio-release] Error:", e?.message || e);
    return res
      .status(status)
      .json({ error: e?.message || "Failed to release phone number" });
  }
}
