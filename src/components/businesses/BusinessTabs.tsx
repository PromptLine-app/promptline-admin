import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { AdminOnly } from '@/auth/AdminOnly';
import { useToast } from '@/components/common/Toast';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { openCustomerView } from '@/lib/impersonate';
import { reportError } from '@/lib/sentry';
import { FiExternalLink } from 'react-icons/fi';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'agent', label: 'Agent' },
  { to: 'calls', label: 'Calls' },
  { to: 'conversations', label: 'Conversations' },
  { to: 'automations', label: 'Automations' },
  { to: 'notes', label: 'Notes' },
];

/**
 * Sub-navigation shown on every per-business page, plus the "Open customer view"
 * action (magic-link impersonation). `tenantId` drives both the tab links and
 * the impersonation target.
 */
export const BusinessTabs = ({ tenantId }: { tenantId: string }) => {
  const { adminUser } = useAuth();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  const handleOpenCustomerView = async () => {
    setOpening(true);
    try {
      const { action_link, email } = await openCustomerView(tenantId);

      if (adminUser) {
        await supabase.from('admin_activity_log').insert({
          admin_user_id: adminUser.id,
          action: 'impersonate_tenant',
          target_tenant_id: tenantId,
          details: { owner_email: email },
        });
      }

      window.open(action_link, '_blank', 'noopener,noreferrer');
      toast(`Opening customer view as ${email}…`);
    } catch (err: any) {
      reportError(err, { where: 'BusinessTabs.handleOpenCustomerView' });
      console.error('Impersonation failed:', err);
      toast(err?.message || 'Failed to open customer view', 'error');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        borderBottom: '1px solid hsl(var(--border))',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}
    >
      <nav style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={`/businesses/${tenantId}${t.to ? `/${t.to}` : ''}`}
            end={t.end}
            className={({ isActive }) => `business-tab ${isActive ? 'is-active' : ''}`}
            style={({ isActive }) => ({
              padding: '0.6rem 0.9rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
              borderBottom: isActive ? '2px solid hsl(var(--primary))' : '2px solid transparent',
              marginBottom: '-1px',
              textDecoration: 'none',
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <AdminOnly>
        <button
          className="btn btn--secondary btn--sm"
          onClick={() => setConfirmOpen(true)}
          disabled={opening}
          style={{ marginBottom: '0.4rem' }}
        >
          <FiExternalLink /> {opening ? 'Opening…' : 'Open customer view'}
        </button>
      </AdminOnly>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Open customer view"
        message="This opens a new tab logged in AS the customer (full access to their account). The action is recorded in the activity log. Continue?"
        confirmLabel="Open as customer"
        onConfirm={handleOpenCustomerView}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
