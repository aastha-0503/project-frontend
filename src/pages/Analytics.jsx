import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  FiBarChart2, FiTarget, FiAward, FiUsers, FiCheckCircle, FiActivity,
  FiFileText, FiClock
} from 'react-icons/fi';
import {
  API_BASE, getActiveJobId, INTERVIEW_THRESHOLD, ASSESSMENT_PASS_PERCENT,
  loadCandidateState, getStage, STAGES, relativeTime
} from '../lib/enterprise.js';
import { Donut, Funnel, Histogram, HorizontalBars, Sparkline } from '../components/Charts.jsx';

const readChats = () => {
  try { return JSON.parse(localStorage.getItem('geeky_ai_chats') || '[]'); } catch { return []; }
};

const Analytics = () => {
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
          axios.get(`${API_BASE}/api/activity/${getActiveJobId()}?limit=50`),
        ]);
        setSubmissions(subs.data.submissions || []);
        setActivity(act.data.activity || []);
      } catch {}
    };
    load();
  }, []);

  // ---- aggregate from chats/submissions ----
  const allCandidates = useMemo(() => {
    const seen = new Map();
    chats.forEach(c => (c.messages || []).forEach(m => (m.tableData || []).forEach(row => {
      seen.set(row.File_Name || row.Candidate_Name, row);
    })));
    return Array.from(seen.values());
  }, [chats]);

  const total = allCandidates.length;
  const shortlisted = allCandidates.filter(c => (Number(c.Fit_Score_Out_Of_100) || 0) >= INTERVIEW_THRESHOLD).length;
  const tested = submissions.length;
  const passed = submissions.filter(s => s.passed).length;

  const avgFit = total
    ? Math.round(allCandidates.reduce((a, c) => a + (Number(c.Fit_Score_Out_Of_100) || 0), 0) / total)
    : 0;

  // Score-histogram buckets
  const buckets = [
    { range: [0, 19], label: '0–19' },
    { range: [20, 39], label: '20–39' },
    { range: [40, 59], label: '40–59' },
    { range: [60, 79], label: '60–79' },
    { range: [80, 100], label: '80–100' },
  ].map(b => {
    const count = allCandidates.filter(c => {
      const s = Number(c.Fit_Score_Out_Of_100) || 0;
      return s >= b.range[0] && s <= b.range[1];
    }).length;
    const tone = b.range[0] >= 70 ? 'ok' : b.range[0] >= 50 ? 'warn' : 'dim';
    return { label: b.label, count, tone };
  });

  // Top in-demand skills (across JD critical lists pulled from chats)
  const skillCounts = useMemo(() => {
    const counts = {};
    allCandidates.forEach(c => {
      (c.Key_Strengths || '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
        counts[s] = (counts[s] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));
  }, [allCandidates]);

  // Pipeline distribution
  const stageBars = STAGES.map(st => ({
    label: st.label,
    value: allCandidates.filter(c => getStage(candidateState, c, 'new') === st.key).length,
    color: undefined,
  })).filter(b => b.value > 0);

  // Recent screening trend (last 7 days)
  const sparkValues = useMemo(() => {
    const days = 7;
    const counts = Array(days).fill(0);
    const now = new Date();
    activity.forEach(a => {
      if (a.kind !== 'screening' && a.kind !== 'submission') return;
      const t = new Date(a.at);
      const diff = Math.floor((now - t) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < days) counts[days - 1 - diff] += 1;
    });
    return counts;
  }, [activity]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p className="subtitle">Real-time hiring funnel and skill insights pulled from your screening data.</p>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid-3">
        <div className="stat-card">
          <div className="stat-icon"><FiUsers /></div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div className="stat-value">{total}</div>
            <Sparkline values={sparkValues} />
          </div>
          <div className="stat-label">Candidates in pipeline</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><FiCheckCircle /></div>
          <div className="stat-value">{shortlisted}</div>
          <div className="stat-label">Shortlisted (≥ {INTERVIEW_THRESHOLD})</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent)' }}><FiAward /></div>
          <div className="stat-value">{tested}</div>
          <div className="stat-label">Assessments completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-soft)', color: '#854d0e' }}><FiTarget /></div>
          <div className="stat-value">{avgFit}</div>
          <div className="stat-label">Average fit score</div>
        </div>
      </div>

      {/* Funnel + Pass rate donut */}
      <div className="grid-2">
        <div className="chart-card">
          <h3 className="chart-title">Hiring funnel</h3>
          <p className="chart-subtitle">From applicants through to qualified candidates.</p>
          <Funnel data={[
            { label: 'Total applicants', value: total },
            { label: 'Shortlisted',      value: shortlisted },
            { label: 'Took assessment',  value: tested },
            { label: 'Qualified',        value: passed },
          ]} />
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Assessment pass rate</h3>
          <p className="chart-subtitle">
            Candidates scoring {ASSESSMENT_PASS_PERCENT}% or higher on the online test.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Donut
              value={tested > 0 ? Math.round((passed / tested) * 100) : 0}
              max={100}
              label={tested > 0 ? `${Math.round((passed / tested) * 100)}%` : '—'}
              sublabel={`${passed} of ${tested}`}
              color="var(--success)"
            />
            <div style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div><strong style={{ color: 'var(--success)' }}>● {passed} qualified</strong> out of {tested} attempts.</div>
              <div style={{ marginTop: 6 }}>Pass mark: {ASSESSMENT_PASS_PERCENT}% or higher.</div>
              <div style={{ marginTop: 6 }}>Conversion (total → qualified): <strong>{total ? Math.round((passed / total) * 100) : 0}%</strong>.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Score distribution + Skill demand */}
      <div className="grid-2">
        <div className="chart-card">
          <h3 className="chart-title">Fit score distribution</h3>
          <p className="chart-subtitle">How candidates score against the active JD.</p>
          <Histogram buckets={buckets} />
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Most-matched skills</h3>
          <p className="chart-subtitle">Skills that the most candidates demonstrate.</p>
          {skillCounts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '20px 0' }}>
              No skill data yet — run a screening first.
            </div>
          ) : (
            <HorizontalBars items={skillCounts} />
          )}
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="chart-card">
        <h3 className="chart-title">Pipeline distribution</h3>
        <p className="chart-subtitle">Current stage of every screened candidate.</p>
        {stageBars.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            No stages assigned yet. Move candidates through the pipeline from the Candidates page.
          </div>
        ) : (
          <HorizontalBars items={stageBars} />
        )}
      </div>

      {/* Activity timeline */}
      <div className="chart-card">
        <h3 className="chart-title">Recent activity</h3>
        <p className="chart-subtitle">Everything that's happened in this workspace, newest first.</p>
        {activity.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No activity recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
            {activity.map((a, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '10px 0',
                borderBottom: '1px solid var(--border-color)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {a.kind === 'jd' ? <FiFileText /> :
                   a.kind === 'resumes' ? <FiUsers /> :
                   a.kind === 'screening' ? <FiTarget /> :
                   a.kind === 'submission' ? <FiAward /> : <FiActivity />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{a.message}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FiClock size={11} /> {relativeTime(a.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
