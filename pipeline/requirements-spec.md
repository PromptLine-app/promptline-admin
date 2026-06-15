# Requirements Specification: Google Calendar Integration for Promptline Business Customers

**Prepared:** 2026-06-15
**Source:** Feature request + codebase analysis of `promptline-admin`

---

## Goal

Business customers (tenants) of Promptline can connect their Google Calendar so that Promptline's voice agent can (a) look up whether the business has availability before promising an appointment slot, and (b) create a confirmed calendar event when a caller books an appointment. The admin dashboard gains a per-business "Calendar" tab that shows connection status, a live free/busy view for today/this week, and the ability to manually create or review appointments. Success means the voice agent can answer "Are you free Tuesday at 2 pm?" with accurate, live information and write a confirmed booking back to the business owner's Google Calendar without the admin ever touching the calendar directly.

---

## Actors / User Roles

| Actor | Description |
|---|---|
| **Business owner (tenant)** | The SMB customer. Authenticates via the customer-facing app (`promptline-secure`). Initiates the Google OAuth consent flow to grant Promptline access to their calendar. |
| **Promptline admin** | Internal staff using this dashboard (`promptline-admin`). Views calendar connection status, free/busy data, and can manually trigger appointment creation on behalf of a business for support purposes. Has `admin` or `viewer` role. |
| **Voice agent (ElevenLabs)** | The automated agent that handles inbound calls per tenant. Calls back-end tool endpoints to check availability and create events. Acts with the permissions of the business owner's stored credentials. |
| **Caller / end customer** | The person calling the business. Has no direct system access; their identity is captured as a `Contact` record. |

---

## Functional Requirements

### Google OAuth Connection (business owner side)

**FR-1.** The system shall provide a "Connect Google Calendar" button in the business owner's settings UI (in `promptline-secure`, not this admin app) that initiates a Google OAuth 2.0 authorization code flow requesting, at minimum, the `https://www.googleapis.com/auth/calendar.events` scope (see scope discussion in Open Questions).

**FR-2.** The system shall exchange the authorization code for an `access_token` and `refresh_token` entirely server-side (in a Vercel serverless function), never exposing either token to the browser.

**FR-3.** The system shall store the `access_token`, `refresh_token`, token expiry, and the connected Google account email in a new Supabase table `tenant_google_calendar` scoped by `tenant_id`. The `refresh_token` and `access_token` shall be stored encrypted at rest (using Supabase Vault or an equivalent server-side encryption wrapper) and shall never be returned to the browser.

**FR-4.** The system shall automatically refresh the `access_token` using the stored `refresh_token` before any Google API call, updating the stored token and expiry upon success.

**FR-5.** The system shall detect if a business owner's Google token is revoked or expired-unrecoverable and mark the `tenant_google_calendar` row with `status = 'disconnected'`, then surface this as an alert in the admin dashboard for that business.

**FR-6.** The system shall allow a business owner to disconnect their Google Calendar from the settings UI, which shall revoke the token via the Google OAuth revoke endpoint and delete the `tenant_google_calendar` row.

**FR-7.** The system shall support only one connected Google Calendar account per tenant at a time. Connecting a new account shall replace the existing connection after explicit confirmation.

### Admin Dashboard — Calendar Tab

**FR-8.** The system shall add a "Calendar" tab to the per-business sub-navigation (`BusinessTabs`) alongside the existing Overview, Agent, Calls, Conversations, Automations, and Notes tabs.

**FR-9.** The Calendar tab shall display the connection status (connected account email, last token refresh time, or disconnected state) at the top of the page.

**FR-10.** When connected, the Calendar tab shall display a free/busy view showing the business's availability for the current day and the next 6 days (7-day rolling window), fetched via the Google Calendar Freebusy API (`POST /calendar/v3/freeBusy`). Busy blocks shall be shown as shaded time ranges; free time shall be visually distinct. The view shall be read-only for `viewer` role admins.

**FR-11.** The Calendar tab shall display a list of upcoming calendar events (next 7 days) fetched via the Google Calendar Events list API (`GET /calendar/v3/calendars/{calendarId}/events`), showing: event title, start/end datetime, status (confirmed/tentative/cancelled), and whether it was created by Promptline (identified by a custom `extendedProperties.private.source = 'promptline'` field).

**FR-12.** Admins with the `admin` role shall be able to manually create a calendar event for a business from the Calendar tab via a form collecting: title, date, start time, end time, attendee name, and attendee email. The event shall be created via the Google Calendar Events insert API (`POST /calendar/v3/calendars/{calendarId}/events`) and tagged with `extendedProperties.private.source = 'promptline'`.

**FR-13.** All Google API calls from the admin dashboard shall be routed through a new Vercel serverless function (`/api/calendar/*`) that re-validates the admin's bearer token (`requireAdmin`) before touching any tenant's calendar credentials. No Google tokens or credentials shall ever be returned to or called from the browser.

### Voice Agent Integration

**FR-14.** The system shall expose a server-side tool endpoint (Supabase Edge Function or Vercel function) callable by the ElevenLabs agent that accepts a `tenant_id`, a desired `start_datetime` (ISO 8601), and a `duration_minutes` parameter, and returns a boolean `available` field indicating whether the business calendar has no conflicting busy blocks in that window.

**FR-15.** The system shall expose a server-side tool endpoint callable by the ElevenLabs agent that accepts `tenant_id`, `start_datetime`, `end_datetime`, `attendee_name`, `attendee_phone`, and `attendee_email` (optional), creates a Google Calendar event, stores a record in a new Supabase table `appointments` (see Data Entities), and returns the created event ID and a human-readable confirmation string.

