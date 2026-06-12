// Vercel Serverless Function: Mint a Supabase session from a verified Zoho identity.
//
// "Sign in with Zoho" is federated login for the admin dashboard. We verify the
// Zoho identity entirely server-side (the email is never asserted by the browser),
// then use the Supabase admin API to issue a one-time token_hash. The browser
// redeems it with verifyOtp to get a session immediately — no emailed magic link.
//
// This only proves WHO the user is. Whether they may use the dashboard is enforced
// separately: AuthProvider looks the authenticated user up in `admin_users`, and
// AdminGuard denies access if there's no active row. So a Zoho user who is not an
// admin signs in but lands on "Access Denied" — the allow-list still governs.
//
// This function owns the Zoho-specific half — exchange the code and resolve the
// verified profile. Minting the Supabase session from that verified email is the
// provider-agnostic part, shared in ../_lib/supabaseSession.js.
//
// Required server env (Vercel project):
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET
//   SUPABASE_SERVICE_ROLE_KEY  — secret; never prefix with VITE_ (would leak to the bundle)
// The Supabase URL is reused from VITE_SUPABASE_URL (see _lib/supabaseSession.js).

import { mintSessionToken } from "../_lib/supabaseSession.js";

const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const ZOHO_USERINFO_URL = "https://accounts.zoho.com/oauth/user/info";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res
      .status(500)
      .json({ error: "Zoho OAuth credentials are not configured on the server" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { code, redirect_uri: redirectUri } = body;

    if (!code || !redirectUri) {
      return res.status(400).json({ error: "Missing code or redirect_uri" });
    }

    // 1) Exchange the authorization code for Zoho tokens (server holds the secret).
    const tokenResponse = await fetch(ZOHO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error || !tokenData.access_token) {
      return res
        .status(400)
        .json({ error: `Zoho token error: ${tokenData.error || "no access token"}` });
    }

    // 2) Resolve the verified identity from Zoho (never trust a client-sent email).
    const userInfoResponse = await fetch(ZOHO_USERINFO_URL, {
      headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    const email = userInfo.Email;
    if (!email) {
      return res
        .status(400)
        .json({ error: "Could not retrieve email from Zoho profile" });
    }
    const fullName = `${userInfo.First_Name || ""} ${userInfo.Last_Name || ""}`.trim();

    // 3) Mint a one-time Supabase token from the verified identity (shared half).
    const tokenHash = await mintSessionToken({
      email,
      fullName,
      metadata: { zoho_connected: true },
    });

    return res.status(200).json({ token_hash: tokenHash, email });
  } catch (error) {
    console.error("Zoho session mint error:", error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Sign-in failed" });
  }
}
