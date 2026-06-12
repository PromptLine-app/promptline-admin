import { supabase } from '@/config/supabase';

/**
 * "Open customer view" — mints a Supabase magic-link for a tenant's owner and
 * returns the action link, which the caller opens in a new tab. This logs the
 * admin's new tab in AS the customer, so it's an admin-only, audited action.
 *
 * The customer-facing app is the promptline-secure deployment. Override the URL
 * with VITE_CUSTOMER_APP_URL; the redirect target must be allow-listed in the
 * czqth Supabase auth settings for the magic link to land.
 */
export const CUSTOMER_APP_URL =
  (import.meta.env.VITE_CUSTOMER_APP_URL as string) || 'https://promptline.app';

/** Resolve the login email of a tenant's owner (users.id == auth uid). */
export async function getTenantOwnerEmail(tenantId: string): Promise<string | null> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('owner_user_id')
    .eq('id', tenantId)
    .single();

  let userId = (tenant?.owner_user_id as string | null | undefined) ?? null;

  // Fall back to any member with a role on the tenant if no explicit owner.
  if (!userId) {
    const { data: role } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();
    userId = (role?.user_id as string | undefined) ?? null;
  }
  if (!userId) return null;

  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  return (user?.email as string) || null;
}

/** Generate a one-time magic-link that authenticates as `email` and lands on the customer app. */
export async function createImpersonationLink(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: CUSTOMER_APP_URL },
  });
  if (error) throw error;
  const link = (data?.properties as { action_link?: string } | undefined)?.action_link;
  if (!link) throw new Error('No action link returned by Supabase');
  return link;
}
