# Lead Pipeline — admin feature notes

## What it does

A single page at **/leads** ("Lead Pipeline" nav item) showing **every prospect at every
drop-off stage**, with per-prospect re-engagement (template → send → **attempt counter**,
**status**, **notes**). Stage filter tabs across the top.

### Stages
| Stage | Subject | Detection |
|---|---|---|
| **No Business** (`lead`) | registered user | `public.users` id in no `tenants.owner_user_id` |
| **Setup Stalled** (`stalled`) | business | `tenants.onboarded = false` and created **≥ 2 days** ago |
| **No Twilio** (`no_twilio`) | business | onboarded, `tenants.twillio_phone IS NULL` |
| **No Calls** (`no_calls`) | business | has number, **zero** `interactions` rows |
| **At Risk** (`at_risk`) | business | had calls, none in the last **14 days** |
| **Churned** (`churned`) | business | `tenant_billing.status = 'canceled'` or `tenants.is_deleted` |

Stage priority (each business shows in exactly one): churned → stalled → no_twilio →
no_calls → at_risk → active(hidden). Thresholds (2d / 14d) live in `THRESHOLDS` in
`api/admin/leads.js`. Re-engagement emails go to the business **owner's account email**
(`owner_user_id → users.email`), falling back to `tenant_billing.billing_email`.

### Moving parts
- `migration 20260615120000_create_admin_lead_followups.sql` — follow-up state for leads (keyed by user).
- `migration 20260615130000_create_admin_tenant_followups.sql` — follow-up state for businesses (keyed by tenant).
- `api/admin/leads.js` — service-role endpoint (`GET` unified entries, `POST {action:'send'|'update', subjectType}`).
- `api/_lib/leadsCore.js` — pure logic (orphan filter, tenant-stage classifier, counter/status transitions).
- `api/_lib/leadEmailTemplates.js` — **placeholder** templates (replace the copy).
- `src/pages/leads/LeadPipelinePage.tsx`, `src/lib/leadsApi.ts`.

---

## Pre-reqs before it works live
1. Apply both migrations (`20260615120000_*` and `20260615130000_*`) to the shared
   Supabase project (`czqthypzgxybkprdptzg`).
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in the admin Vercel project
   (already required by `api/admin/impersonate.js` and `api/admin/team.js`).
3. Replace the `[PLACEHOLDER]` copy in `api/_lib/leadEmailTemplates.js`.

---

## Manual smoke test

### A. Lead appears
1. In the Business Center (promptline-secure), **sign up a throwaway user** and verify
   the email, but **do not create a business**.
2. Open the admin app → **Lead Pipeline**. The new user should appear with status
   **new**, **0** attempts, and a "days waiting" of 0.
   - Sanity: a user who *does* own a business must **not** appear here.

### B. Send a re-engagement email (3b)
3. As an **admin** (not viewer), pick a template in the row dropdown → click **Send**.
4. Expect a success toast; the row's **Attempts** becomes **1**, **Status** becomes
   **contacted**, and "last <date>" shows.
5. Confirm the email arrived at the test user's inbox (sent via `send-ms-email`).
6. In Supabase, check `admin_lead_followups` has a row for that `user_id` and
   `admin_activity_log` has an `action = 'send_lead_email'` entry.

### C. Counter + status + notes (3c)
7. Click **Send** again → **Attempts** increments to **2**.
8. Type a **note** in the row and click away (blur) → reload the page; the note persists.
9. Change the **status** dropdown (e.g. to *engaged*) → reload; it persists. Sending
   again must **not** regress *engaged*/*converted* back to *contacted*.

### D. Business drop-off stages
10. **Stalled**: create a business in the Business Center but don't finish onboarding;
    after 2 days it appears under the **Setup Stalled** tab (to test sooner, lower
    `THRESHOLDS.stalledDays` in `api/admin/leads.js`).
11. **No Twilio / No Calls / At Risk / Churned**: a fully-onboarded business with no
    number shows under **No Twilio**; with a number but no calls under **No Calls**;
    a business quiet for 14+ days under **At Risk**; a canceled/ deleted one under
    **Churned**. Verify the **stage tabs** count and filter correctly.
12. Send to a business-stage row → email goes to the **owner's account email**; the
    `admin_activity_log` row has `target_tenant_id` set (vs null for `lead` rows), and
    the counter is tracked in `admin_tenant_followups` (not `admin_lead_followups`).

### E. Permissions
13. Sign in as a **viewer** → the Send button, status dropdown, and notes input are
    hidden (read-only). The server also rejects POSTs from non-admins (403).

### F. No-email edge case
14. (Optional) A prospect with no email on file shows **Send** disabled and the server
    returns a 400 if forced.

---

## Automated coverage
`src/lib/leadPipeline.test.ts` (vitest) covers the pure logic: orphan filtering,
counter increments, status non-regression, status validation, and template rendering.
Run with `npm run test`.
