// Vercel Serverless Function: List ALL Twilio phone numbers across main account
// + sub-accounts (e.g. "promptline sandbox"), with full pagination.
//
// Cross-references numbers with PromptLine businesses from both Supabase
// projects (prod + test) for env-labelled mapping.
//
// Required server env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   OTHER_SUPABASE_URL, OTHER_SUPABASE_SERVICE_KEY  (the "other" project)

import { requireAdmin } from "../_lib/adminAuth.js";
import { createClient } from "@supabase/supabase-js";

/* ── Twilio helpers ── */

function twilioAuth(sid, token) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilioGet(url, sid, token) {
  const res = await fetch(url, {
    headers: { Authorization: twilioAuth(sid, token) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Twilio ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Paginate through a Twilio list endpoint, following `next_page_uri`.
 * Returns all items from every page.
 */
async function paginateAll(baseUrl, listKey, sid, token) {
  const items = [];
  let url = baseUrl;
  while (url) {
    const data = await twilioGet(url, sid, token);
    const page = data[listKey] || [];
    items.push(...page);
    url = data.next_page_uri
      ? `https://api.twilio.com${data.next_page_uri}`
      : null;
  }
  return items;
}

/* ── Aggregate usage categories to exclude (double-counted) ── */
const EXCLUDED_CATEGORIES = new Set([
  "totalprice",
  "calls",
  "sms",
  "phonenumbers",
  "recordings",
]);

/* ── Phone normalisation ── */
const normalize = (ph) => ph.replace(/\D/g, "").replace(/^1/, "");

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).json({});
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdmin(req);

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
    const days = [30, 60, 90].includes(body?.days) ? body.days : 30;

    // ── Twilio credentials ──
    const mainSid = process.env.TWILIO_ACCOUNT_SID;
    const mainToken = process.env.TWILIO_AUTH_TOKEN;
    if (!mainSid || !mainToken) {
      return res.status(500).json({ error: "Twilio credentials not configured" });
    }

    // ── 1. Discover sub-accounts ──
    const accounts = [{ sid: mainSid, name: "Main Account", isMain: true }];
    try {
      const subAccounts = await paginateAll(
        `https://api.twilio.com/2010-04-01/Accounts.json?PageSize=100`,
        "accounts",
        mainSid,
        mainToken
      );
      for (const sa of subAccounts) {
        // Skip the main account itself (Twilio returns it in the list)
        if (sa.sid === mainSid) continue;
        // Only include active sub-accounts
        if (sa.status !== "active") continue;
        accounts.push({
          sid: sa.sid,
          name: sa.friendly_name || sa.sid,
          isMain: false,
        });
      }
    } catch (e) {
      console.warn("[twilio-numbers] Failed to list sub-accounts:", e.message);
    }

    console.log(
      `[twilio-numbers] Found ${accounts.length} account(s):`,
      accounts.map((a) => `${a.name} (${a.sid.slice(0, 6)}…)`).join(", ")
    );

    // ── 2. Fetch ALL phone numbers from all accounts (paginated) ──
    const allNumbers = [];
    for (const acct of accounts) {
      try {
        const numbers = await paginateAll(
          `https://api.twilio.com/2010-04-01/Accounts/${acct.sid}/IncomingPhoneNumbers.json?PageSize=200`,
          "incoming_phone_numbers",
          mainSid,
          mainToken
        );
        for (const n of numbers) {
          allNumbers.push({
            sid: n.sid,
            phoneNumber: n.phone_number,
            friendlyName: n.friendly_name,
            capabilities: {
              voice: n.capabilities?.voice ?? false,
              sms: n.capabilities?.sms ?? false,
              mms: n.capabilities?.mms ?? false,
            },
            dateCreated: n.date_created,
            accountSid: acct.sid,
            accountName: acct.name,
          });
        }
      } catch (e) {
        console.warn(
          `[twilio-numbers] Failed to list numbers for ${acct.name}:`,
          e.message
        );
      }
    }

    console.log(
      `[twilio-numbers] Total phone numbers across all accounts: ${allNumbers.length}`
    );

    // ── 3. Fetch usage records (from main account, covers billing) ──
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = now.toISOString().split("T")[0];

    const categories = [];
    try {
      const usageRecords = await paginateAll(
        `https://api.twilio.com/2010-04-01/Accounts/${mainSid}/Usage/Records.json?StartDate=${startStr}&EndDate=${endStr}&PageSize=500`,
        "usage_records",
        mainSid,
        mainToken
      );
      for (const r of usageRecords) {
        if (EXCLUDED_CATEGORIES.has(r.category)) continue;
        const price = Math.abs(parseFloat(r.price || "0"));
        if (price > 0) {
          categories.push({
            category: r.category,
            description: r.description,
            price,
            count: parseInt(r.count || "0", 10),
            countUnit: r.count_unit,
          });
        }
      }
    } catch (e) {
      console.warn("[twilio-numbers] Failed to fetch usage records:", e.message);
    }
    categories.sort((a, b) => b.price - a.price);
    const totalSpend = categories.reduce((sum, c) => sum + c.price, 0);

    // Calculate per-number monthly cost from phone-number category data
    const phoneNumberCategoryCost = categories
      .filter((c) => c.category.startsWith("phonenumbers-"))
      .reduce((sum, c) => sum + c.price, 0);
    const perNumberCost =
      allNumbers.length > 0 ? phoneNumberCategoryCost / allNumbers.length : 0;

    // ── 4. Cross-reference with PromptLine businesses (both Supabase projects) ──
    const phoneToBusinessMap = {};

    async function loadBusinessMappings(sbUrl, sbKey, envLabel) {
      try {
        const client = createClient(sbUrl, sbKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: ops } = await client
          .from("tenant_operational_profiles")
          .select("twillio_phone, tenant_id");

        if (!ops || ops.length === 0) return;

        const tenantIds = [
          ...new Set(
            ops.filter((o) => o.twillio_phone).map((o) => o.tenant_id)
          ),
        ];
        if (tenantIds.length === 0) return;

        const { data: tenants } = await client
          .from("tenants")
          .select("id, company_name")
          .in("id", tenantIds);

        const tenantMap = {};
        for (const t of tenants || []) {
          tenantMap[t.id] = t.company_name;
        }

        for (const op of ops) {
          if (!op.twillio_phone) continue;
          const entry = {
            tenantId: op.tenant_id,
            businessName: tenantMap[op.tenant_id] || "Unknown Business",
            env: envLabel,
          };
          phoneToBusinessMap[op.twillio_phone] = entry;
          const norm = normalize(op.twillio_phone);
          if (norm) phoneToBusinessMap[norm] = entry;
          if (norm.length === 10) phoneToBusinessMap[`+1${norm}`] = entry;
        }
      } catch (e) {
        console.warn(
          `[twilio-numbers] Failed to load ${envLabel} mappings:`,
          e.message
        );
      }
    }

    // Load from current project
    const currentUrl =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const currentKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (currentUrl && currentKey) {
      const currentEnv = currentUrl.includes("ahghq") ? "Prod" : "Test";
      await loadBusinessMappings(currentUrl, currentKey, currentEnv);
    }

    // Load from the other project
    const otherUrl = process.env.OTHER_SUPABASE_URL;
    const otherKey = process.env.OTHER_SUPABASE_SERVICE_KEY;
    if (otherUrl && otherKey) {
      const otherEnv = otherUrl.includes("ahghq") ? "Prod" : "Test";
      await loadBusinessMappings(otherUrl, otherKey, otherEnv);
    }

    console.log(
      `[twilio-numbers] Phone-to-business map has ${Object.keys(phoneToBusinessMap).length} entries`
    );

    // ── 5. Match numbers to businesses & build per-business breakdown ──
    const phoneNumbersWithBusiness = allNumbers.map((n) => {
      const match =
        phoneToBusinessMap[n.phoneNumber] ||
        phoneToBusinessMap[normalize(n.phoneNumber)] ||
        phoneToBusinessMap[`sid:${n.sid}`] ||
        null;

      return {
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities,
        dateCreated: n.dateCreated,
        monthlyPrice: perNumberCost,
        businessName: match?.businessName || "Unassigned",
        tenantId: match?.tenantId || null,
        env: match?.env || null,
        accountSid: n.accountSid,
        accountName: n.accountName,
        numberSid: n.sid,
      };
    });

    // Per-business summary
    const businessSummaryMap = {};
    for (const pn of phoneNumbersWithBusiness) {
      const key = pn.tenantId || "unassigned";
      if (!businessSummaryMap[key]) {
        businessSummaryMap[key] = {
          businessName: pn.businessName,
          tenantId: pn.tenantId || "",
          env: pn.env,
          phoneNumbers: [],
          monthlyPhoneCost: 0,
        };
      }
      businessSummaryMap[key].phoneNumbers.push(pn);
      businessSummaryMap[key].monthlyPhoneCost += pn.monthlyPrice;
    }

    const businessBreakdown = Object.values(businessSummaryMap).sort(
      (a, b) => b.monthlyPhoneCost - a.monthlyPhoneCost
    );

    // ── 6. Build response ──
    return res.status(200).json({
      dateRange: { from: startStr, to: endStr },
      days,
      totalSpend: parseFloat(totalSpend.toFixed(2)),
      totalPhoneNumbers: allNumbers.length,
      totalBusinesses: businessBreakdown.filter((b) => b.tenantId).length,
      perNumberCost: parseFloat(perNumberCost.toFixed(2)),

      accounts: accounts.map((a) => ({
        sid: a.sid,
        name: a.name,
        isMain: a.isMain,
        numberCount: allNumbers.filter((n) => n.accountSid === a.sid).length,
      })),

      categories: categories.map((c) => ({
        ...c,
        price: parseFloat(c.price.toFixed(4)),
      })),

      businesses: businessBreakdown.map((b) => ({
        businessName: b.businessName,
        tenantId: b.tenantId,
        env: b.env,
        monthlyPhoneCost: parseFloat(b.monthlyPhoneCost.toFixed(2)),
        phoneNumbers: b.phoneNumbers.map((p) => ({
          phoneNumber: p.phoneNumber,
          friendlyName: p.friendlyName,
          monthlyPrice: parseFloat(p.monthlyPrice.toFixed(2)),
          capabilities: p.capabilities,
          dateCreated: p.dateCreated,
          env: p.env,
          accountSid: p.accountSid,
          accountName: p.accountName,
          numberSid: p.numberSid,
        })),
      })),
    });
  } catch (e) {
    const status = e?.status || 500;
    console.error("[twilio-numbers] Error:", e?.message || e);
    return res
      .status(status)
      .json({ error: e?.message || "Failed to fetch Twilio data" });
  }
}
