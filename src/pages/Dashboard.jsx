import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  FiUsers, FiFileText, FiCheckCircle, FiTrendingUp,
  FiMic, FiDownload, FiArrowRight, FiClock, FiAward,
  FiTarget, FiBarChart2, FiActivity, FiBriefcase, FiMail, FiUserCheck,
} from 'react-icons/fi';
import {
  API_BASE, getActiveJobId, INTERVIEW_THRESHOLD,
  loadCandidateState, getStage, STAGES, relativeTime
} from '../lib/enterprise.js';
import { Donut, Sparkline, Funnel } from '../components/Charts.jsx';

const readChats = () => {
  try { return JSON.parse(localStorage.getItem('geeky_ai_chats') || '[]'); } catch { return []; }
};

const Dashboard = () => {
  const [chats, setChats] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [activity, setActivity] = useState([]);
  const candidateState = useMemo(() => loadCandidateState(), []);

  useEffect(() => { setChats(readChats()); }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [subs, act] = await Promise.all([
          axios.get(`${API_BASE}/api/assessment/submissions/${getActiveJobId()}`),
          axios.get(`${API_BASE}/api/activity/${getActiveJobId()}?limit=30`),
        ]);
        setSubmissions(subs.data.submissions || []);
        setActivity(act.data.activity || []);
      } catch {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const allCandidates = useMemo(() => {
    const seen = new Map();
    chats.forEach(c => (c.messages || []).forEach(m => (m.tableData || []).forEach(row => {
      seen.set(row.File_Name || row.Candidate_Name, row);
    })));
    return Array.from(seen.values());
  }, [chats]);

  const totalScreened = allCandidates.length;
  const shortlisted = allCandidates.filter(c => (Number(c.Fit_Score_Out_Of_100) || 0) >= INTERVIEW_THRESHOLD).length;
  const tested = submissions.length;
  const passed = submissions.filter(s => s.passed).length;

  const avgScore = totalScreened
    ? Math.round(allCandidates.reduce((a, c) => a + (Number(c.Fit_Score_Out_Of_100) || 0), 0) / totalScreened)
    : 0;

  const sparkValues = useMemo(() => {
    const days = 7;
    const counts = Array(days).fill(0);
    const now = new Date();
    activity.forEach(a => {
      if (a.kind === 'screening' || a.kind === 'submission') {
        const t = new Date(a.at);
        const diff = Math.floor((now - t) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < days) counts[days - 1 - diff] += 1;
      }
    });
    return counts;
  }, [activity]);

  const stageCounts = useMemo(() => {
    const map = {};
    allCandidates.forEach(c => {
      const s = getStage(candidateState, c);
      map[s] = (map[s] || 0) + 1;
    });
    return map;
  }, [allCandidates, candidateState]);

  const recentSessions = chats.slice(0, 4);

  // ─────────────────────────────────────────────────────────────────────────
  // Workflow stepper — top-of-dashboard, makes the hiring sequence explicit.
  // Each step turns "complete" when the user has actually done that action,
  // so it doubles as a progress map across the whole product.
  // ─────────────────────────────────────────────────────────────────────────
  const jdCount = chats.filter(c => c.job_id && c.jd_title).length;
  const invitesReady = shortlisted; // anyone at or above the threshold
  const workflowSteps = [
    {
      n: 1, key: 'jd', title: 'Upload Job Description', to: '/screening',
      desc: 'Drop a PDF/Word JD and Geeky AI extracts the required skills.',
      icon: FiFileText, done: jdCount > 0,
      metric: jdCount > 0 ? `${jdCount} JD${jdCount === 1 ? '' : 's'} on file` : 'Not started',
    },
    {
      n: 2, key: 'screen', title: 'Screen Resumes', to: '/screening',
      desc: 'Upload candidate resumes and rank them by deterministic fit score.',
      icon: FiUsers, done: totalScreened > 0,
      metric: totalScreened > 0 ? `${totalScreened} screened · avg ${avgScore}` : 'Not started',
    },
    {
      n: 3, key: 'review', title: 'Review Candidates', to: '/candidates',
      desc: `${INTERVIEW_THRESHOLD}+ score gets an interview invite, below gets a polite rejection.`,
      icon: FiUserCheck, done: invitesReady > 0,
      metric: invitesReady > 0 ? `${invitesReady} ready to invite` : 'Awaiting screening',
    },
    {
      n: 4, key: 'send', title: 'Send Assessment', to: '/candidates',
      desc: 'Pick proficiency level (auto-recommended) and send the OA link.',
      icon: FiMail, done: tested > 0,
      metric: tested > 0 ? `${tested} assessments completed` : 'Awaiting send',
    },
    {
      n: 5, key: 'interview', title: 'AI Interview & Score',  to: '/candidates',
      desc: 'Geeky AI calls the candidate for an L1 interview with PDF scorecard.',
      icon: FiAward, done: passed > 0,
      metric: passed > 0 ? `${passed} qualified` : 'Awaiting results',
    },
  ];
  const currentStep = workflowSteps.findIndex(s => !s.done);
  // Once everything is done, currentStep is -1 — pin it to the last step so
  // the "you're here" marker still shows up somewhere sensible.
  const activeIdx = currentStep === -1 ? workflowSteps.length - 1 : currentStep;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Welcome back</h1>
          <p className="subtitle">Your AI hiring assistant has been busy. Here&apos;s the latest snapshot.</p>
        </div>
        <Link to="/screening" className="btn-primary"><FiMic /> Start voice session</Link>
      </div>

      {/* ── Workflow stepper ─────────────────────────────────────────── */}
      <div className="workflow-stepper" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius)',
        padding: '20px 22px',
        marginBottom: 22,
        boxShadow: '0 2px 6px rgba(15,23,42,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Hiring workflow
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: 2 }}>
              {currentStep === -1
                ? 'All five steps complete · ready for the next role'
                : `Step ${activeIdx + 1} of ${workflowSteps.length} · ${workflowSteps[activeIdx].title}`}
            </div>
          </div>
          <Link
            to={workflowSteps[activeIdx].to}
            className="btn-primary"
            style={{ padding: '8px 14px', fontSize: '0.86rem' }}
          >
            {currentStep === -1 ? 'Start new role' : `Continue · Step ${activeIdx + 1}`}
            <FiArrowRight />
          </Link>
        </div>

        <div className="workflow-track" style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${workflowSteps.length}, minmax(0, 1fr))`,
          gap: 10,
        }}>
          {workflowSteps.map((s, i) => {
            const isActive = i === activeIdx;
            const isDone   = s.done;
            const accent =
              isDone   ? 'var(--success, #10b981)'
            : isActive ? 'var(--primary, #4f46e5)'
            :            'var(--border-color)';
            const bg =
              isDone   ? 'rgba(16,185,129,0.08)'
            : isActive ? 'rgba(79,70,229,0.08)'
            :            'var(--bg-subtle, #f8fafc)';
            const Icon = s.icon;
            return (
              <Link
                key={s.key}
                to={s.to}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '14px 14px',
                  borderRadius: 12,
                  border: `2px solid ${accent}`,
                  background: bg,
                  textDecoration: 'none', color: 'inherit',
                  position: 'relative',
                  transition: 'all 0.15s',
                  minHeight: 110,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: isDone ? 'var(--success, #10b981)' : isActive ? 'var(--primary, #4f46e5)' : 'var(--bg-surface)',
                    color: (isDone || isActive) ? '#fff' : 'var(--text-muted)',
                    border: `2px solid ${accent}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.86rem',
                  }}>
                    {isDone ? <FiCheckCircle size={16} /> : s.n}
                  </div>
                  <Icon size={16} style={{ color: isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--text-muted)' }} />
                </div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)', marginTop: 2, lineHeight: 1.25 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4, flex: 1 }}>
                  {s.desc}
                </div>
                <div style={{
                  fontSize: '0.72rem', fontWeight: 600,
                  color: isDone ? 'var(--success, #10b981)' : isActive ? 'var(--primary, #4f46e5)' : 'var(--text-muted)',
                  marginTop: 2,
                }}>
                  {s.metric}
                </div>
                {isActive && currentStep !== -1 && (
                  <span style={{
                    position: 'absolute', top: -10, right: 12,
                    background: 'var(--primary, #4f46e5)', color: '#fff',
                    fontSize: '0.62rem', fontWeight: 700,
                    padding: '3px 10px', borderRadius: 999, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>
                    You are here
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Top stat cards with sparkline */}
      <div className="grid-3">
        <div className="stat-card">
          <div className="stat-icon"><FiFileText /></div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div className="stat-value">{totalScreened}</div>
            <Sparkline values={sparkValues} />
          </div>
          <div className="stat-label">Resumes screened</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
            <FiCheckCircle />
          </div>
          <div className="stat-value">{shortlisted}</div>
          <div className="stat-label">Shortlisted (≥ {INTERVIEW_THRESHOLD})</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent)' }}>
            <FiAward />
          </div>
          <div className="stat-value">{tested}</div>
          <div className="stat-label">Assessments completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#854d0e' }}>
            <FiTrendingUp />
          </div>
          <div className="stat-value">{avgScore}</div>
          <div className="stat-label">Average fit score</div>
        </div>
      </div>

      {/* Funnel + Pass-rate donut + Quick actions */}
      <div className="grid-2">
        <div className="chart-card">
          <h3 className="chart-title">Hiring funnel</h3>
          <p className="chart-subtitle">Where every candidate stands right now.</p>
          <Funnel data={[
            { label: 'Total applicants', value: totalScreened },
            { label: 'Shortlisted',      value: shortlisted },
            { label: 'Took assessment',  value: tested },
            { label: 'Qualified',        value: passed },
          ]} />
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
            <Link to="/analytics" className="btn-secondary" style={{ width: '100%' }}>
              <FiBarChart2 /> Explore full analytics
            </Link>
          </div>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Assessment pass rate</h3>
          <p className="chart-subtitle">Candidates clearing the {tested ? 50 : '—'}% qualifying mark.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Donut
              value={tested > 0 ? Math.round((passed / tested) * 100) : 0}
              label={tested > 0 ? `${Math.round((passed / tested) * 100)}%` : '—'}
              sublabel={`${passed} of ${tested}`}
              color="var(--success)"
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link to="/screening" className="action-btn" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiMic /> New session
                  </span>
                  <FiArrowRight />
                </Link>
                <a href={`${API_BASE}/api/download_report`} target="_blank" rel="noreferrer"
                   className="action-btn" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiDownload /> Download report
                  </span>
                  <FiArrowRight />
                </a>
                <Link to="/candidates" className="action-btn" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiUsers /> View candidates
                  </span>
                  <FiArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline + Recent sessions */}
      <div className="grid-2">
        <div className="chart-card">
          <h3 className="chart-title">Pipeline at a glance</h3>
          <p className="chart-subtitle">Candidate stage distribution.</p>
          {Object.keys(stageCounts).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No pipeline data yet. Move candidates through stages from the Candidates page.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STAGES.filter(s => stageCounts[s.key]).map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`stage-pill ${s.cls}`} style={{ pointerEvents: 'none' }}>
                    {s.label}
                  </span>
                  <div style={{ flex: 1, height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${(stageCounts[s.key] / Math.max(...Object.values(stageCounts))) * 100}%`,
                      height: '100%',
                      background: 'var(--primary)',
                      borderRadius: 4,
                      transition: 'width 0.4s',
                    }} />
                  </div>
                  <strong style={{ fontSize: '0.92rem', minWidth: 24, textAlign: 'right' }}>
                    {stageCounts[s.key]}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Recent activity</h3>
          <p className="chart-subtitle">The last few things that happened in this workspace.</p>
          {activity.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No activity yet. Upload a JD and start screening to populate this feed.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto' }}>
              {activity.slice(0, 8).map((a, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, padding: '8px 0',
                  borderBottom: i < 7 ? '1px solid var(--border-color)' : 'none',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--primary-soft)', color: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {a.kind === 'jd' ? <FiFileText size={14} /> :
                     a.kind === 'resumes' ? <FiUsers size={14} /> :
                     a.kind === 'screening' ? <FiTarget size={14} /> :
                     a.kind === 'submission' ? <FiAward size={14} /> : <FiActivity size={14} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{a.message}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {relativeTime(a.at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="card">
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600 }}>Recent sessions</h3>
          <p className="subtitle" style={{ marginBottom: 16 }}>Pick up where you left off.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentSessions.map(chat => {
              const msgCount = (chat.messages || []).length;
              return (
                <Link
                  key={chat.id}
                  to="/screening"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 'var(--radius)',
                    textDecoration: 'none', color: 'var(--text-main)',
                    border: '1px solid var(--border-color)', fontSize: '0.9rem',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FiClock color="var(--text-muted)" />
                    {chat.title || 'Session'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {msgCount} message{msgCount === 1 ? '' : 's'}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
