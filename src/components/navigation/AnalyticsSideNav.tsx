import { NavLink } from 'react-router-dom';
import {
  FiBarChart2,
  FiActivity,
  FiGlobe,
  FiSmartphone,
  FiFileText,
  FiTrendingUp,
  FiZap,
  FiKey,
} from 'react-icons/fi';
import './navigation.css';

export const AnalyticsSideNav = () => {
  return (
    <aside className="side-nav">
      <div className="side-nav__brand">
        <img src="/logo-dark.png" alt="PromptLine" className="side-nav__brand-icon" />
        <div className="side-nav__brand-text">
          <span className="side-nav__brand-name">PromptLine</span>
          <span className="side-nav__brand-subtitle">Analytics</span>
        </div>
      </div>

      <nav className="side-nav__nav">
        <div className="side-nav__section">
          <p className="side-nav__section-label">Overview</p>
          <div className="side-nav__section-links">
            <NavLink to="/analytics" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`} end>
              <span className="side-nav__icon"><FiBarChart2 /></span>
              Dashboard
            </NavLink>
            <NavLink to="/analytics/realtime" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiZap /></span>
              Realtime
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Audience</p>
          <div className="side-nav__section-links">
            <NavLink to="/analytics/traffic" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiTrendingUp /></span>
              Traffic Sources
            </NavLink>
            <NavLink to="/analytics/locations" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiGlobe /></span>
              Geography
            </NavLink>
            <NavLink to="/analytics/devices" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiSmartphone /></span>
              Devices
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Content</p>
          <div className="side-nav__section-links">
            <NavLink to="/analytics/pages" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiFileText /></span>
              Top Pages
            </NavLink>
            <NavLink to="/analytics/goals" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiActivity /></span>
              Conversions
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Settings</p>
          <div className="side-nav__section-links">
            <NavLink to="/analytics/credentials" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiKey /></span>
              GA4 Credentials
            </NavLink>
          </div>
        </div>
      </nav>
    </aside>
  );
};
