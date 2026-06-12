/**
 * Zoho federated login for the admin dashboard.
 *
 * Identity-only: we just need the user's verified Zoho email to map them to an
 * `admin_users` row. The client_id is public (safe in the bundle); the client
 * secret never touches the browser — the code-for-session exchange happens in
 * the /api/zoho/session serverless function.
 */

/** Minimal scope — just enough to read the Zoho profile (email + name). */
const ZOHO_LOGIN_SCOPE = "AaaServer.profile.READ";

/** True when a Zoho client id is configured for the browser bundle. */
export const isZohoConfigured = () => Boolean(import.meta.env.VITE_ZOHO_CLIENT_ID);

/** The redirect URI Zoho returns to — must be registered in the Zoho API console. */
export const zohoRedirectUri = () => `${window.location.origin}/auth/callback`;

/** Kick off Zoho OAuth by redirecting to the Zoho consent screen. */
export const beginZohoLogin = () => {
  const clientId = import.meta.env.VITE_ZOHO_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error("Zoho is not configured for this environment.");
  }
  const url =
    `https://accounts.zoho.com/oauth/v2/auth?response_type=code` +
    `&client_id=${clientId}` +
    `&scope=${ZOHO_LOGIN_SCOPE}` +
    `&redirect_uri=${encodeURIComponent(zohoRedirectUri())}` +
    `&access_type=offline&prompt=consent`;
  window.location.href = url;
};
