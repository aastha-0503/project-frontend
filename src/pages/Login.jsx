// Two-panel sign-in for SmartStaff.
//
// The recruiter picks "Admin" or "User" — each role shows its own credential
// field (email vs employee ID). They can flip to the Sign-Up panel if they
// need an account. Once authenticated the AuthProvider stores the token and
// the router (in App.jsx) flips to the protected routes.

import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  FiShield, FiUser, FiMail, FiHash, FiLock, FiEye, FiEyeOff,
  FiUserPlus, FiLogIn, FiAlertCircle,
} from 'react-icons/fi';
import { useAuth } from '../lib/auth.jsx';

const ROLES = [
  { id: 'admin', label: 'Admin',   icon: FiShield, hint: "Recruiters & hiring managers · sign in with your work email." },
  { id: 'user',  label: 'Employee', icon: FiUser,   hint: "Internal users · sign in with your employee ID." },
];

const InputRow = ({ icon: Icon, type = 'text', value, onChange, placeholder, autoComplete, autoFocus, rightAdornment }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    border: '1px solid var(--border-color)', borderRadius: 10,
    background: 'var(--bg-surface)',
    padding: '0 12px',
  }}>
    <Icon style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      style={{
        flex: 1, border: 'none', outline: 'none', padding: '12px 0',
        background: 'transparent', color: 'var(--text-main)', fontSize: '0.95rem',
        fontFamily: 'inherit',
      }}
    />
    {rightAdornment}
  </div>
);

