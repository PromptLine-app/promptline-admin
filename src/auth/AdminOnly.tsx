import type { ReactNode } from 'react';
import { useAuth } from './useAuth';

/**
 * Renders its children only for admins. Viewers (read-only role) see the
 * optional `fallback` instead (default: nothing). Wrap action buttons /
 * mutating controls with this so the UI matches the server-side RLS rules.
 */
export const AdminOnly = ({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) => {
  const { isAdmin } = useAuth();
  return <>{isAdmin ? children : fallback}</>;
};
