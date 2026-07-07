// Resolve the promptline-secure base URL for server-side redirects (impersonation
// magic links, etc.). Mirrors src/lib/customerAppUrl.ts so sandbox admin always
// targets secure.sandbox.promptline.app even when env vars are missing.

const DEFAULT_CUSTOMER_APP_URL = "https://secure.promptline.app";

const ALLOWED_HOSTS = new Set([
  "secure.promptline.app",
  "secure.sandbox.promptline.app",
  "localhost",
  "127.0.0.1",
]);

const normalizeUrl = (url) => url.replace(/\/$/, "");

const isAllowedHost = (hostname) =>
  ALLOWED_HOSTS.has(hostname) ||
  /^secure\.[a-z0-9-]+\.promptline\.app$/.test(hostname);

/**
 * @param {string | undefined} url
 * @returns {string | null}
 */
export const validateCustomerAppUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!isAllowedHost(parsed.hostname)) return null;
    return normalizeUrl(parsed.origin);
  } catch {
    return null;
  }
};

/**
 * @param {import("http").IncomingMessage | undefined} req
 * @param {string | undefined} explicitUrl from the client or env
 * @returns {string}
 */
export const resolveCustomerAppUrl = (req, explicitUrl) => {
  const fromClient = validateCustomerAppUrl(explicitUrl);
  if (fromClient) return fromClient;

  const fromEnv = validateCustomerAppUrl(
    process.env.CUSTOMER_APP_URL || process.env.VITE_CUSTOMER_APP_URL,
  );
  if (fromEnv) return fromEnv;

  const host =
    req?.headers?.["x-forwarded-host"]?.split(",")[0]?.trim() ||
    req?.headers?.host ||
    "";
  const hostname = host.split(":")[0];
  if (hostname?.startsWith("admin.")) {
    const protocol = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";
    const derived = `${protocol}://${hostname.replace(/^admin\./, "secure.")}`;
    const validated = validateCustomerAppUrl(derived);
    if (validated) return validated;
  }

  return DEFAULT_CUSTOMER_APP_URL;
};
