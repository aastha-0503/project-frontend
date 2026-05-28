import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FiHome, FiMic, FiUsers, FiSettings, FiBarChart2, FiBriefcase,
  FiLogOut, FiShield, FiUser,
} from 'react-icons/fi';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from '../lib/auth.jsx';

const Sidebar = () => {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = account?.role === 'admin';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="brand-header">
        <div className="brand-logo">G</div>
        <div className="brand-text">
          <h2>Geeky AI</h2>
          <small>HR Automation Suite</small>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <NotificationBell />
        </div>
      </div>

      {/* ── Step 0: Overview ── */}
      <div className="nav-section">
        <div className="nav-label">Overview</div>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active-nav' : 'nav-item'}>
          <FiHome /> Dashboard
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => isActive ? 'nav-item active-nav' : 'nav-item'}>
          <FiBarChart2 /> Analytics
        </NavLink>
      </div>

      {/* ── Step 1-3: The hiring workflow, in order. Available to everyone
           who's signed in — both admins and employees. ── */}
      <div className="nav-section">
        <div className="nav-label">Workflow</div>
        <NavLink to="/screening" className={({ isActive }) => isActive ? 'nav-item active-nav' : 'nav-item'}>
          <FiMic /> <span style={{ flex: 1 }}>1 · Voice Screening</span>
        </NavLink>
        <NavLink to="/jobs" className={({ isActive }) => isActive ? 'nav-item active-nav' : 'nav-item'}>
          <FiBriefcase /> <span style={{ flex: 1 }}>2 · Jobs</span>
        </NavLink>
        <NavLink to="/candidates" className={({ isActive }) => isActive ? 'nav-item active-nav' : 'nav-item'}>
          <FiUsers /> <span style={{ flex: 1 }}>3 · Candidates</span>
        </NavLink>
      </div>

      {/* Settings — admin only. API keys, theme defaults, data resets, and
          the custom question-bank upload all live there, so we hide the
          link entirely for non-admin employees. */}
      {isAdmin && (
        <div className="nav-section">
          <div className="nav-label">System</div>
          <NavLink to="/employees" className={({ isActive }) => isActive ? 'nav-item active-nav' : 'nav-item'}>
            <FiUsers /> Employees
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item active-nav' : 'nav-item'}>
            <FiSettings /> Settings
          </NavLink>
        </div>
      )}

      <div className="sidebar-footer">
        {/* Signed-in chip — name + role + sign-out. Replaces the old
            "All systems operational" string so the user sees who they're
            logged in as at a glance. */}
        {account && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(79,70,229,0.08)',
            border: '1px solid rgba(79,70,229,0.18)',
            marginBottom: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: isAdmin
                ? 'linear-gradient(135deg, #4f46e5, #06b6d4)'
                : 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.95rem', flexShrink: 0,
            }}>
              {(account.name || account.email || account.employee_id || '?').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {account.name || account.email || account.employee_id}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                {isAdmin ? <FiShield size={10} /> : <FiUser size={10} />}
                {isAdmin ? 'Admin' : `Employee · ${account.employee_id || ''}`}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 6, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}
            >
              <FiLogOut />
            </button>
          </div>
        )}

        <div className="sidebar-status">
          <div className="pulse-dot"></div>
          <span>All systems operational</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
