import { NavLink } from 'react-router-dom';
import {
  FiPieChart,
  FiBriefcase,
  FiDollarSign,
  FiPhoneCall,
  FiGift,
  FiUsers,
  FiActivity,
  FiAlertTriangle,
  FiCreditCard
} from 'react-icons/fi';
import './navigation.css';

export const SideNav = () => {
  return (
    <aside className="side-nav">
      <div className="side-nav__brand">
        <img src="/logo-dark.png" alt="PromptLine" className="side-nav__brand-icon" />
        <div className="side-nav__brand-text">
          <span className="side-nav__brand-name">PromptLine</span>
          <span className="side-nav__brand-subtitle">Admin Dashboard</span>
        </div>
      </div>

      <nav className="side-nav__nav">
        <div className="side-nav__section">
          <p className="side-nav__section-label">Overview</p>
          <div className="side-nav__section-links">
            <NavLink to="/" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`} end>
              <span className="side-nav__icon"><FiPieChart /></span>
              Dashboard
            </NavLink>
            <NavLink to="/health" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiAlertTriangle /></span>
              Health
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Platform</p>
          <div className="side-nav__section-links">
            <NavLink to="/businesses" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiBriefcase /></span>
              Businesses
            </NavLink>
            <NavLink to="/revenue" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiDollarSign /></span>
              Revenue
            </NavLink>
            <NavLink to="/dunning" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiCreditCard /></span>
              Failed Payments
            </NavLink>
            <NavLink to="/calls" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiPhoneCall /></span>
              Call Analytics
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Management</p>
          <div className="side-nav__section-links">
            <NavLink to="/promos" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiGift /></span>
              Promo Codes
            </NavLink>
            <NavLink to="/team" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiUsers /></span>
              Team
            </NavLink>
            <NavLink to="/activity" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiActivity /></span>
              Activity Log
            </NavLink>
          </div>
        </div>
      </nav>
    </aside>
  );
};
