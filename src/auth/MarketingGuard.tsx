import { Navigate } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { useAuth } from './useAuth';

/**
 * Route guard for the Marketing portal.
 * Blocks users who don't have `has_marketing_access` on their admin_users row.
 */
export const MarketingGuard = ({ children }: PropsWithChildren) => {
  const { adminUser, hasMarketingAccess, initializing } = useAuth();

  if (initializing) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
      </div>
    );
  }

  if (!adminUser || !hasMarketingAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
