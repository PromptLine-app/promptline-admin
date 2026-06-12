import { useState, useEffect } from 'react';
import { useAuth } from '@/auth/useAuth';
import { FiSun, FiMoon, FiLogOut, FiUser } from 'react-icons/fi';

export const TopNav = () => {
  const { adminUser, signOut } = useAuth();
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

  // Close menu on click outside
  useEffect(() => {
    if (!showUserMenu) return;
    const handleOutside = () => setShowUserMenu(false);
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, [showUserMenu]);

  return (
    <header className="top-nav">
      <div className="top-nav__lead">
        {/* Placeholder for potential breadcrumbs or mobile menu toggle */}
      </div>

      <div className="top-nav__actions">
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
