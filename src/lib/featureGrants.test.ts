import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted spies so the vi.mock factory can reference them safely.
const h = vi.hoisted(() => {
  const result = { current: { data: [] as unknown[], error: null as unknown } };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const eq = vi.fn();
  const is = vi.fn();
  const select = vi.fn();
  const order = vi.fn();
  const upsert = vi.fn();
  const update = vi.fn();
  const insert = vi.fn();
  // Thenable chain: awaiting any point in select/update chains resolves to result.current.
  const thenable = () => ({
    eq,
    is,
    order,
    then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
      Promise.resolve(result.current).then(f, r),
  });
  chain.eq = eq.mockImplementation(thenable);
  chain.is = is.mockImplementation(thenable);
  select.mockImplementation(thenable);
  order.mockImplementation(() => Promise.resolve(result.current));
  update.mockImplementation(thenable);
  upsert.mockImplementation(() => Promise.resolve(result.current));
  const from = vi.fn((table: string) =>
    table === 'admin_activity_log' ? { insert } : { select, upsert, update },
  );
  return { result, eq, is, select, order, upsert, update, insert, from, thenable };
});

vi.mock('@/config/supabase', () => ({ supabase: { from: h.from } }));

import { listActiveGrants, listFeatureCatalog, setFeatureGrant } from './featureGrants';

beforeEach(() => {
  h.result.current = { data: [], error: null };
  h.insert.mockReset().mockResolvedValue({ error: null });
  h.upsert.mockClear().mockImplementation(() => Promise.resolve(h.result.current));
  h.update.mockClear().mockImplementation(h.thenable);
  h.select.mockClear().mockImplementation(h.thenable);
  h.eq.mockClear().mockImplementation(h.thenable);
  h.is.mockClear().mockImplementation(h.thenable);
  h.order.mockClear().mockImplementation(() => Promise.resolve(h.result.current));
  h.from.mockClear();
});

describe('listFeatureCatalog', () => {
  it('returns every catalogued feature, ordered by label', async () => {
    const rows = [{ key: 'acuity', label: 'Acuity Scheduling', description: 'Calendar provider.' }];
    h.result.current = { data: rows, error: null };
    await expect(listFeatureCatalog()).resolves.toEqual(rows);
    expect(h.from).toHaveBeenCalledWith('feature_catalog');
    expect(h.order).toHaveBeenCalledWith('label');
  });

  it('returns an empty list when the catalog has no rows', async () => {
    h.result.current = { data: null as unknown as unknown[], error: null };
    await expect(listFeatureCatalog()).resolves.toEqual([]);
  });

  it('throws on a query error', async () => {
    h.result.current = { data: [], error: new Error('rls denied') };
    await expect(listFeatureCatalog()).rejects.toThrow('rls denied');
  });
});

describe('listActiveGrants', () => {
  it('returns the feature keys of non-revoked grants for the tenant', async () => {
    h.result.current = { data: [{ feature: 'acuity' }], error: null };
    await expect(listActiveGrants('t1')).resolves.toEqual(['acuity']);
    expect(h.eq).toHaveBeenCalledWith('tenant_id', 't1');
    expect(h.is).toHaveBeenCalledWith('revoked_at', null);
  });

  it('throws on a query error', async () => {
    h.result.current = { data: [], error: new Error('rls denied') };
    await expect(listActiveGrants('t1')).rejects.toThrow('rls denied');
  });
});

describe('setFeatureGrant', () => {
  it('enabling upserts an un-revoked grant keyed on tenant+feature', async () => {
    await setFeatureGrant({ tenantId: 't1', feature: 'acuity', enabled: true, adminUserId: 'a1', note: ' pilot ' });
    const [row, opts] = h.upsert.mock.calls[0];
    expect(row).toMatchObject({
      tenant_id: 't1',
      feature: 'acuity',
      granted_by: 'a1',
      revoked_at: null,
      note: 'pilot',
    });
    expect(opts).toEqual({ onConflict: 'tenant_id,feature' });
  });

  it('disabling soft-revokes (sets revoked_at) instead of deleting', async () => {
    await setFeatureGrant({ tenantId: 't1', feature: 'acuity', enabled: false });
    const [patch] = h.update.mock.calls[0];
    expect(typeof patch.revoked_at).toBe('string');
    expect(h.eq).toHaveBeenCalledWith('tenant_id', 't1');
    expect(h.eq).toHaveBeenCalledWith('feature', 'acuity');
  });

  it('audit-logs grant and revoke when an admin id is supplied', async () => {
    await setFeatureGrant({ tenantId: 't1', feature: 'acuity', enabled: true, adminUserId: 'a1' });
    expect(h.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        admin_user_id: 'a1',
        action: 'grant_feature',
        target_tenant_id: 't1',
        details: { feature: 'acuity' },
      }),
    );
    await setFeatureGrant({ tenantId: 't1', feature: 'acuity', enabled: false, adminUserId: 'a1' });
    expect(h.insert).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'revoke_feature' }));
  });

  it('does not audit-log when no admin id is supplied', async () => {
    await setFeatureGrant({ tenantId: 't1', feature: 'acuity', enabled: true });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('throws (and does not audit-log) when the write fails', async () => {
    h.result.current = { data: [], error: new Error('not an admin writer') };
    await expect(
      setFeatureGrant({ tenantId: 't1', feature: 'acuity', enabled: true, adminUserId: 'a1' }),
    ).rejects.toThrow('not an admin writer');
    expect(h.insert).not.toHaveBeenCalled();
  });
});
