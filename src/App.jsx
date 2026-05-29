import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import VoiceScreening from './pages/VoiceScreening';
import Candidates from './pages/Candidates';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Jobs from './pages/Jobs';
import Employees from './pages/Employees';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import './App.css';

/**
 * Guard component — bounces unauthenticated visitors to /login, and preserves
 * the requested URL so we can redirect them back after they sign in.
 *
 * `requireAdmin` is an optional second gate for pages that only admins can
 * touch (e.g. settings, sending interview emails). Users hit a friendly
 * "forbidden" view instead of the page itself.
 */
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { account, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    // Auth state is still being re-validated — show a tiny shim so we don't
    // briefly flash the login page over a valid session.
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-main, #f6f8fb)', color: 'var(--text-muted, #64748b)',
        fontFamily: 'inherit',
      }}>
        Loading…
      </div>
    );
  }

  if (!account) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (requireAdmin && account.role !== 'admin') {
    return (
      <div style={{ padding: '48px 32px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Admins only</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          This area is restricted to admin accounts. Ask your hiring lead to grant access,
          or switch to an admin account.
        </p>
      </div>
    );
  }

  return children;
};

/** The signed-in chrome — sidebar + routed page. Lives behind ProtectedRoute.
 *
 * Permission model:
 *   - Employees can access the full hiring workflow (Dashboard, Analytics,
 *     Resume Screening, Jobs, Candidates) — they just don't get to change
 *     system-level configuration.
 *   - Settings is admin-only: API keys, theme defaults, data resets,
 *     question bank uploads. */
const AppShell = () => (
  <div className="app-shell">
    <Sidebar />
    <main className="main-content">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/screening" element={<VoiceScreening />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/employees" element={
          <ProtectedRoute requireAdmin><Employees /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute requireAdmin><Settings /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes — these never require a session. */}
          <Route path="/login"  element={<Login mode="login"  />} />
          <Route path="/signup" element={<Login mode="signup" />} />

          {/* Everything else lives behind the guard. */}
          <Route path="*" element={
            <ProtectedRoute><AppShell /></ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
