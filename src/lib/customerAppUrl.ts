const DEFAULT_CUSTOMER_APP_URL = 'https://secure.promptline.app';

/**
 * Base URL of the customer dashboard (promptline-secure). Used for impersonation
 * magic-link redirects and billing-portal links in customer emails.
 *
 * Resolution order:
 * 1. VITE_CUSTOMER_APP_URL (explicit per-environment override)
 * 2. Derive from the admin host: admin.sandbox.promptline.app → secure.sandbox.promptline.app
 * 3. Production default (secure.promptline.app)
 */
export function getCustomerAppUrl(
  hostname = typeof window !== 'undefined' ? window.location.hostname : undefined,
): string {
  const explicit = import.meta.env.VITE_CUSTOMER_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  if (hostname?.startsWith('admin.')) {
    return `https://${hostname.replace(/^admin\./, 'secure.')}`;
  }

  return DEFAULT_CUSTOMER_APP_URL;
}
