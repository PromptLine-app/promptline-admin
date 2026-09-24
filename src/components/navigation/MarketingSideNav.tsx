import { NavLink } from 'react-router-dom';
import {
  FiMail,
  FiFileText,
  FiUsers,
  FiSend,
  FiSettings,
  FiBarChart2,
} from 'react-icons/fi';
import './navigation.css';

export const MarketingSideNav = () => {
  return (
    <aside className="side-nav">
      <div className="side-nav__brand">
        <img src="/logo-dark.png" alt="PromptLine" className="side-nav__brand-icon" />
        <div className="side-nav__brand-text">
          <span className="side-nav__brand-name">PromptLine</span>
          <span className="side-nav__brand-subtitle">Marketing</span>
        </div>
      </div>

      <nav className="side-nav__nav">
        <div className="side-nav__section">
          <p className="side-nav__section-label">Overview</p>
          <div className="side-nav__section-links">
            <NavLink
              to="/marketing"
              className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}
              end
            >
              <span className="side-nav__icon"><FiBarChart2 /></span>
              Dashboard
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Email Tools</p>
          <div className="side-nav__section-links">
            <NavLink
              to="/marketing/templates"
              className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}
            >
              <span className="side-nav__icon"><FiFileText /></span>
              Templates
            </NavLink>
            <NavLink
              to="/marketing/contacts"
              className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}
            >
              <span className="side-nav__icon"><FiUsers /></span>
              Contacts
            </NavLink>
            <NavLink
              to="/marketing/send"
              className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}
            >
              <span className="side-nav__icon"><FiSend /></span>
              Send Email
            </NavLink>
          </div>
        </div>

        <div className="side-nav__section">
          <p className="side-nav__section-label">Settings</p>
          <div className="side-nav__section-links">
            <NavLink
              to="/marketing/senders"
              className={({ isActive }) => `side-nav__link ${isActive ? 'is-active' : ''}`}
            >
              <span className="side-nav__icon"><FiMail /></span>
              Senders
            </NavLink>
          </div>
        </div>
      </nav>
    </aside>
  );
};
