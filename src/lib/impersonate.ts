import { adminApi } from '@/lib/adminApi';

/**
 * "Open customer view" — asks the server to mint a one-time magic-link for a
 * tenant's owner and return it (plus the resolved owner email). The GoTrue
 * generateLink call needs the service-role key, so it runs in
 * /api/admin/impersonate, not the browser. The server resolves the owner email
 * (owner_user_id -> users.email, falling back to any tenant member) and the
 * redirect target (must be allow-listed in the czqth Supabase auth settings).
 *
 * The caller opens action_link in a new tab to land in the customer app
 * (promptline-secure) signed in as that owner.
 */
export async function openCustomerView(
  tenantId: string,
): Promise<{ action_link: string; email: string }> {
  return adminApi('/api/admin/impersonate', 'POST', { tenantId });
}
