// Admin-only page: list every employee (and admin) registered in the auth
// store, with last-seen / last-login timestamps so the admin can see who is
// currently using the app. The same page also lets an admin mint another
// admin account — public signup is users-only, so this is the only path to
// add admins after the initial seeded one.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  FiUsers, FiShield, FiUser, FiRefreshCw, FiSearch, FiUserPlus,
  FiMail, FiAlertCircle, FiCheckCircle,
} from 'react-icons/fi';
import { API_BASE, relativeTime } from '../lib/enterprise.js';

// Anyone whose last_seen_at is within this many minutes is shown as "online".
// /api/auth/me is hit on every page load + mount, so for an active user the
// gap will rarely be more than a few seconds.
const ONLINE_WINDOW_MIN = 5;

const isOnline = (iso) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && (Date.now() - t) < ONLINE_WINDOW_MIN * 60 * 1000;
};

const Employees = () => {
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState('');
  const [admins,  setAdmins]    = useState([]);
  const [users,   setUsers]     = useState([]);
  const [filter,  setFilter]    = useState('');

  // New-admin form state.
  const [showAdd, setShowAdd]   = useState(false);
  const [aName, setAName]       = useState('');
  const [aEmail, setAEmail]     = useState('');
  const [aPass, setAPass]       = useState('');
  const [adding, setAdding]     = useState(false);
  const [addError, setAddError] = useState('');
  const [addOk, setAddOk]       = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${API_BASE}/api/auth/accounts`);
      setAdmins(res.data?.admins || []);
      setUsers(res.data?.users || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Light polling so the "online" dots update without manual refresh.
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.employee_id || '').toLowerCase().includes(q)
    );
  }, [users, filter]);

  const onlineCount = useMemo(
    () => users.filter(u => isOnline(u.last_seen_at)).length,
    [users]
  );

  const addAdmin = async (e) => {
    e.preventDefault();
    setAddError(''); setAddOk('');
    if (!aEmail || !aPass) { setAddError('Email and password are required.'); return; }
    if (aPass.length < 6)  { setAddError('Password must be at least 6 characters.'); return; }
    setAdding(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/signup`, {
        role: 'admin', name: aName, email: aEmail, password: aPass,
      });
      if (res.data?.ok) {
        setAddOk(`Admin "${aEmail}" created.`);
        setAName(''); setAEmail(''); setAPass('');
        load();
      } else {
        setAddError(res.data?.message || 'Could not create admin.');
      }
    } catch (e2) {
      setAddError(e2?.response?.data?.message || 'Could not create admin.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiUsers /> Employees & Admins
          </h1>
          <p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {users.length} employee{users.length === 1 ? '' : 's'} · {onlineCount} online · {admins.length} admin{admins.length === 1 ? '' : 's'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiRefreshCw /> Refresh
          </button>
          <button onClick={() => setShowAdd(s => !s)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiUserPlus /> {showAdd ? 'Close' : 'Add admin'}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={addAdmin} style={{
          border: '1px solid var(--border-color)', borderRadius: 12, padding: 16,
          background: 'var(--bg-surface)', marginBottom: 20,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10,
        }}>
          <input value={aName} onChange={e => setAName(e.target.value)} placeholder="Full name" className="input" style={inputStyle} />
          <input value={aEmail} onChange={e => setAEmail(e.target.value)} placeholder="Work email" type="email" className="input" style={inputStyle} />
          <input value={aPass} onChange={e => setAPass(e.target.value)} placeholder="Password (min 6)" type="password" className="input" style={inputStyle} />
          <button type="submit" disabled={adding} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <FiShield /> {adding ? 'Creating…' : 'Create admin'}
          </button>
          {addError && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, color: '#991b1b', fontSize: '0.85rem' }}>
              <FiAlertCircle /> {addError}
            </div>
          )}
          {addOk && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, color: '#065f46', fontSize: '0.85rem' }}>
              <FiCheckCircle /> {addOk}
            </div>
          )}
        </form>
      )}

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search by name, employee ID, or email…"
          style={{ ...inputStyle, paddingLeft: 36, width: '100%' }}
        />
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)',
          color: '#991b1b', marginBottom: 14, fontSize: '0.88rem',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <FiAlertCircle /> {error}
        </div>
      )}

      <Section title="Employees" icon={<FiUser />} rows={filtered} loading={loading} emptyHint={filter ? 'No matches.' : 'No employees have signed up yet.'} />

      <div style={{ height: 24 }} />

      <Section title="Admins" icon={<FiShield />} rows={admins} loading={loading} emptyHint="No admin accounts." identifierKey="email" />
    </div>
  );
};

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)',
  color: 'var(--text-main)',
  fontSize: '0.92rem',
  outline: 'none',
};

const Section = ({ title, icon, rows, loading, emptyHint, identifierKey = 'employee_id' }) => (
  <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-surface)' }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
      fontWeight: 600,
    }}>
      {icon} {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>({rows.length})</span>
    </div>
    {loading ? (
      <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading…</div>
    ) : rows.length === 0 ? (
      <div style={{ padding: 20, color: 'var(--text-muted)' }}>{emptyHint}</div>
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={th}>Status</th>
            <th style={th}>Name</th>
            <th style={th}>{identifierKey === 'email' ? 'Email' : 'Employee ID'}</th>
            <th style={th}>Email</th>
            <th style={th}>Last seen</th>
            <th style={th}>Last login</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const online = isOnline(r.last_seen_at);
            return (
              <tr key={(r[identifierKey] || r.email || i) + ''} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={td}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    color: online ? '#059669' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '0.82rem',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: online ? '#10b981' : '#cbd5e1',
                      boxShadow: online ? '0 0 0 3px rgba(16,185,129,0.18)' : 'none',
                    }} />
                    {online ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td style={td}>{r.name || '—'}</td>
                <td style={td}><code>{r[identifierKey] || '—'}</code></td>
                <td style={td}>
                  {r.email
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FiMail size={12} /> {r.email}</span>
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={td}>{relativeTime(r.last_seen_at) || <span style={{ color: 'var(--text-muted)' }}>never</span>}</td>
                <td style={td}>{relativeTime(r.last_login_at) || <span style={{ color: 'var(--text-muted)' }}>never</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </div>
);

const th = { padding: '10px 14px', fontWeight: 600 };
const td = { padding: '10px 14px', verticalAlign: 'middle' };

export default Employees;
