import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted spies so the vi.mock factory can reference them safely.
const { invoke, insert, from } = vi.hoisted(() => {
  const insert = vi.fn();
  return {
    invoke: vi.fn(),
    insert,
    from: vi.fn(() => ({ insert })),
  };
});

vi.mock('@/config/supabase', () => ({
  supabase: {
    functions: { invoke },
    from,
  },
}));

import { sendPaymentReminder } from './billingReminder';

const base = {
  tenantId: 't1',
  companyName: 'Acme Co',
  billingEmail: 'owner@acme.com',
  amountCents: 9900,
};

beforeEach(() => {
  invoke.mockReset();
  insert.mockReset().mockResolvedValue({ error: null });
  from.mockClear();
});

describe('sendPaymentReminder', () => {
  it('throws (and sends nothing) when there is no billing email', async () => {
    await expect(sendPaymentReminder({ ...base, billingEmail: null })).rejects.toThrow(/billing email/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('emails send-ms-email with the customer + amount in the body', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await sendPaymentReminder(base);

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe('send-ms-email');
    expect(opts.body.to).toBe('owner@acme.com');
    expect(opts.body.body_type).toBe('HTML');
    expect(opts.body.subject).toMatch(/payment reminder/i);
    expect(opts.body.body).toContain('Acme Co');
    expect(opts.body.body).toContain('$99');
  });

  it('writes an audit-log row when an admin id is supplied', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await sendPaymentReminder({ ...base, adminUserId: 'admin-1' });

    expect(from).toHaveBeenCalledWith('admin_activity_log');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_user_id: 'admin-1',
        action: 'send_payment_reminder',
        target_tenant_id: 't1',
      }),
    );
  });

  it('does not audit-log when no admin id is supplied', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await sendPaymentReminder(base);
    expect(from).not.toHaveBeenCalled();
  });

  it('throws when the email function returns a transport error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('graph down') });
    await expect(sendPaymentReminder(base)).rejects.toThrow('graph down');
  });

  it('throws when the email function returns a body-level error', async () => {
    invoke.mockResolvedValue({ data: { error: 'Missing Microsoft env secrets' }, error: null });
    await expect(sendPaymentReminder(base)).rejects.toThrow(/Microsoft env/);
  });
});