**FR-16.** The voice agent tool endpoints shall authenticate callers using a shared per-tenant secret or the existing ElevenLabs webhook signature mechanism; they shall not accept unauthenticated requests.

**FR-17.** If the Google Calendar API is unreachable or returns an error during a voice call, the tool endpoint shall return a graceful fallback response (e.g., `{"available": null, "reason": "calendar_unavailable"}`) so the agent can tell the caller it cannot confirm availability right now rather than failing the call.

### Appointment Records

**FR-18.** The system shall write an `appointments` row in Supabase for every event created via Promptline (both from the agent and from the admin manual-create form), capturing: `id`, `tenant_id`, `google_event_id`, `contact_id` (nullable FK to `contacts`), `title`, `start_at`, `end_at`, `attendee_name`, `attendee_email`, `attendee_phone`, `source` (`agent` or `admin`), `status` (`confirmed`, `cancelled`), `created_at`, `updated_at`.

**FR-19.** The Appointments list on the Calendar tab shall be driven by the `appointments` table (not solely by real-time Google API calls) to allow filtering and to survive Google token disconnection.

---

## Non-Functional Requirements

**NFR-1. Security — token isolation:** Google OAuth tokens are stored per tenant and accessed only through server-side functions that first verify the requesting admin's or agent's identity. A token for Tenant A must never be used to access Tenant B's calendar (classic IDOR risk; the same risk the CLAUDE.md flags for all provider keys).

**NFR-2. Security — secrets never in browser bundle:** `GOOGLE_CLIENT_SECRET` and all stored Google tokens must be held server-side only. They must not be prefixed with `VITE_` and must not appear in the browser bundle or in API responses to the browser.

**NFR-3. Security — consent screen compliance:** The OAuth consent screen must display a link to Promptline's Privacy Policy and Terms of Service. If the `calendar.events` scope is used (recommended over `calendar.readwrite`), the app may qualify for the "sensitive" tier rather than the "restricted" tier, which has lighter verification requirements (see Open Questions).

**NFR-4. Performance:** Free/busy API responses shall be cached server-side (in-memory or via Supabase) for no more than 2 minutes per tenant to avoid hitting Google API rate limits during rapid admin page refreshes. The Calendar tab shall render within 2 seconds on a warm cache.

**NFR-5. Rate limits:** The system shall not make more than 1 Google Calendar API request per tenant per 30 seconds from the voice agent path, enforcing this with a short-circuit in the tool endpoint. Google's per-project quota is 1 million queries/day; the per-user quota is 10 requests/second.

**NFR-6. Scope minimality:** The system shall request only the minimum Google OAuth scopes necessary. If appointment creation and free/busy lookup are the only needs, `https://www.googleapis.com/auth/calendar.events` is sufficient and preferred over the broader `calendar` or `calendar.readwrite` scopes.

**NFR-7. Platform:** The integration must work within the existing Vercel + Supabase deployment. No new infrastructure is required. New API handlers follow the established pattern in `api/` (plain JS Vercel functions with `requireAdmin` from `api/_lib/adminAuth.js`).

**NFR-8. Tenant isolation:** Row-level security policies on `tenant_google_calendar` and `appointments` must restrict reads/writes to the owning tenant, consistent with existing RLS patterns on `tenant_billing`, `tenant_plan`, etc.

**NFR-9. Error observability:** All Google API errors must be captured in Sentry (via the existing `@sentry/react` + server-side Sentry Node SDK if added) with the `tenant_id` as a Sentry tag, but without logging the OAuth token value.

---

## Data Entities

### `tenant_google_calendar` (new table)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK → tenants.id | unique; one row per tenant |
| `google_account_email` | text | The Google account that granted consent |
| `calendar_id` | text | Usually `primary`; stored after discovery |
| `access_token_enc` | text | Encrypted access token |
| `refresh_token_enc` | text | Encrypted refresh token |
| `token_expires_at` | timestamptz | When the current access_token expires |
| `status` | text | `connected`, `disconnected`, `error` |
| `scopes_granted` | text[] | Scopes actually granted by the user |
| `connected_at` | timestamptz | |
| `last_refreshed_at` | timestamptz | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `appointments` (new table)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK → tenants.id | |
| `google_event_id` | text | The Google Calendar event ID |
| `contact_id` | uuid FK → contacts.id | Nullable |
| `title` | text | |
| `start_at` | timestamptz | |
| `end_at` | timestamptz | |
| `attendee_name` | text | |
| `attendee_email` | text | Nullable |
| `attendee_phone` | text | Nullable |
| `source` | text | `agent` or `admin` |
| `status` | text | `confirmed`, `cancelled` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Existing entities referenced (no schema changes required)
- **`tenants`** — the business; `id` is the multi-tenancy key throughout.
- **`contacts`** — callers/customers; `id` can be FK'd from `appointments`.
- **`interactions`** — call records from ElevenLabs; an appointment created during a call may optionally FK to the triggering `interaction_id`.
- **`admin_activity_log`** — manual calendar actions by admins should log here.

---

## Out of Scope

