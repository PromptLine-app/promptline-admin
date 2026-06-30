import { supabase } from '@/config/supabase';

/**
 * Admin "bypass payment" controls.
 *
 * Activates (or revokes) a tenant without a card on file, for when card
 * vaulting fails on the customer's side (e.g. a PayPal 3-D Secure contingency
 * the issuer won't clear). The privileged write happens in the
 * admin-billing-override edge function, which verifies the caller is an active
 * admin and reuses the promo "active, no card, never auto-charged" billing
 * state. These helpers wrap functions.invoke() and write the audit-log row.
 *
 * Both throw on any failure so callers can surface a toast.
 */

export type BypassArgs = {
  tenantId: string;
  reason: string;
  /** Optional admin user id — when provided the action is written to the audit log. */
  adminUserId?: string | null;
};

export const applyPaymentBypass = async ({
  tenantId,
  reason,
  adminUserId,
}: BypassArgs): Promise<void> => {
  const trimmed = (reason || '').trim();
  if (!trimmed) {
    throw new Error('A reason is required to bypass payment.');
  }

  const { data, error } = await supabase.functions.invoke('admin-billing-override', {
    body: { tenantId, action: 'grant', reason: trimmed },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  if (adminUserId) {
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUserId,
      action: 'bypass_payment',
      target_tenant_id: tenantId,
      details: { reason: trimmed },
    });
  }
};

export const revokePaymentBypass = async ({
  tenantId,
  adminUserId,
}: {
  tenantId: string;
  adminUserId?: string | null;
}): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('admin-billing-override', {
    body: { tenantId, action: 'revoke' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  if (adminUserId) {
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUserId,
      action: 'revoke_payment_bypass',
      target_tenant_id: tenantId,
      details: {},
    });
  }
};
