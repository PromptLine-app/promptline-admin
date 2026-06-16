import { Navigate } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { useAuth } from './useAuth';

/**
 * Route guard for the Infrastructure portal.
 * Blocks users who don't have `has_infra_access` on their admin_users row.
 */
export const InfraGuard = ({ children }: PropsWithChildren) => {
  const { adminUser, hasInfraAccess, initializing } = useAuth();

  if (initializing) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
      </div>
    );
  }

  if (!adminUser || !hasInfraAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