- **Two-way calendar sync:** Changes made in Google Calendar directly (edits, deletions) are not synced back to Promptline's `appointments` table in real time. The Calendar tab shows the authoritative Google view for future events, and the `appointments` table is append-oriented.
- **Google Meet / video conferencing:** Creating video call links for appointments is not included.
- **Multi-calendar support per tenant:** Only the business owner's primary calendar (or one designated calendar) is supported. Multiple calendars per tenant are out of scope.
- **Calendar for the admin team itself:** This is strictly for the business customers' calendars, not an internal Promptline admin calendar.
- **Push notifications / webhooks from Google Calendar:** Real-time push updates via Google Calendar watch channels are out of scope. Polling on page load is sufficient.
- **SMS or email reminders for appointments:** The existing `appointment_reminders_enabled` flag in `tenant_messaging_preferences` hints at this feature existing elsewhere; its implementation is out of scope here.
- **Apple Calendar, Outlook/Exchange, or other providers:** Only Google Calendar in this phase.
- **Billing implications of calendar usage:** No plan-tier gating of the calendar feature is specified here.

---

## Open Questions & Assumptions

### OQ-1 (Critical): Which Google OAuth scope to request, and the verification path

This is the core blocker the user reported. Here is the breakdown:

**`https://www.googleapis.com/auth/calendar`** (alias: `calendar.readwrite`) grants full read/write access to all calendars and settings. Google classifies this as a **Restricted scope**. To use it in production with external users (i.e., business owners who are not part of your Google Workspace organization), your OAuth consent screen must undergo a formal **Google OAuth verification and security assessment**, which includes:
- Submitting a privacy policy URL and homepage URL.
- A manual review by Google (typically 4–6 weeks).
- For restricted scopes specifically: a **security audit by a Google-approved third party** (CASA/Tier 2 assessment, cost roughly $15,000–$75,000 USD), unless an exemption applies.

**`https://www.googleapis.com/auth/calendar.events`** grants create/edit/delete access to events only — not calendar settings, not other users' data, not calendar list. Google classifies this as a **Sensitive scope**. Sensitive scopes still require verification (privacy policy, app homepage, justified use case), but they do **not** require the CASA security audit. The manual review is simpler and typically takes 3–5 business days once submitted. This scope is sufficient to:
- Create events (`events.insert`).
- Read events (`events.list`, `events.get`).
- **Note:** The Freebusy API (`freeBusy.query`) is callable with `calendar.readonly` or `calendar.events` — it does NOT require the full `calendar` scope.

**Assumption A-1:** The specification assumes `calendar.events` is the correct scope to request. This satisfies both use cases (free/busy via `freeBusy.query` + event creation via `events.insert`) while staying in the Sensitive tier and avoiding the security audit cost. The architect should confirm with Google's scope documentation that `freeBusy.query` is accessible with `calendar.events` before finalizing.

**Assumption A-2:** If the product needs to read the business owner's calendar list or access calendars they did not create (e.g., a shared team calendar), `calendar.readonly` would need to be added, which is also Sensitive. The full `calendar` restricted scope should only be chosen if a concrete feature requires it.

### OQ-2: OAuth consent screen setup prerequisites

Before the consent flow can be shown to any external users (business owners with personal or non-Workspace Google accounts), the following must be completed in Google Cloud Console:

1. A Google Cloud Project must exist with the Google Calendar API enabled.
2. The OAuth consent screen must be configured with: app name, support email, authorized domains (e.g., `promptline.app`), Privacy Policy URL, Terms of Service URL, and the `calendar.events` scope added to the declared scopes list.
3. While in **Testing** mode, only up to 100 test users (whitelisted email addresses) can complete the flow. Production rollout requires publishing and verification.
4. If the app remains "internal" (Google Workspace org only, all users must be in the same Workspace), no verification is required at all. This is only viable if all Promptline business customers are on the same Google Workspace domain — which is almost certainly not the case for an SMB SaaS.

**Assumption A-3:** Promptline's business customers use personal Gmail accounts or their own Google Workspace domains, so the consent screen must be external and must go through verification. Development/testing can start immediately in Testing mode with up to 100 whitelisted accounts.

### OQ-3: Service account / domain-wide delegation alternative

If getting the consent screen approved for external users proves too slow or costly, an alternative approach is possible:

**Google Workspace Domain-Wide Delegation with a Service Account:** A single Google Cloud service account is granted domain-wide delegation authority by a Google Workspace administrator. The service account can then impersonate any user within that Workspace domain without per-user OAuth consent.

Limitation: this only works for businesses whose entire team is on a single Google Workspace domain AND whose Workspace admin is willing to grant the delegation. It does not work for Gmail users or businesses on a different Workspace domain. For an SMB-focused SaaS, this would cover only a fraction of customers.

**Assumption A-4:** Service account domain-wide delegation is noted as an option for large enterprise customers on Google Workspace but is not the primary implementation path. The per-user OAuth flow with `calendar.events` scope is the primary path.

### OQ-4: Where does the business owner authenticate?

The OAuth connect flow must be initiated by the business owner in the customer-facing app (`promptline-secure`), not in this admin dashboard. The admin dashboard only reads the resulting connection status and data. This spec covers the admin-side UI; the customer-side connect flow is a dependency that must be built in `promptline-secure` in parallel.

**Assumption A-5:** A new serverless function `api/google/callback.js` in the relevant app handles the OAuth code exchange and token storage. The admin app simply reads from `tenant_google_calendar` via Supabase.

### OQ-5: Which `calendarId` to use

