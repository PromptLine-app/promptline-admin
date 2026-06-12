// Shared helper for federated-login serverless functions.
//
// This is the provider-agnostic half of "sign in with <IdP>": given an email that
// has ALREADY been verified against its identity provider, it mints a one-time
// Supabase token_hash. The browser redeems it with
//   supabaseAuth.auth.verifyOtp({ type: "magiclink", token_hash })
// to establish a session immediately — no email is ever sent.
//
// A new provider only needs to write its own exchange-code -> fetch-profile step,
// then call mintSessionToken() with the verified email.
//
// The underscore-prefixed _lib/ folder is ignored by Vercel's routing, so this is
// a plain importable module, not an HTTP endpoint.
//
// Required env: SUPABASE_SERVICE_ROLE_KEY (secret — never VITE_-prefixed), plus a
// Supabase URL from SUPABASE_URL or, by reuse, VITE_SUPABASE_URL. The token_hash
// must be minted on the same project that later validates it client-side.

import { createClient } from "@supabase/supabase-js";

let cachedAdmin = null;

const getAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase admin credentials are not configured on the server");
  }
  // Reused across warm invocations; the service-role client is stateless.
  if (!cachedAdmin) {
    cachedAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedAdmin;
};

/**
 * Ensure a confirmed Supabase user exists for `email` and return a one-time
 * token_hash the browser can redeem via verifyOtp.
 *
 * IMPORTANT: only call this AFTER server-verifying the email with the upstream
 * IdP. The email is the account join key — never pass one the client merely
 * claimed, or anyone could mint a session for any address.
 *
 * @param {object} args
 * @param {string} args.email      Verified email from the identity provider.
 * @param {string} [args.fullName] Display name to seed on first sign-in.
 * @param {object} [args.metadata] Extra user_metadata (e.g. { zoho_connected: true }).
 * @returns {Promise<string>} the hashed_token to hand back to the browser.
 */
export const mintSessionToken = async ({ email, fullName, metadata = {} }) => {
  if (!email) {
    throw new Error("mintSessionToken requires a verified email");
  }
  const admin = getAdminClient();

  // Create the user if new; a returning user already existing is expected.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { ...(fullName ? { full_name: fullName } : {}), ...metadata },
  });
  if (createError && !/already|registered|exists/i.test(createError.message)) {
    throw createError;
  }

  // generateLink does NOT send an email; it returns the token hash directly.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error("Failed to generate a sign-in token");
  }
  return tokenHash;
};
