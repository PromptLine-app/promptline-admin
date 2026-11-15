import { supabase } from '@/config/supabase';

/**
 * Per-tenant feature gate ("grants").
 *
 * A row in tenant_feature_grants means an admin has switched <feature> on for
 * that tenant; no row / a revoked row means the feature doesn't exist for them.
 * Only admin writers can write the table (RLS) — tenants can't self-enable. The
 * server-side enforcement lives in promptline-secure
 * (supabase/functions/_shared/feature-gate.ts); this module is just the admin
 * control surface. Revoking sets revoked_at rather than deleting, so history is
 * kept, and every change writes an admin_activity_log row.
 *
 * The list of gated features is not hardcoded here: it is read from the
 * feature_catalog table (promptline-secure
 * migrations/20261022100200_feature_catalog.sql), so a feature added there
 * shows up in the admin UI without a change to this app.
 *
 * All helpers throw on failure so callers can surface a toast.
 */

export type FeatureKey = string;

export type Feature = {
  key: FeatureKey;
  label: string;
  description: string;
};

/** Every gated feature that exists, whether or not any tenant has it. */
export const listFeatureCatalog = async (): Promise<Feature[]> => {
  const { data, error } = await supabase
    .from('feature_catalog')
    .select('key, label, description')
    .order('label');
  if (error) throw error;
  return (data ?? []) as Feature[];
};

export const listActiveGrants = async (tenantId: string): Promise<FeatureKey[]> => {
  const { data, error } = await supabase
    .from('tenant_feature_grants')
    .select('feature')
    .eq('tenant_id', tenantId)
    .is('revoked_at', null);
  if (error) throw error;
  return (data ?? []).map((row: { feature: string }) => row.feature);
};

export type SetGrantArgs = {
  tenantId: string;
  feature: FeatureKey;
  enabled: boolean;
  /** Optional admin user id — when provided the action is written to the audit log. */
  adminUserId?: string | null;
  note?: string;
};

export const setFeatureGrant = async ({
  tenantId,
  feature,
  enabled,
  adminUserId,
  note,
}: SetGrantArgs): Promise<void> => {
  const nowIso = new Date().toISOString();

  if (enabled) {
    const { error } = await supabase.from('tenant_feature_grants').upsert(
      {
        tenant_id: tenantId,
        feature,
        granted_by: adminUserId ?? null,
        granted_at: nowIso,
        revoked_at: null,
        note: note?.trim() || null,
      },
      { onConflict: 'tenant_id,feature' },
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('tenant_feature_grants')
      .update({ revoked_at: nowIso })
      .eq('tenant_id', tenantId)
      .eq('feature', feature);
    if (error) throw error;
  }

  if (adminUserId) {
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUserId,
      action: enabled ? 'grant_feature' : 'revoke_feature',
      target_tenant_id: tenantId,
      details: { feature, ...(note?.trim() ? { note: note.trim() } : {}) },
    });
  }
};
