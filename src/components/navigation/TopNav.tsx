import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { FiSun, FiMoon, FiLogOut, FiUser, FiServer, FiBriefcase, FiMail, FiChevronDown } from 'react-icons/fi';

type Portal = 'business' | 'infra' | 'marketing';

export const TopNav = () => {
  const { adminUser, signOut, hasBusinessAccess, hasInfraAccess, hasMarketingAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isOnInfra = location.pathname.startsWith('/infra');
  const isOnMarketing = location.pathname.startsWith('/marketing');

  const currentPortal: Portal = isOnInfra ? 'infra' : isOnMarketing ? 'marketing' : 'business';

  // Count how many portals the user can access
  const availablePortals: { label: string; icon: React.ReactNode; path: string; key: Portal }[] = [
    ...(hasBusinessAccess ? [{ label: 'Business', icon: <FiBriefcase />, path: '/', key: 'business' as Portal }] : []),
    ...(hasInfraAccess ? [{ label: 'Infrastructure', icon: <FiServer />, path: '/infra', key: 'infra' as Portal }] : []),
    ...(hasMarketingAccess ? [{ label: 'Marketing', icon: <FiMail />, path: '/marketing', key: 'marketing' as Portal }] : []),
  ];

  const showPortalSwitcher = availablePortals.length > 1;
  const [showPortalMenu, setShowPortalMenu] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === 'light' ? 'dark' : 'light');
  };

  // Close menus on click outside
  useEffect(() => {
    if (!showUserMenu && !showPortalMenu) return;
    const handleOutside = () => { setShowUserMenu(false); setShowPortalMenu(false); };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, [showUserMenu, showPortalMenu]);

  const currentPortalInfo = availablePortals.find(p => p.key === currentPortal);

  return (
    <header className="top-nav">
      <div className="top-nav__lead">
        {/* Breadcrumbs placeholder */}
      </div>

      <div className="top-nav__actions">
        {showPortalSwitcher && (
          <div className="portal-switcher-wrapper" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPortalMenu(s => !s)}
              className="btn btn--secondary btn--sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
              title="Switch portal"
            >
              {currentPortalInfo?.icon}
              {currentPortalInfo?.label}
              <FiChevronDown style={{ opacity: 0.6 }} />
            </button>

            {showPortalMenu && (
              <div className="portal-switcher-dropdown">
                {availablePortals.map((portal) => (
                  <button
                    key={portal.key}
                    className={`portal-switcher-item ${portal.key === currentPortal ? 'is-active' : ''}`}
                    onClick={() => { navigate(portal.path); setShowPortalMenu(false); }}
                  >
                    {portal.icon}
                    {portal.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={toggleTheme} className="icon-button" title="Toggle theme">
          {theme === 'dark' ? <FiSun /> : <FiMoon />}
        </button>

        <div className="user-menu-wrapper" onClick={(e) => e.stopPropagation()}>
          <button
            className="user-pill-button"
            onClick={() => setShowUserMenu(s => !s)}
          >
            <div className="user-pill">
              <div className="avatar">
                <FiUser />
              </div>
              <div>
                <p className="user-pill__name">{adminUser?.full_name || 'Admin'}</p>
                <p className="user-pill__role">{adminUser?.role === 'admin' ? 'Super Admin' : 'Viewer'}</p>
              </div>
            </div>
          </button>

          {showUserMenu && (
            <div className="user-menu__dropdown">
              <div className="user-menu__header">
                <p className="user-menu__name">{adminUser?.full_name || 'Admin'}</p>
                <p className="user-menu__email">{adminUser?.email}</p>
              </div>

              <button onClick={signOut} className="user-menu__logout">
                Sign Out <FiLogOut />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
