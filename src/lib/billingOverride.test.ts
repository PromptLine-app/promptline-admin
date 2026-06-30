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

import { applyPaymentBypass, revokePaymentBypass } from './billingOverride';

beforeEach(() => {
  invoke.mockReset();
  insert.mockReset().mockResolvedValue({ error: null });
  from.mockClear();
});

describe('applyPaymentBypass', () => {
  it('throws (and calls nothing) when no reason is given', async () => {
    await expect(applyPaymentBypass({ tenantId: 't1', reason: '   ' })).rejects.toThrow(/reason is required/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes admin-billing-override with action=grant and the trimmed reason', async () => {
    invoke.mockResolvedValue({ data: { success: true, status: 'active' }, error: null });
    await applyPaymentBypass({ tenantId: 't1', reason: '  3DS contingency  ' });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe('admin-billing-override');
    expect(opts.body).toEqual({ tenantId: 't1', action: 'grant', reason: '3DS contingency' });
  });

  it('writes an audit-log row when an admin id is supplied', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await applyPaymentBypass({ tenantId: 't1', reason: 'goodwill', adminUserId: 'admin-1' });

    expect(from).toHaveBeenCalledWith('admin_activity_log');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_user_id: 'admin-1',
        action: 'bypass_payment',
        target_tenant_id: 't1',
        details: { reason: 'goodwill' },
      }),
    );
  });

  it('does not audit-log when no admin id is supplied', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await applyPaymentBypass({ tenantId: 't1', reason: 'goodwill' });
    expect(from).not.toHaveBeenCalled();
  });

  it('throws on a transport error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('edge down') });
    await expect(applyPaymentBypass({ tenantId: 't1', reason: 'x' })).rejects.toThrow('edge down');
  });

  it('throws on a body-level error (e.g. non-admin caller)', async () => {
    invoke.mockResolvedValue({ data: { error: 'Unauthorized: admin access required' }, error: null });
    await expect(applyPaymentBypass({ tenantId: 't1', reason: 'x' })).rejects.toThrow(/admin access required/i);
  });
});

describe('revokePaymentBypass', () => {
  it('invokes admin-billing-override with action=revoke', async () => {
    invoke.mockResolvedValue({ data: { success: true, status: 'pending' }, error: null });
    await revokePaymentBypass({ tenantId: 't1' });

    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe('admin-billing-override');
    expect(opts.body).toEqual({ tenantId: 't1', action: 'revoke' });
  });

  it('writes a revoke audit-log row when an admin id is supplied', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await revokePaymentBypass({ tenantId: 't1', adminUserId: 'admin-1' });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_user_id: 'admin-1',
        action: 'revoke_payment_bypass',
        target_tenant_id: 't1',
      }),
    );
  });

  it('throws on a body-level error', async () => {
    invoke.mockResolvedValue({ data: { error: 'No billing record for this tenant' }, error: null });
    await expect(revokePaymentBypass({ tenantId: 't1' })).rejects.toThrow(/No billing record/i);
  });
});