After OAuth, the system needs to know which calendar to write to. The most common default is `primary` (the user's primary calendar). Assumption A-6 is that `primary` is used unless the business owner explicitly selects a different calendar. Calendar selection UI is out of scope for this phase.

### OQ-6: Timezone handling

Business hours and appointment slots must respect the business's local timezone. The `tenant_operational_profiles` table stores `business_hours` as a JSON blob but the timezone is not apparent from the data model. Assumption A-7 is that the timezone is either stored in the `tenant_operational_profiles` table (or a new `timezone` column must be added) and that all datetime parameters passed to the Google Calendar API use explicit timezone offsets, not bare UTC.

---

## Architecture Analysis: Alternatives to Per-Domain OAuth Verification

### Why this analysis exists

The standard approach (one Google Cloud Project, OAuth consent screen requesting `calendar.events`, business owners authenticate via OAuth) ran into Google's brand verification wall. The two specific failure modes reported:

- `calendar` (restricted scope): blocked entirely — requires a third-party CASA security audit costing $15k–$75k.
- `calendar.events` (sensitive scope): brand verification failing — Google's consent screen review is rejecting the submission.

Before choosing an alternative architecture, it is important to isolate which failure is happening. The CASA audit wall is a hard cost blocker. Brand verification failure for a sensitive scope is almost always a fixable configuration problem. These require different responses.

---

### Option 1: Fix the actual brand verification issue first

**This is the correct first step, not a workaround.** Sensitive scope brand verification fails for specific, diagnosable reasons. The checklist:

**1a. Domain ownership in Google Search Console**
The "Authorized domain" entered in the OAuth consent screen (e.g., `promptline.app`) must be verified in Google Search Console under the same Google account that owns the Cloud Project. This is the single most common cause of brand verification failure. Go to search.google.com/search-console, add `promptline.app` as a property, and complete DNS TXT record verification. Then return to the Cloud Console OAuth consent screen, re-enter the domain, and re-submit.

**1b. The privacy policy URL must be live, publicly accessible, and on the verified domain**
The URL must return HTTP 200 (not a redirect chain that ends at 200 — the final destination URL itself must be on the verified domain). If the privacy policy is hosted at `https://promptline.app/privacy`, that page must be live and the domain `promptline.app` must be verified. If it is on a subdomain like `secure.promptline.app`, that subdomain must also be authorized.

**1c. The app homepage URL must also be on the verified domain**
Google requires that the app's homepage URL, privacy policy URL, and terms of service URL all share the same authorized domain. A common mistake is using a Vercel preview URL (`promptline-admin.vercel.app`) for the homepage while the privacy policy is on `promptline.app`. All three must resolve to URLs on `promptline.app`.

**1d. The OAuth client type must be "Web application", not "Desktop" or "TVs and limited input devices"**
Web application type is required for the consent screen to appear for external users.

**1e. The app name on the consent screen must not infringe on a trademark or contain "Google"**
App names containing "Google", "YouTube", or similar are rejected automatically.

**1f. The support email must be a Google account, not a custom domain alias**
Google requires the support email to be a verified Google account. Using a custom domain email (e.g., `support@promptline.app`) that is not verified as a Google account will cause silent rejection. Use a `@gmail.com` address or a Google Workspace account that is verified.

**1g. Re-submit after fixing, and use the "Edit App" path, not creating a new project**
Creating a new Cloud Project for each failed attempt does not reset the review — it creates new projects that will also fail for the same reasons. Fix the existing project's consent screen configuration and re-submit for verification.

**Verdict for Promptline:** Before investing engineering time in any alternative architecture, spend 2–4 hours completing steps 1a through 1g. The domain verification in Search Console alone resolves the majority of these rejections. If the submission is rejected again, Google provides a specific rejection reason in the Cloud Console — that reason should drive the next action, not a wholesale architecture change.

**If this is fixed:** The original architecture in this spec (per-tenant OAuth with `calendar.events`) is the best architecture. Continue with FR-1 through FR-19 as written.

---

### Option 2: Google Workspace Marketplace App

**What it is:** Publish Promptline as an app on the Google Workspace Marketplace. Businesses that use Google Workspace install the app through the Marketplace admin console. Installation grants the scopes the Marketplace listing declares, without each end user going through an individual OAuth consent screen for those scopes.

**Does it bypass per-domain verification?**
Partially, and in a specific way. A Workspace Marketplace app goes through its own Google review process (which is separate from the OAuth consent screen verification). Once approved for the Marketplace, the OAuth scopes the app declares are pre-authorized for installation — the admin who installs the app grants the scopes for their entire Workspace domain. Individual end users do not see the OAuth consent screen for those pre-authorized scopes.

However: the Marketplace app review is not easier than the OAuth consent screen verification. It has its own requirements including a detailed data use disclosure, a privacy policy, a support URL, branding that meets Marketplace guidelines, and for apps requesting certain sensitive scopes, a security assessment. The review timeline is comparable (weeks, not days).

**Prerequisites and costs:**
- Google Workspace Marketplace SDK must be enabled in the Cloud Project.
- The app must have a published landing page on the Marketplace.
- A one-time $100 registration fee (as of 2025) to become a Workspace developer.
- Must pass Google's Marketplace app review.
- The business installing the app must be on Google Workspace (not a personal Gmail account).

**Multi-tenant impact:**
This works at the Workspace domain level. When a business installs the Promptline Marketplace app, the domain admin grants consent on behalf of all users in that Workspace. From Promptline's backend, you would use service account impersonation (via domain-wide delegation that the Marketplace installation grants) to access any user's calendar within that Workspace, without that user needing to authenticate individually.

**Limitations:**
- Only covers Google Workspace customers, not Gmail users. If Promptline's SMB customer base includes businesses using free Gmail accounts for their business email (common for very small businesses), those businesses cannot use a Marketplace app.
- The Marketplace review process is not faster or simpler than the OAuth consent screen review.
- Installing a Marketplace app requires the business's Google Workspace admin, not just any user, to approve it. This adds friction to the onboarding flow (the admin may not be the same person as the Promptline customer).

**Voice agent interaction:**
Once a Workspace admin installs the app, Promptline's service account can impersonate the business owner's Google account using domain-wide delegation — specifically the delegation granted by the Marketplace installation. The voice agent tool endpoint calls the Calendar API using the service account with impersonation. This is cleaner than per-user OAuth token management (no refresh tokens to store per tenant) but is limited to Workspace customers.

**Verdict:** This is the right approach IF Promptline's target market is businesses on Google Workspace (not free Gmail). It is not a shortcut around verification — it substitutes one review process for another. It does, however, change the architecture meaningfully: instead of storing a refresh token per tenant, Promptline uses a single service account with domain-wide delegation per installed Workspace domain. This simplifies token management at the cost of limiting the addressable market to Workspace customers.

---

### Option 3: Service Account with Domain-Wide Delegation (standalone, no Marketplace)

**What it is:** A Google Cloud service account is created in Promptline's project. A Google Workspace domain administrator manually grants that service account domain-wide delegation in their Workspace Admin Console (Admin Console > Security > API Controls > Domain-wide Delegation). Once granted, the service account can call the Calendar API impersonating any user in that domain, with no per-user OAuth consent screen.

**Does it bypass verification?**
Yes. There is no OAuth consent screen for domain-wide delegation. The Workspace domain admin grants it directly in their own Admin Console, using the service account's client ID and the specific OAuth scopes to delegate. This is entirely under the control of the business's own Workspace admin.

**Prerequisites and costs:**
- Zero direct cost from Google.
- The business must be on Google Workspace (not Gmail).
- The business's Workspace admin must be willing to manually grant domain-wide delegation in their Admin Console. This is a moderately technical operation and requires understanding what is being granted — many Workspace admins will be cautious about this.
- Promptline must provide clear instructions to each business's Workspace admin on exactly which client ID to authorize and which scopes to grant. This is a support burden.

**Multi-tenant impact:**
Each tenant that is a Google Workspace customer would need their admin to complete the delegation setup. Promptline stores the impersonation email (the email of the calendar owner to impersonate) per tenant in `tenant_google_calendar`, rather than OAuth tokens. The service account credentials (a single JSON key file) are stored as a server-side secret shared across all tenants that use this path — but impersonation is scoped to the specific email per API call, so tenant isolation is maintained at the API call level.

**Limitations:**
- Only works for Google Workspace customers. Gmail users are excluded.
- The Workspace admin setup step is friction — it is not self-service for the business owner.
- Domain-wide delegation is a high-privilege grant. Security-conscious Workspace admins may refuse it or escalate it for review.
- If Promptline's service account key is ever compromised, an attacker could impersonate users in any Workspace domain that granted delegation. This is a significant security surface.

**Voice agent interaction:**
The voice agent tool endpoint uses the service account (with impersonation for the specific tenant's email) to call the Calendar API directly. No stored per-tenant tokens; no refresh logic. This is the simplest runtime path from an operational standpoint once setup is complete.

**Verdict:** Appropriate as an enterprise/power-user option for Google Workspace customers who are willing to do the admin setup. Not viable as the primary path for an SMB SaaS where many customers use free Gmail or small business accounts. Should be offered as an alternative connection method alongside the standard OAuth path, not as a replacement for it.

---

### Option 4: Service Account Owning a Shared "Promptline" Calendar (no delegation)

**What it is:** Promptline's service account creates a new Google Calendar (owned by the service account, not the business owner). The service account shares this calendar with the business owner's email address, granting them editor or reader access. The voice agent and admin dashboard read/write this Promptline-owned calendar directly via the service account. No OAuth flow is needed at all.

**Does it bypass verification?**
Yes. The service account never presents an OAuth consent screen to anyone. Promptline creates and manages calendars using its own service account credentials. The business owner can view the shared calendar in their Google Calendar app, but Promptline never accesses the business owner's existing calendars.

**Prerequisites and costs:**
- A single Google Cloud service account. Zero per-user OAuth costs.
- The business owner must accept the calendar sharing invitation from the service account (Google sends an email). This is a one-click action but is an extra step.
- No verification requirement from Google.

**Multi-tenant impact:**
One calendar per tenant, owned by Promptline's service account. The `tenant_google_calendar` table stores the `calendar_id` of the created calendar rather than OAuth tokens. No refresh token management. The service account key is a single server-side secret.

**Limitations:**
- The Promptline calendar is separate from the business owner's existing Google Calendar. The voice agent can only see events that were entered into the Promptline-managed calendar — it cannot see existing appointments the business owner has on their personal/primary calendar. This means the free/busy data is only accurate for appointments booked through Promptline, not the business owner's full schedule. This is a significant functional limitation for any business that has appointments from other sources.
- The business owner must explicitly check or open the Promptline calendar to see bookings made by the voice agent, rather than seeing them appear automatically in their existing workflow.
- If the business already has a busy schedule in their primary calendar and a caller asks "are you free Tuesday at 2pm?", the agent will incorrectly say "yes" because it only sees the Promptline calendar.

**Voice agent interaction:**
Clean and simple. The tool endpoint calls the service account's calendar directly. No token management complexity. But the availability check is unreliable unless the business owner uses only the Promptline calendar for their schedule — which is not realistic for most SMBs.

**Verdict:** Only viable for businesses that agree to exclusively use the Promptline-managed calendar as their scheduling system, or as a fallback for businesses that cannot or will not complete a standard OAuth flow. The free/busy accuracy problem makes this unsuitable as the primary architecture for a voice agent that is supposed to give callers accurate availability information. The entire value proposition of the voice agent — accurately representing the business's real availability — is broken if the agent only sees a subset of the business owner's schedule.

---

### Option 5: Nylas, Cronofy, or Cal.com as Middleware

**What these are:** Third-party calendar aggregation platforms that handle OAuth authentication and verification themselves, then expose a unified REST API that your application calls. Your application stores a Nylas/Cronofy/Cal.com access token per user (simpler than a Google refresh token) and calls their API for calendar operations.

**Nylas (nylas.com):**
- Nylas handles the OAuth flows for Google, Microsoft, Exchange, and others. They are a verified Google OAuth app — their app has already cleared Google's verification. When a business owner connects their calendar through Promptline (via Nylas), the consent screen shows "Nylas" as the app name, not "Promptline."
- Unified API for events, free/busy, contacts, email.
- Pricing: free tier limited, then $0.01–$0.10 per API call or flat monthly rates starting around $150/month for production workloads. At scale with many tenants, this adds up significantly.
- The consent screen issue is solved by delegation: Nylas is the verified OAuth app, not Promptline.

**Cronofy (cronofy.com):**
- Similar model to Nylas. Focused specifically on calendar scheduling use cases (free/busy, availability, booking). Purpose-built for the exact use case Promptline needs.
- Has a "real-time scheduling" API mode designed for the scenario where a system needs to check availability and book in near-real-time (relevant for voice agent use case).
- Pricing: subscription-based, starting around $99/month for small deployments, scaling with connected accounts.
- Also handles Google, Microsoft, Apple, Exchange.

**Cal.com (cal.com/enterprise):**
- Cal.com is primarily an open-source scheduling product but also has an API and an "Atoms" embeddable component. Less relevant as a backend API aggregator — it is more of a scheduling UX product.
- Self-hosting the open-source version is an option, but then you own the OAuth verification problem yourself.

**Does it bypass verification?**
Yes. Nylas and Cronofy are themselves verified OAuth apps with Google. The OAuth consent screen the business owner sees says "Nylas" or "Cronofy" — not "Promptline". From Google's perspective, it is their app accessing the calendar. Promptline never needs to go through Google's consent screen verification.

**Multi-tenant impact:**
Each business owner completes an OAuth flow hosted by the middleware provider. The middleware returns a per-user token (a Nylas `grant_id` or Cronofy `access_token`) that Promptline stores per tenant in `tenant_google_calendar` (or a new column). All Calendar API calls go to the Nylas/Cronofy API using this token, not directly to Google. Token refresh is handled by the middleware automatically. Promptline's backend calls `https://api.nylas.com/v3/grants/{grant_id}/events` instead of the Google Calendar API directly.

**Limitations:**
- Cost. Nylas and Cronofy add per-month or per-call costs on top of Promptline's existing infrastructure costs. At 100 tenants with daily availability checks during calls, this is manageable. At 10,000 tenants, costs must be modeled carefully.
- Latency. An extra network hop to the middleware for every voice agent availability check. Cronofy claims sub-200ms P95 latency from their API. Nylas is similar. For a voice call where the agent is waiting for a "yes/no available" answer, an extra 100–200ms is perceptible but usually acceptable.
- Dependency. Promptline's calendar feature is now dependent on a third party's uptime, API stability, and pricing model. If Nylas changes pricing or deprecates an API version, Promptline must adapt.
- The consent screen shows the middleware's branding, not Promptline's. For some businesses, seeing "Nylas" on the consent screen when they expected "Promptline" raises trust questions. This is a real but minor UX friction point.
- Microsoft support comes along for free. Nylas and Cronofy support Outlook/Exchange/Microsoft 365 out of the box (see Option 6), which is a significant future-proofing benefit.

**Voice agent interaction:**
Clean. The tool endpoint calls the Nylas or Cronofy API for free/busy, receives a normalized response, and responds to the agent. The middleware handles Google rate limits and token refresh internally. This is operationally simpler than managing Google tokens directly.

**Verdict:** Nylas or Cronofy is the pragmatic path if the consent screen verification problem cannot be resolved quickly. Cronofy is the more purpose-built option for the availability-and-booking use case. The cost is real but predictable. The primary tradeoff is adding a paid dependency and a slight trust friction on the consent screen. If the business needs to ship the calendar feature in weeks rather than months (while waiting for Google's verification), Cronofy or Nylas gets the feature live immediately and also handles Microsoft calendar support as a bonus.

**Recommended middleware choice (if this path is taken):** Cronofy over Nylas for this use case. Cronofy's API is more focused on the scheduling/availability problem (it has a dedicated Availability API with conflict checking) and is more cost-predictable for a booking-oriented workload. Nylas is better if Promptline needs email access alongside calendar.

---

### Option 6: Microsoft Graph / Outlook Calendar

**What this is:** Microsoft's equivalent of the Google Calendar API, accessed via Azure Active Directory (Entra ID) OAuth and the Microsoft Graph API. Supports personal Microsoft accounts (Outlook.com) and Microsoft 365 / Exchange organizations.

**Does it solve the Google verification problem?**
No — this is a different service. It is additive, not substitutive. Businesses on Microsoft 365 or Outlook do not use Google Calendar, so they need this instead of or in addition to the Google integration.

**Prerequisites and costs:**
- Register an app in Azure Portal (portal.azure.com) > App Registrations.
- Request the `Calendars.ReadWrite` permission (delegated, not application).
- Microsoft's consent screen review for external/personal account access is less burdensome than Google's. For delegated permissions (user-authorized), Microsoft allows external access with just an admin review in the Azure Portal — no separate verification submission process comparable to Google's consent screen review.
- Free to use; no API cost from Microsoft beyond normal Azure account overhead.
- The `tenant_google_calendar` table would be generalized to `tenant_calendar_connections` with a `provider` column (`google`, `microsoft`) and provider-specific token columns.

**Multi-tenant impact:**
The same OAuth flow pattern (FR-1 through FR-7) applies, generalized for Microsoft. The voice agent tool endpoints would be provider-agnostic: they look up the tenant's calendar connection, detect the provider, and route to either the Google or Microsoft client. This is a meaningful architectural generalization but is well-defined.

**Voice agent interaction:**
No change to the tool endpoint interface. The internal implementation switches on the provider. The Microsoft Graph Calendar API has equivalent endpoints: `GET /me/calendarView` for free/busy and `POST /me/events` for event creation.

**Verdict:** Not a solution to the current Google verification problem, but a high-value parallel workstream given that a significant share of SMBs (especially those that switched from G Suite to Microsoft 365 or that use Exchange from an IT service provider) do not have Google Calendar at all. Pursue this in parallel with the Google fix, not instead of it. Do not let the Google verification problem delay building the Microsoft path — Microsoft's authorization is simpler to obtain. Given the Nylas/Cronofy option above also handles Microsoft calendars out of the box, the middleware approach becomes even more attractive if multi-provider support is on the roadmap.

---

### Option 7: Native Promptline Appointment System (no external calendar integration)

**What this is:** Build a native scheduling and appointment system within Promptline. The business owner configures their availability (days, hours, buffer times) directly in the Promptline admin UI. The voice agent books slots against Promptline's own availability model. Syncing to external calendars (Google, Outlook) happens via outbound iCal export or a push mechanism, not inbound OAuth.

**Does it bypass verification?**
Yes. If Promptline never accesses the business owner's Google Calendar via OAuth, there is nothing to verify.

**Prerequisites and costs:**
- Significant product engineering effort: availability templates, slot-blocking logic, conflict detection, a business-owner-facing scheduling UI.
- iCal (`.ics`) export: Promptline publishes a per-tenant feed URL that the business owner subscribes to in their Google Calendar. Events show up as a read-only overlay. No OAuth needed. iCal subscription refresh intervals in Google Calendar are slow (typically 24 hours), so new bookings would not appear in the business owner's Google Calendar immediately.
- Two-way sync is not possible via iCal — it is a one-direction read.

**Multi-tenant impact:**
The architecture is entirely within Promptline's control. No external OAuth tokens. The `appointments` table becomes the authoritative scheduling source. The complexity shifts from OAuth token management to building a correct availability engine (handling timezones, buffer times, day-of-week rules, exceptions for holidays, etc.).

**Limitations:**
- The voice agent's free/busy check is only as good as the availability model configured in Promptline. If the business owner has external appointments (a dentist visit, a personal obligation) that they have not blocked in Promptline, the agent will offer those slots as available. The accuracy problem described in Option 4 applies here as well.
- The business owner must maintain two calendars: their real one (Google/Outlook) and the Promptline availability configuration. This is real operational overhead for an SMB.
- Significantly more engineering effort to build correctly than the OAuth integration path.

**Voice agent interaction:**
The tool endpoint queries Promptline's own availability model instead of calling an external API. This could be faster and more reliable (no external dependency). The tradeoff is accuracy.

**Verdict:** The native appointment system is the right long-term architecture for the scheduling layer — Promptline should own the source of truth for which slots it has offered and which are booked. The `appointments` table already reflects this direction. However, the availability check (FR-14) fundamentally requires access to the business owner's full schedule, not just Promptline-booked appointments, to be accurate. Building a native system only and skipping external calendar sync would mean the voice agent cannot see the business owner's existing commitments. This is likely unacceptable for the product's core value proposition. The right split is: use Promptline's `appointments` table as the source of truth for Promptline-created events (already in this spec), and use the external calendar (Google/Outlook via OAuth or middleware) for the free/busy signal that ensures Promptline does not double-book against existing commitments.

---

### Option 8 (Cross-cutting): CalDAV / iCal approach

**What this is:** CalDAV is an HTTP-based protocol for reading and writing calendar data, standardized on top of WebDAV. Google Calendar exposes a CalDAV endpoint. Apple Calendar and some other providers also support CalDAV. iCal (.ics) is a file format for calendar data; iCal subscription URLs are read-only feeds that calendar applications poll on a schedule.

**Does it bypass Google OAuth?**
No. Google's CalDAV endpoint for Google Calendar requires OAuth authentication with the same scopes as the REST API. Using CalDAV instead of the REST API does not bypass the OAuth consent screen verification. The scopes and verification requirements are identical.

**iCal subscription for reading:**
Google Calendar provides a "secret address in iCal format" per calendar — a URL that anyone with the URL can read, requiring no authentication. The business owner can share this URL with Promptline. Promptline polls the URL to read upcoming events for free/busy analysis. No OAuth required.

Limitations of this approach:
- The iCal URL is effectively a secret. If it is exposed, anyone can read the business owner's calendar. The business owner must manually find and copy this URL from Google Calendar settings, which is non-trivial UX.
- Google refreshes the feed for external subscribers every few hours — the feed Promptline receives may be hours stale. For a voice agent that needs to know the current state of the calendar in real-time, polling a stale iCal feed is not reliable.
- Writing events back to the calendar is not possible via iCal subscription URLs. The voice agent could not book appointments.

**CalDAV for reading and writing:**
CalDAV allows full read/write, but requires OAuth authentication with the same verification requirements as the REST API. No advantage over the REST API for the verification problem.

**Verdict:** iCal subscription URLs are a useful emergency fallback for very technically limited situations (e.g., a business owner on a non-Google calendar that exposes iCal but not OAuth) but are not a viable primary architecture due to read-only access and staleness. CalDAV is not an alternative to OAuth — it requires the same OAuth credentials. This option is out of scope for the primary implementation.

---

## Recommended Path Forward

### Decision tree

**Step 1: Fix the brand verification issue (1–3 business days of effort)**
Before changing any architecture, spend time on the exact checklist in Option 1. The most likely causes are: domain not verified in Google Search Console, or privacy policy / homepage URL not on the verified domain, or support email not being a proper Google account. These are configuration problems, not architecture problems.

If verification passes: implement the standard OAuth path described in FR-1 through FR-19. This is the best architecture — full business-owner calendar integration, per-tenant credential isolation, no third-party cost dependency.

**Step 2: If verification is blocked for more than 2–3 weeks, adopt Cronofy as middleware**
Cronofy is the recommended middleware because it is purpose-built for availability checking and booking, it handles Google OAuth verification on Promptline's behalf, it comes with Microsoft 365 / Outlook support built in, and it abstracts token refresh. The integration surface is simpler: store a Cronofy access token per tenant instead of a Google refresh token. The voice agent tool endpoints call Cronofy's Availability API instead of Google's Freebusy API.

Cost estimate for Cronofy at 200 active business customers: approximately $200–$400/month depending on tier. At 1,000 customers, revisit the per-unit economics and re-evaluate direct Google OAuth if verification was eventually obtained.

**Step 3: Add Microsoft 365 support in parallel**
Regardless of the Google path chosen, build Microsoft OAuth support into the `tenant_calendar_connections` table (generalizing `tenant_google_calendar`) now, so the architecture is not Google-specific. Microsoft's verification requirements are lighter and can be completed quickly. This immediately serves the subset of business customers who use Outlook rather than Google Calendar.

**Step 4: Build the native Promptline scheduling layer as the source of truth**
The `appointments` table (FR-18, FR-19) is already the right direction. Extend it to become the availability template engine: business owners configure their working hours and default availability in Promptline, the voice agent checks both the Promptline availability model and the external calendar (Google/Outlook/Cronofy) before offering a slot. This ensures accuracy even when the external calendar is temporarily disconnected (graceful degradation to Promptline's own model).

### Architecture summary table

| Option | Solves verification? | SMB-compatible? | Cost impact | Engineering effort | Recommended? |
|---|---|---|---|---|---|
| Fix brand verification (Opt 1) | Yes, permanently | Yes | None | Low (config) | YES — do this first |
| Google Workspace Marketplace (Opt 2) | Partially | Workspace only | $100 one-time | Medium | Supplement for enterprise |
| Service account + delegation (Opt 3) | Yes | Workspace only | None | Low | Supplement for enterprise |
| Service account shared calendar (Opt 4) | Yes | Yes | None | Low | No — accuracy too limited |
| Cronofy middleware (Opt 5) | Yes | Yes | $200–$400/mo | Low | YES — if Opt 1 fails |
| Microsoft Graph (Opt 6) | Not applicable | Yes (Outlook users) | None | Medium | YES — build in parallel |
| Native scheduling only (Opt 7) | Yes | Yes | None | High | Partial — as the booking layer, not the availability signal |
| CalDAV / iCal (Opt 8) | No / read-only | Limited | None | Low | No |

---

## 3-Bullet Summary of Most Important Decisions/Assumptions

- **Fix the consent screen configuration before changing the architecture.** Brand verification failure for a sensitive scope (`calendar.events`) is almost always a configuration problem — specifically, the authorized domain not being verified in Google Search Console, or the privacy policy URL not resolving on that same domain. This is a 2–4 hour fix, not an architecture change. Only if this path is blocked for more than 2–3 weeks should an alternative be adopted.

- **Cronofy is the recommended fallback if Google's verification cannot be obtained quickly.** It solves the consent screen problem by delegation (Cronofy is the verified app), adds Microsoft 365 support as a free bonus, abstracts token refresh, and integrates at a predictable cost. Of all the non-fix options, it is the only one that (a) works for all SMB customers regardless of whether they use Google or Microsoft, (b) requires no architectural compromise on the accuracy of availability data, and (c) fits within the existing Vercel + Supabase stack without new infrastructure.

- **Service account domain-wide delegation (and the Marketplace approach) are enterprise supplements, not SMB solutions.** Both require the business to be on Google Workspace and require a Workspace admin to take action — prerequisites that likely exclude the majority of Promptline's SMB customer base. They should be offered as alternative connection methods for enterprise customers, documented clearly, but should not displace the standard OAuth or Cronofy path as the primary offering.
