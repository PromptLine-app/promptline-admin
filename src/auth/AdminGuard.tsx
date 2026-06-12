import { Navigate, useLocation } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { useAuth } from './useAuth';

export const AdminGuard = ({ children }: PropsWithChildren) => {
  const { user, adminUser, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!adminUser) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
        <div className="page-card" style={{ maxWidth: 500 }}>
          <h2 style={{ color: 'hsl(var(--destructive))', marginBottom: '1rem' }}>Access Denied</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
            You do not have administrative access to this dashboard. If you believe this is an error, please contact a system administrator.
          </p>
          <button 
            className="btn btn--primary" 
            onClick={() => {
              // Sign out from the context rather than directly from supabaseAuth
              // to ensure state updates
              import('@/config/supabase').then(({ supabaseAuth }) => {
                supabaseAuth.auth.signOut().then(() => window.location.reload());
              });
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
