import * as Sentry from '@sentry/react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { LoginPage } from '@/pages/auth/LoginPage';
import { AdminGuard } from '@/auth/AdminGuard';
import { InfraGuard } from '@/auth/InfraGuard';
import { SideNav } from '@/components/navigation/SideNav';
import { InfraSideNav } from '@/components/navigation/InfraSideNav';
import { TopNav } from '@/components/navigation/TopNav';

import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { HealthPage } from '@/pages/health/HealthPage';
import { BusinessListPage } from '@/pages/businesses/BusinessListPage';
import { BusinessDetailPage } from '@/pages/businesses/BusinessDetailPage';
import { BusinessAgentPage } from '@/pages/businesses/BusinessAgentPage';
import { BusinessConversationsPage } from '@/pages/businesses/BusinessConversationsPage';
import { BusinessAutomationsPage } from '@/pages/businesses/BusinessAutomationsPage';
import { BusinessNotesPage } from '@/pages/businesses/BusinessNotesPage';
import { BusinessLogsPage } from '@/pages/businesses/BusinessLogsPage';
import { RevenuePage } from '@/pages/revenue/RevenuePage';
import { DunningPage } from '@/pages/billing/DunningPage';
import { BusinessCallsPage } from '@/pages/businesses/BusinessCallsPage';
import { CallDetailPage } from '@/pages/calls/CallDetailPage';
import { PromoCodesPage } from '@/pages/promos/PromoCodesPage';
import { TeamPage } from '@/pages/team/TeamPage';
import { ActivityLogPage } from '@/pages/activity/ActivityLogPage';
import { UserFollowupsPage } from '@/pages/users/UserFollowupsPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import ZohoCallbackPage from '@/pages/auth/ZohoCallbackPage';
import { InfraDashboardPage } from '@/pages/infra/InfraDashboardPage';
import { ExternalServicesPage } from '@/pages/infra/ExternalServicesPage';
import { InfraLogsPage } from '@/pages/infra/InfraLogsPage';

const ErrorFallback = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      padding: '2rem',
      textAlign: 'center',
    }}
  >
    <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Something went wrong</h1>
    <p style={{ margin: 0, opacity: 0.8 }}>Please refresh the page to try again.</p>
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        padding: '0.5rem 1.25rem',
        borderRadius: '0.5rem',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 600,
      }}
    >
      Refresh
    </button>
  </div>
);

/** Business portal layout — uses the standard SideNav */
const AppLayout = () => {
  return (
    <div className="app-layout">
      <SideNav />
      <div className="app-main">
        <TopNav />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

/** Infrastructure portal layout — uses InfraSideNav */
const InfraLayout = () => {
  return (
    <div className="app-layout">
      <InfraSideNav />
      <div className="app-main">
        <TopNav />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default function App() {
  const { initializing } = useAuth();

  if (initializing) {
    return null; // App level loader if needed
  }

  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<ZohoCallbackPage />} />
      <Route
        path="/reset-password"
        element={<ResetPasswordPage />}
      />

      {/* ── Business Portal ── */}
      <Route
        path="/"
        element={
          <AdminGuard>
            <AppLayout />
          </AdminGuard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="health" element={<HealthPage />} />

        <Route path="businesses" element={<BusinessListPage />} />
        <Route path="businesses/:id" element={<BusinessDetailPage />} />
        <Route path="businesses/:id/agent" element={<BusinessAgentPage />} />
        <Route path="businesses/:id/calls" element={<BusinessCallsPage />} />
        <Route path="businesses/:id/conversations" element={<BusinessConversationsPage />} />
        <Route path="businesses/:id/automations" element={<BusinessAutomationsPage />} />
        <Route path="businesses/:id/notes" element={<BusinessNotesPage />} />
        <Route path="businesses/:id/logs" element={<BusinessLogsPage />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="dunning" element={<DunningPage />} />
        <Route path="calls/:id" element={<CallDetailPage />} />
        <Route path="promos" element={<PromoCodesPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="followups" element={<UserFollowupsPage />} />
        <Route path="activity" element={<ActivityLogPage />} />
        
        <Route path="*" element={<div className="page-card"><div className="empty-state"><h3>404 Not Found</h3><p>The page you're looking for doesn't exist.</p></div></div>} />
      </Route>

      {/* ── Infrastructure Portal ── */}
      <Route
        path="/infra"
        element={
          <AdminGuard>
            <InfraGuard>
              <InfraLayout />
            </InfraGuard>
          </AdminGuard>
        }
      >
        <Route index element={<InfraDashboardPage />} />
        <Route path="services" element={<ExternalServicesPage />} />
        {/* Placeholder routes — pages will be built as monitoring data sources are connected */}
        <Route path="database" element={<div className="page-card"><div className="empty-state"><h3>Database</h3><p>Database monitoring coming soon.</p></div></div>} />
        <Route path="security" element={<div className="page-card"><div className="empty-state"><h3>Security</h3><p>Security monitoring coming soon.</p></div></div>} />
        <Route path="logs" element={<InfraLogsPage />} />
      </Route>
    </Routes>
    </Sentry.ErrorBoundary>
  );
}
