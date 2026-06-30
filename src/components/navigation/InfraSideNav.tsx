import { NavLink } from 'react-router-dom';
import {
  FiServer,
  FiCpu,
  FiDatabase,
  FiShield,
} from 'react-icons/fi';
import './navigation.css';

export const InfraSideNav = () => {
  return (
    <aside className="side-nav">
      <div className="side-nav__brand">
        <img src="/logo-dark.png" alt="PromptLine" className="side-nav__brand-icon" />
        <div className="side-nav__brand-text">
          <span className="side-nav__brand-name">PromptLine</span>
          <span className="side-nav__brand-subtitle">Infrastructure</span>
        </div>
      </div>

      <nav className="side-nav__nav">
        <div className="side-nav__section">
          <p className="side-nav__section-label">Overview</p>
          <div className="side-nav__section-links">
            <NavLink to="/infra" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`} end>
              <span className="side-nav__icon"><FiServer /></span>
              Infra Dashboard
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Monitoring</p>
          <div className="side-nav__section-links">
            <NavLink to="/infra/services" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiCpu /></span>
              Services
            </NavLink>
            <NavLink to="/infra/database" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiDatabase /></span>
              Database
            </NavLink>
            <NavLink to="/infra/security" className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}>
              <span className="side-nav__icon"><FiShield /></span>
              Security
            </NavLink>
          </div>
        </div>
      </nav>
    </aside>
  );
};
