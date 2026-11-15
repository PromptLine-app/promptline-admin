import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { AdminOnly } from '@/auth/AdminOnly';
import { useToast } from '@/components/common/Toast';
import { StatusBadge } from '@/components/common/StatusBadge';
import { listActiveGrants, listFeatureCatalog, setFeatureGrant } from '@/lib/featureGrants';
import type { Feature, FeatureKey } from '@/lib/featureGrants';
import { reportError } from '@/lib/sentry';

/**
 * Admin switchboard for gated features on one tenant. Lists every feature in
 * the catalog; each one is invisible to (and rejected for) this tenant until an
 * admin turns it on here.
 */
export const FeatureGrantsCard = ({ tenantId }: { tenantId: string }) => {
  const { adminUser } = useAuth();
  const { toast } = useToast();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [granted, setGranted] = useState<FeatureKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFeature, setBusyFeature] = useState<FeatureKey | null>(null);

  const load = useCallback(async () => {
    try {
      const [catalog, grants] = await Promise.all([listFeatureCatalog(), listActiveGrants(tenantId)]);
      setFeatures(catalog);
      setGranted(grants);
    } catch (error) {
      reportError(error, { where: 'FeatureGrantsCard.load' });
      toast(error instanceof Error ? error.message : 'Failed to load feature access', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; setState runs after await, not during render
    load();
  }, [load]);

  const toggle = async (feature: FeatureKey, enabled: boolean) => {
    setBusyFeature(feature);
    try {
      await setFeatureGrant({ tenantId, feature, enabled, adminUserId: adminUser?.id ?? null });
      toast(enabled ? 'Feature enabled for this business.' : 'Feature disabled for this business.');
      await load();
    } catch (error) {
      reportError(error, { where: 'FeatureGrantsCard.toggle' });
      toast(error instanceof Error ? error.message : 'Failed to update feature access', 'error');
    } finally {
      setBusyFeature(null);
    }
  };

  return (
    <div className="page-card">
      <div className="page-card__header">
        <h3 className="page-card__title">Feature Access</h3>
      </div>
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : features.length === 0 ? (
        <p className="text-muted">No gated features are available yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {features.map((f) => {
            const on = granted.includes(f.key);
            return (
              <div
                key={f.key}
                style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}
              >
                <div>
                  <p style={{ fontWeight: 600 }}>
                    {f.label}{' '}
                    <StatusBadge status={on ? 'active' : 'canceled'} label={on ? 'Enabled' : 'Off'} />
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                    {f.description}
                  </p>
                </div>
                <AdminOnly>
                  <button
                    className={`btn btn--sm ${on ? 'btn--warning' : 'btn--secondary'}`}
                    onClick={() => toggle(f.key, !on)}
                    disabled={busyFeature === f.key}
                  >
                    {on ? 'Disable' : 'Enable'}
                  </button>
                </AdminOnly>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
