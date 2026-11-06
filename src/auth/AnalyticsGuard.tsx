import { Navigate } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { useAuth } from './useAuth';

/**
 * Route guard for the Analytics portal.
 * Blocks users who don't have `has_analytics_access` on their admin_users row.
 */
export const AnalyticsGuard = ({ children }: PropsWithChildren) => {
  const { adminUser, hasAnalyticsAccess, initializing } = useAuth();

  if (initializing) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
      </div>
    );
  }

  if (!adminUser || !hasAnalyticsAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

