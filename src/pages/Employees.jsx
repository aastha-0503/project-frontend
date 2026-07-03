// Admin-only page: list every employee (and admin) registered in the auth
// store, with last-seen / last-login timestamps so the admin can see who is
// currently using the app. The same page also lets an admin mint another
// admin account — public signup is users-only, so this is the only path to
// add admins after the initial seeded one.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  FiUsers, FiShield, FiUser, FiRefreshCw, FiSearch, FiUserPlus,
  FiMail, FiAlertCircle, FiCheckCircle, FiHash, FiX, FiClock,
  FiCalendar, FiBriefcase, FiSlash,
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
  const [jdsByOwner, setJdsByOwner] = useState({});   // ownerId -> count

  // New-admin form state.
  const [showAdd, setShowAdd]   = useState(false);
  const [aName, setAName]       = useState('');
  const [aEmail, setAEmail]     = useState('');
  const [aPass, setAPass]       = useState('');
  const [adding, setAdding]     = useState(false);
  const [addError, setAddError] = useState('');
  const [addOk, setAddOk]       = useState('');

  // New-employee form state. Employees created here by the admin are
  // auto-approved (no waiting in the approval queue).
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [eName,  setEName]   = useState('');
  const [eEmpId, setEEmpId]  = useState('');
  const [eEmail, setEEmail]  = useState('');
  const [ePass,  setEPass]   = useState('');
  const [addingEmp, setAddingEmp]   = useState(false);
  const [addEmpError, setAddEmpError] = useState('');
  const [addEmpOk,    setAddEmpOk]    = useState('');

  // Approval action busy-state (keyed by employee_id).
  const [busyApprovals, setBusyApprovals] = useState({});

  // Details modal — which account is selected.
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [accRes, jobsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/auth/accounts`),
        axios.get(`${API_BASE}/api/jobs`).catch(() => ({ data: { jobs: [] } })),
      ]);
      setAdmins(accRes.data?.admins || []);
      setUsers(accRes.data?.users || []);
      // Tally JDs per owner so the table shows "X JDs uploaded" per employee.
      const counts = {};
      (jobsRes.data?.jobs || []).forEach(j => {
        const k = (j.owner_id || '').toLowerCase();
        if (!k) return;
        counts[k] = (counts[k] || 0) + 1;
      });
      setJdsByOwner(counts);
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

  const addEmployee = async (e) => {
    e.preventDefault();
    setAddEmpError(''); setAddEmpOk('');
    if (!eEmpId || !ePass) { setAddEmpError('Employee ID and password are required.'); return; }
    if (ePass.length < 6)  { setAddEmpError('Password must be at least 6 characters.'); return; }
    setAddingEmp(true);
    try {
      // Admins creating employees here bypass the approval queue (the
      // backend reads our admin token and auto-approves).
      const res = await axios.post(`${API_BASE}/api/auth/signup`, {
        role: 'user', name: eName, employee_id: eEmpId, email: eEmail, password: ePass,
      });
      if (res.data?.ok) {
        setAddEmpOk(`Employee "${eEmpId}" created and approved.`);
        setEName(''); setEEmpId(''); setEEmail(''); setEPass('');
        load();
      } else {
        setAddEmpError(res.data?.message || 'Could not create employee.');
      }
    } catch (e2) {
      setAddEmpError(e2?.response?.data?.message || 'Could not create employee.');
    } finally {
      setAddingEmp(false);
    }
  };

  const setApproval = async (employee_id, approved) => {
    setBusyApprovals(b => ({ ...b, [employee_id]: true }));
    try {
      await axios.post(`${API_BASE}/api/auth/approve`, { employee_id, approved });
      load();
      // Reflect immediately on the open details modal, if any.
      setSelected(s => (s && s.employee_id === employee_id ? { ...s, approved } : s));
    } catch (e2) {
      alert(e2?.response?.data?.message || 'Could not update approval.');
    } finally {
      setBusyApprovals(b => { const n = { ...b }; delete n[employee_id]; return n; });
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={load} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiRefreshCw /> Refresh
          </button>
          <button onClick={() => { setShowAddEmp(s => !s); setShowAdd(false); }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiUserPlus /> {showAddEmp ? 'Close' : 'Add employee'}
          </button>
          <button onClick={() => { setShowAdd(s => !s); setShowAddEmp(false); }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

      {showAddEmp && (
        <form onSubmit={addEmployee} style={{
          border: '1px solid var(--border-color)', borderRadius: 12, padding: 16,
          background: 'var(--bg-surface)', marginBottom: 20,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10,
        }}>
          <input value={eName} onChange={e => setEName(e.target.value)} placeholder="Full name" className="input" style={inputStyle} />
          <input value={eEmpId} onChange={e => setEEmpId(e.target.value)} placeholder="Employee ID (e.g. EMP1024)" className="input" style={inputStyle} />
          <input value={eEmail} onChange={e => setEEmail(e.target.value)} placeholder="Email (optional)" type="email" className="input" style={inputStyle} />
          <input value={ePass} onChange={e => setEPass(e.target.value)} placeholder="Password (min 6)" type="password" className="input" style={inputStyle} />
          <button type="submit" disabled={addingEmp} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <FiUser /> {addingEmp ? 'Creating…' : 'Create employee'}
          </button>
          <div style={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Employees created here are auto-approved — no signup queue. To require approval, ask the employee to sign up themselves.
          </div>
          {addEmpError && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, color: '#991b1b', fontSize: '0.85rem' }}>
              <FiAlertCircle /> {addEmpError}
            </div>
          )}
          {addEmpOk && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, color: '#065f46', fontSize: '0.85rem' }}>
              <FiCheckCircle /> {addEmpOk}
            </div>
          )}
        </form>
      )}

      {/* ── Pending approval banner ──────────────────────────────────── */}
      {(() => {
        const pendingList = users.filter(u => u.approved === false);
        if (pendingList.length === 0) return null;
        return (
          <div style={{
            border: '1px solid rgba(245,158,11,0.4)',
            background: 'rgba(245,158,11,0.10)',
            color: '#854d0e',
            borderRadius: 12, padding: '12px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <FiClock /> {pendingList.length} employee{pendingList.length === 1 ? '' : 's'} waiting for approval
            </div>
            <div style={{ fontSize: '0.82rem' }}>
              Review them in the Employees table below — pending rows have ✓ Approve / ✕ Reject buttons.
            </div>
          </div>
        );
      })()}

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

      <Section
        title="Employees" icon={<FiUser />} rows={filtered} loading={loading}
        emptyHint={filter ? 'No matches.' : 'No employees have signed up yet.'}
        jdsByOwner={jdsByOwner}
        onSelect={setSelected}
        onApprove={setApproval}
        busyApprovals={busyApprovals}
        showApproval
      />

      <div style={{ height: 24 }} />

      <Section
        title="Admins" icon={<FiShield />} rows={admins} loading={loading}
        emptyHint="No admin accounts." identifierKey="email"
        jdsByOwner={jdsByOwner}
        onSelect={setSelected}
      />

      {selected && (
        <AccountDetails
          account={selected}
          onClose={() => setSelected(null)}
          onApprove={setApproval}
          busy={!!busyApprovals[selected.employee_id]}
          jdsByOwner={jdsByOwner}
        />
      )}
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

const Section = ({
  title, icon, rows, loading, emptyHint,
  identifierKey = 'employee_id',
  jdsByOwner = {},
  onSelect = () => {},
  onApprove,
  busyApprovals = {},
  showApproval = false,
}) => (
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
            <th style={th}>JDs uploaded</th>
            <th style={th}>Last seen</th>
            <th style={th}>Last login</th>
            {showApproval && <th style={th}>Approval</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const online = isOnline(r.last_seen_at);
            const ownerKey = ((r[identifierKey] || r.email || '') + '').toLowerCase();
            const jdCount = jdsByOwner[ownerKey] || 0;
            // Grandfathered accounts (created before the approval workflow)
            // have approved=true via the backend's _public_account shim.
            const isPending = r.approved === false;
            const busy = !!busyApprovals[r.employee_id];
            return (
              <tr
                key={(r[identifierKey] || r.email || i) + ''}
                style={{
                  borderTop: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  background: isPending ? 'rgba(245,158,11,0.06)' : undefined,
                  transition: 'background 0.15s',
                }}
                onClick={() => onSelect(r)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isPending ? 'rgba(245,158,11,0.06)' : ''; }}
              >
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
                <td style={td}>
                  {jdCount > 0 ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 999,
                      background: 'rgba(79,70,229,0.10)', color: 'var(--primary, #4f46e5)',
                      fontWeight: 600, fontSize: '0.82rem',
                    }}>
                      {jdCount}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>0</span>
                  )}
                </td>
                <td style={td}>{relativeTime(r.last_seen_at) || <span style={{ color: 'var(--text-muted)' }}>never</span>}</td>
                <td style={td}>{relativeTime(r.last_login_at) || <span style={{ color: 'var(--text-muted)' }}>never</span>}</td>
                {showApproval && (
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    {isPending ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => onApprove(r.employee_id, true)}
                          disabled={busy}
                          title="Approve this employee"
                          style={btnApprove}
                        >
                          <FiCheckCircle size={12} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onApprove(r.employee_id, false)}
                          disabled={busy}
                          title="Keep blocked"
                          style={btnReject}
                        >
                          <FiX size={12} /> Reject
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          color: '#059669', fontSize: '0.82rem', fontWeight: 600,
                        }}>
                          <FiCheckCircle size={12} /> Approved
                        </span>
                        <button
                          type="button"
                          onClick={() => onApprove(r.employee_id, false)}
                          disabled={busy}
                          title="Revoke access"
                          style={btnRevoke}
                        >
                          <FiSlash size={11} /> Revoke
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </div>
);

const btnBase = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 9px', borderRadius: 8,
  fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
  border: '1px solid transparent', fontFamily: 'inherit',
};
const btnApprove = { ...btnBase, background: '#10b981', color: '#fff' };
const btnReject  = { ...btnBase, background: '#fff', color: '#991b1b', borderColor: '#fecaca' };
const btnRevoke  = { ...btnBase, background: '#fff', color: '#854d0e', borderColor: '#fde68a' };

const AccountDetails = ({ account, onClose, onApprove, busy, jdsByOwner = {} }) => {
  const isUser = account.role === 'user';
  const isPending = account.approved === false;
  const ownerKey = ((account.employee_id || account.email || '') + '').toLowerCase();
  const jdCount = jdsByOwner[ownerKey] || 0;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', color: 'var(--text-main)',
          borderRadius: 14, maxWidth: 520, width: '100%',
          boxShadow: '0 20px 60px rgba(15,23,42,0.30)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: isUser
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'linear-gradient(135deg, #4f46e5, #06b6d4)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '1.1rem', flexShrink: 0,
            }}>
              {(account.name || account.email || account.employee_id || '?').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{account.name || '—'}</div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {isUser ? <FiUser size={11} /> : <FiShield size={11} />}
                {isUser ? `Employee · ${account.employee_id}` : 'Admin'}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 6,
          }} aria-label="Close"><FiX /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DetailRow icon={<FiMail />}     label="Email"          value={account.email || '—'} />
          <DetailRow icon={<FiHash />}     label="Employee ID"    value={account.employee_id || '—'} />
          <DetailRow icon={<FiCalendar />} label="Created"        value={account.created_at ? new Date(account.created_at).toLocaleString() : '—'} />
          <DetailRow icon={<FiClock />}    label="Last login"     value={account.last_login_at ? `${new Date(account.last_login_at).toLocaleString()} · ${relativeTime(account.last_login_at)}` : 'Never'} />
          <DetailRow icon={<FiClock />}    label="Last seen"      value={account.last_seen_at ? `${new Date(account.last_seen_at).toLocaleString()} · ${relativeTime(account.last_seen_at)}` : 'Never'} />
          <DetailRow icon={<FiBriefcase />} label="JDs uploaded"  value={String(jdCount)} />
          {isUser && (
            <DetailRow
              icon={isPending ? <FiClock /> : <FiCheckCircle />}
              label="Approval status"
              value={
                isPending
                  ? 'Pending admin approval'
                  : `Approved${account.approved_at ? ' · ' + relativeTime(account.approved_at) : ''}${account.approved_by ? ' by ' + account.approved_by : ''}`
              }
            />
          )}
        </div>

        {isUser && (
          <div style={{
            padding: '14px 22px', borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-subtle)',
            display: 'flex', gap: 8, justifyContent: 'flex-end',
          }}>
            {isPending ? (
              <>
                <button type="button" onClick={() => onApprove(account.employee_id, false)} disabled={busy} style={{ ...btnReject, padding: '8px 14px', fontSize: '0.86rem' }}>
                  <FiX /> Reject
                </button>
                <button type="button" onClick={() => onApprove(account.employee_id, true)} disabled={busy} style={{ ...btnApprove, padding: '8px 14px', fontSize: '0.86rem' }}>
                  <FiCheckCircle /> Approve
                </button>
              </>
            ) : (
              <button type="button" onClick={() => onApprove(account.employee_id, false)} disabled={busy} style={{ ...btnRevoke, padding: '8px 14px', fontSize: '0.86rem' }}>
                <FiSlash /> Revoke access
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const DetailRow = ({ icon, label, value }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'baseline' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
      {icon} {label}
    </div>
    <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', wordBreak: 'break-word' }}>{value}</div>
  </div>
);

const th = { padding: '10px 14px', fontWeight: 600 };
const td = { padding: '10px 14px', verticalAlign: 'middle' };

export default Employees;
