import { supabase } from '@/config/supabase';
import { formatUsd } from '@/types/domain';

/**
 * Send a payment-reminder email to a past-due / outstanding customer.
 *
 * Reuses the send-ms-email edge function (Microsoft Graph) that already powers
 * billing receipts and automated dunning — so no new infrastructure. The admin
 * supabase client is created with the service-role key, which is exactly what
 * send-ms-email authorizes against, so functions.invoke() is allowed to call it.
 *
 * Throws on any failure so callers can surface a toast.
 */
const BILLING_PORTAL_URL = 'https://promptline-secure.vercel.app/billing';

export type ReminderArgs = {
  tenantId: string;
  companyName: string | null;
  billingEmail: string | null;
  amountCents: number | null;
  /** Optional admin user id — when provided the action is written to the audit log. */
  adminUserId?: string | null;
};

export const sendPaymentReminder = async ({
  tenantId,
  companyName,
  billingEmail,
  amountCents,
  adminUserId,
}: ReminderArgs): Promise<void> => {
  const to = (billingEmail || '').trim();
  if (!to) {
    throw new Error('No billing email on file for this customer.');
  }

  const name = companyName || 'there';
  const amountLine =
    amountCents && amountCents > 0
      ? `<p>Amount due: <strong>${formatUsd(amountCents)}</strong></p>`
      : '';

  const subject = 'Payment reminder — action needed on your PromptLine account';
  const body = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1e293b;line-height:1.6">
      <p>Hi ${name},</p>
      <p>This is a friendly reminder that your PromptLine subscription has an outstanding
      balance. To avoid any interruption to your AI receptionist, please update your
      payment details so we can complete the charge.</p>
      ${amountLine}
      <p><a href="${BILLING_PORTAL_URL}"
        style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;
        padding:10px 18px;border-radius:8px;font-weight:600">Update payment method</a></p>
      <p style="color:#64748b;font-size:13px">If you've already taken care of this, please
      disregard this message. Questions? Just reply to this email.</p>
      <p>— The PromptLine Team</p>
    </div>`;

  const { data, error } = await supabase.functions.invoke('send-ms-email', {
    body: { to, subject, body, body_type: 'HTML' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  if (adminUserId) {
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUserId,
      action: 'send_payment_reminder',
      target_tenant_id: tenantId,
      details: { to, amount_cents: amountCents ?? null },
    });
  }
};
