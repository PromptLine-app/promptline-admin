import { Routes, Route, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { LoginPage } from '@/pages/auth/LoginPage';
import { AdminGuard } from '@/auth/AdminGuard';
import { SideNav } from '@/components/navigation/SideNav';
import { TopNav } from '@/components/navigation/TopNav';

import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { HealthPage } from '@/pages/health/HealthPage';
import { BusinessListPage } from '@/pages/businesses/BusinessListPage';
import { BusinessDetailPage } from '@/pages/businesses/BusinessDetailPage';
import { BusinessAgentPage } from '@/pages/businesses/BusinessAgentPage';
import { BusinessConversationsPage } from '@/pages/businesses/BusinessConversationsPage';
import { BusinessAutomationsPage } from '@/pages/businesses/BusinessAutomationsPage';
import { BusinessNotesPage } from '@/pages/businesses/BusinessNotesPage';
import { RevenuePage } from '@/pages/revenue/RevenuePage';
import { DunningPage } from '@/pages/billing/DunningPage';
import { BusinessCallsPage } from '@/pages/businesses/BusinessCallsPage';
import { CallDetailPage } from '@/pages/calls/CallDetailPage';
import { PromoCodesPage } from '@/pages/promos/PromoCodesPage';
import { TeamPage } from '@/pages/team/TeamPage';
import { ActivityLogPage } from '@/pages/activity/ActivityLogPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import ZohoCallbackPage from '@/pages/auth/ZohoCallbackPage';

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

export default function App() {
  const { initializing } = useAuth();

  if (initializing) {
    return null; // App level loader if needed
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<ZohoCallbackPage />} />
      <Route
        path="/reset-password"
        element={<ResetPasswordPage />}
      />

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
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="dunning" element={<DunningPage />} />
        <Route path="calls/:id" element={<CallDetailPage />} />
        <Route path="promos" element={<PromoCodesPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="activity" element={<ActivityLogPage />} />
        
        <Route path="*" element={<div className="page-card"><div className="empty-state"><h3>404 Not Found</h3><p>The page you're looking for doesn't exist.</p></div></div>} />
      </Route>
    </Routes>
  );
}