const Login = ({ mode = 'login' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup } = useAuth();

  const isSignup = mode === 'signup';
  // Public signup is employees only — admin accounts are minted by an
  // existing admin from the Employees page. Default the role accordingly
  // so an employee can't accidentally land on the Admin tab.
  const [role, setRole]           = useState(isSignup ? 'user' : 'admin');
  const [identifier, setId]       = useState('');
  const [email, setEmail]         = useState('');
  const [name, setName]           = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [info, setInfo]           = useState('');     // green "pending approval" / success notes

  // Where to send the user once authenticated — honour the ?from= path the
  // ProtectedRoute set when it redirected them here.
  const redirectTo = location.state?.from || '/';

  // On signup, only the Employee role is selectable from the public UI.
  // Login keeps both tabs — a real admin still needs the admin tab to sign in.
  const visibleRoles = isSignup ? ROLES.filter(r => r.id === 'user') : ROLES;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');

    if (isSignup) {
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters.'); return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.'); return;
      }
      setSubmitting(true);
      const payload = role === 'admin'
        ? { role, name, email, password }
        : { role, name, employee_id: identifier, email, password };
      const res = await signup(payload);
      setSubmitting(false);
      if (!res.ok) { setError(res.message || 'Sign-up failed.'); return; }
      // Employee signup is now a pending request — the backend returns no
      // token until an admin approves. Show the message instead of routing
      // into the dashboard (the user has no session to enter it with).
      if (res.pending_approval || !res.token) {
        setInfo(res.message || 'Account created. Please wait for an admin to approve your access.');
        return;
      }
      navigate(redirectTo, { replace: true });
      return;
    }

    // Login flow.
    if (!identifier && role === 'admin') {
      setError('Please enter your email address.'); return;
    }
    if (!identifier && role === 'user') {
      setError('Please enter your employee ID.'); return;
    }
    setSubmitting(true);
    const res = await login({ role, identifier, password });
    setSubmitting(false);
    if (!res.ok) {
      // Specific copy when the backend returns the approval-gate error so
      // the employee understands their account exists but isn't live yet.
      if (res.code === 'pending_approval') {
        setInfo(res.message || 'Your account is pending admin approval.');
      } else {
        setError(res.message || 'Login failed.');
      }
      return;
    }
    navigate(redirectTo, { replace: true });
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'grid',
      // On wide screens we show the hero on the left; on narrower viewports
      // we collapse to a single column so the form gets the full width and
      // the page scrolls naturally.
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 480px)',
      background: 'var(--bg-main)', color: 'var(--text-main)',
    }}
    // Inline media query via the ResizeObserver wouldn't be readable here —
    // we use plain CSS in App.css instead via this class.
    className="login-layout"
    >
      {/* ── Hero side ── */}
      <div className="login-hero" style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
        color: '#fff', padding: '64px 56px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontWeight: 800, fontSize: '1.5rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'rgba(255,255,255,0.18)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem',
            backdropFilter: 'blur(8px)',
          }}>G</div>
          SmartStaff
        </div>

        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: '2.4rem', lineHeight: 1.15, marginBottom: 14, fontWeight: 800, letterSpacing: '-0.02em' }}>
            The AI co-pilot for modern recruiting.
          </h1>
          <p style={{ opacity: 0.92, fontSize: '1.02rem', lineHeight: 1.55 }}>
            Screen resumes in seconds, run proctored online assessments, and have an
            Indian-accent AI conduct the L1 interview — all from one dashboard.
          </p>

          <ul style={{ marginTop: 28, paddingLeft: 18, lineHeight: 1.8, opacity: 0.94, fontSize: '0.95rem' }}>
            <li>Deterministic skill-match scoring · no LLM hallucinations</li>
            <li>Multi-level (L1 / L2 / L3) proctored online assessments</li>
            <li>Twilio outbound voice interviews with PDF scorecards</li>
            <li>Full JD workflow with system-generated JD numbers</li>
          </ul>
        </div>

        <div style={{ opacity: 0.7, fontSize: '0.82rem' }}>
          © {new Date().getFullYear()} SmartStaff · HR Automation Suite
        </div>
      </div>

      {/* ── Form side ── */}
      {/* Scroll lives here, not the outer grid — that way the form can grow
          past the viewport (long errors, sign-up with extra fields) without
          getting clipped. `justifyContent: flex-start` plus a top padding
          keeps it visually anchored near the top instead of floating in the
          middle of a tall page. */}
      <div className="login-form-pane" style={{
        padding: '56px 48px',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-start',
        overflowY: 'auto',
        maxHeight: '100vh',
        width: '100%',
      }}>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h2>
          <p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.93rem' }}>
            {isSignup
              ? 'Sign up to access the SmartStaff hiring suite.'
              : 'Sign in to continue to your dashboard.'}
          </p>
        </div>

        {/* Role picker — same in login and signup */}
        <div role="tablist" style={{
          display: 'grid',
          gridTemplateColumns: visibleRoles.length > 1 ? '1fr 1fr' : '1fr',
          gap: 10, marginBottom: 18,
        }}>
          {visibleRoles.map(({ id, label, icon: Icon }) => {
            const active = role === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRole(id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 14px', borderRadius: 10, fontWeight: 600, fontSize: '0.92rem',
                  cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${active ? 'var(--primary, #4f46e5)' : 'var(--border-color)'}`,
                  background: active ? 'rgba(79,70,229,0.08)' : 'var(--bg-surface)',
                  color: active ? 'var(--primary, #4f46e5)' : 'var(--text-main)',
                }}
              >
                <Icon /> {label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 18 }}>
          {ROLES.find(r => r.id === role)?.hint}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isSignup && (
            <>
              <InputRow
                icon={FiUser} value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name" autoComplete="name" autoFocus
              />
              {role === 'admin' ? (
                <InputRow
                  icon={FiMail} type="email" value={identifier || email}
                  onChange={(e) => { setEmail(e.target.value); setId(e.target.value); }}
                  placeholder="Work email" autoComplete="email"
                />
              ) : (
                <>
                  <InputRow
                    icon={FiHash} value={identifier}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="Employee ID (e.g. EMP1024)" autoComplete="username"
                  />
                  <InputRow
                    icon={FiMail} type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional)" autoComplete="email"
                  />
                </>
              )}
            </>
          )}

          {!isSignup && (
            role === 'admin' ? (
              <InputRow
                icon={FiMail} type="email" value={identifier}
                onChange={(e) => setId(e.target.value)}
                placeholder="Work email" autoComplete="email" autoFocus
              />
            ) : (
              <InputRow
                icon={FiHash} value={identifier}
                onChange={(e) => setId(e.target.value)}
                placeholder="Employee ID" autoComplete="username" autoFocus
              />
            )
          )}

          <InputRow
            icon={FiLock} type={showPwd ? 'text' : 'password'} value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignup ? 'Create a password (min 6 characters)' : 'Password'}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? <FiEyeOff /> : <FiEye />}
              </button>
            }
          />

          {isSignup && (
            <InputRow
              icon={FiLock} type={showPwd ? 'text' : 'password'} value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password" autoComplete="new-password"
            />
          )}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#991b1b', fontSize: '0.86rem',
            }}>
              <FiAlertCircle /> {error}
            </div>
          )}
          {info && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.35)',
              color: '#065f46', fontSize: '0.86rem', lineHeight: 1.45,
            }}>
              <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /> {info}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
            style={{
              marginTop: 4, padding: '12px 18px', fontSize: '0.96rem', fontWeight: 700,
              opacity: submitting ? 0.65 : 1, cursor: submitting ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isSignup ? <FiUserPlus /> : <FiLogIn />}
            {submitting
              ? (isSignup ? 'Creating account…' : 'Signing in…')
              : (isSignup ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <div style={{ marginTop: 22, fontSize: '0.88rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          {isSignup ? (
            <>Already have an account? <Link to="/login" style={{ color: 'var(--primary, #4f46e5)', fontWeight: 600 }}>Sign in</Link></>
          ) : (
            <>New here? <Link to="/signup" style={{ color: 'var(--primary, #4f46e5)', fontWeight: 600 }}>Create an account</Link></>
          )}
        </div>

        {!isSignup && (
          <div style={{
            marginTop: 28, padding: '12px 14px', borderRadius: 10,
            background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.18)',
            fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55,
          }}>
            <strong style={{ color: 'var(--text-main)' }}>Demo admin:</strong>{' '}
            <code>admin@geeky.ai</code> / <code>admin123</code> — change in production.
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
