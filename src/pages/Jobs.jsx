import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiBriefcase, FiSearch, FiExternalLink, FiClipboard, FiCheckCircle,
  FiTrash2, FiArrowRight, FiX, FiUsers, FiAward, FiFileText, FiInfo,
} from 'react-icons/fi';
import {
  API_BASE, setActiveJobId, getActiveJobId, relativeTime,
} from '../lib/enterprise.js';

const JOBS_PER_PAGE = 25;

const Jobs = () => {
  const [jobs, setJobs]       = useState([]);
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail]   = useState(null);            // { ...full job }
  const [activeId, setActiveId] = useState(getActiveJobId());
  const navigate = useNavigate();

  const fetchJobs = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/jobs`);
      setJobs(res.data.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 12000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(j => {
      // JD number — match "23", "JD-23", "JD-0023", "0023"
      const numStr = j.jd_number_display || '';
      const justNum = String(j.jd_number || '');
      if (numStr.toLowerCase().includes(q)) return true;
      if (justNum.includes(q.replace(/^jd-?0*/i, ''))) return true;
      if ((j.jd_title || '').toLowerCase().includes(q)) return true;
      if ((j.role_title || '').toLowerCase().includes(q)) return true;
      if ((j.jd_filename || '').toLowerCase().includes(q)) return true;
      if ((j.skills || []).some(s => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [jobs, query]);

  const openDetail = async (job) => {
    try {
      const res = await axios.get(`${API_BASE}/api/jobs/${job.job_id}`);
      setDetail(res.data);
    } catch (e) {
      alert('Could not load JD details.');
    }
  };

  const switchToJob = (job) => {
    setActiveJobId(job.job_id);
    setActiveId(job.job_id);
  };

  const deleteJob = async (job) => {
    if (!confirm(`Delete ${job.jd_number_display || job.job_id}${job.jd_title ? ' — ' + job.jd_title : ''}? This removes all candidate data for this role.`)) return;
    try {
      await axios.delete(`${API_BASE}/api/jobs/${job.job_id}`);
      await fetchJobs();
      if (activeId === job.job_id) {
        setActiveJobId(null);
        setActiveId('');
      }
    } catch {
      alert('Could not delete.');
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Job Descriptions</h1>
          <p className="subtitle">
            Every JD you've uploaded — searchable by JD number, title, or skill. The newest 100 are kept (FIFO).
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/screening')}>
          <FiBriefcase /> Upload new JD
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <FiSearch color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search by JD number (e.g. JD-0042 or 42), title, filename, or any skill…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1, minWidth: 280,
              border: 'none', outline: 'none', fontSize: '0.95rem',
              fontFamily: 'inherit', background: 'transparent', color: 'var(--text-main)',
            }}
          />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {filtered.length} of {jobs.length} job{jobs.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="empty-state" style={{ padding: '40px 20px', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <div className="icon-wrap"><FiBriefcase /></div>
            <h3>No JDs uploaded yet</h3>
            <p>Head to Voice Screening to upload your first job description. Each one gets a unique JD number and its own assessment links.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon-wrap" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
              <FiInfo />
            </div>
            <h3>No matches for "{query}"</h3>
            <p>Try a different JD number, title, or skill.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="results-table" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 96 }}>JD #</th>
                  <th>Role / title</th>
                  <th style={{ textAlign: 'center', width: 90 }}>Skills</th>
                  <th style={{ textAlign: 'center', width: 110 }}>Candidates</th>
                  <th style={{ textAlign: 'center', width: 110 }}>Submissions</th>
                  <th style={{ width: 130 }}>Uploaded</th>
                  <th style={{ width: 280 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(job => {
                  const isActive = job.job_id === activeId;
                  return (
                    <tr key={job.job_id} style={{
                      background: isActive ? 'var(--primary-soft)' : undefined,
                    }}>
                      <td>
                        <div style={{
                          display: 'inline-block', padding: '4px 10px',
                          background: isActive ? 'var(--primary)' : 'var(--bg-subtle)',
                          color: isActive ? 'white' : 'var(--text-main)',
                          borderRadius: 'var(--radius-sm)', fontWeight: 700,
                          fontSize: '0.82rem', letterSpacing: '0.02em',
                          fontFamily: 'Consolas, Monaco, monospace',
                        }}>
                          {job.jd_number_display || '—'}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          {job.jd_title || job.role_title || '(untitled)'}
                          {isActive && (
                            <span style={{
                              marginLeft: 8, fontSize: '0.7rem', fontWeight: 700,
                              color: 'var(--primary)', textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}>
                              · active
                            </span>
                          )}
                        </div>
                        {job.jd_filename && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {job.jd_filename}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="summary-pill" style={{
                          padding: '3px 9px',
                          background: 'var(--primary-soft)',
                          color: 'var(--primary)',
                          fontSize: '0.78rem',
                        }}>
                          {job.skills_count}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.86rem', color: 'var(--text-muted)',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <FiUsers size={12} />
                          {job.interviews_count > 0 ? `${job.interviews_count} interview${job.interviews_count === 1 ? '' : 's'}` : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.86rem', color: 'var(--text-muted)',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <FiAward size={12} />
                          {job.submissions_count}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {job.created_at ? relativeTime(job.created_at) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn-secondary"
                                  style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                  onClick={() => openDetail(job)}>
                            <FiInfo /> Details
                          </button>
                          {!isActive && (
                            <button className="btn-secondary"
                                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                    onClick={() => switchToJob(job)}>
                              <FiArrowRight /> Set active
                            </button>
                          )}
                          {job.assessment_url && (
                            <button className="btn-secondary"
                                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                    onClick={() => copyLink(job.assessment_url)}
                                    title="Copy assessment link">
                              <FiClipboard /> Copy link
                            </button>
                          )}
                          <button className="btn-secondary"
                                  style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'var(--danger)' }}
                                  onClick={() => deleteJob(job)}
                                  title="Delete this JD">
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JobDetailModal data={detail} onClose={() => setDetail(null)} />
    </div>
  );
};

const JobDetailModal = ({ data, onClose }) => {
  if (!data) return null;
  const struct = data.jd_struct || {};
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <h2>
            <FiFileText color="var(--primary)" />
            {data.jd_number_display}
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>
              · {data.jd_title}
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 8,
            padding: '12px 16px', background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius)', marginBottom: 14, fontSize: '0.86rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Uploaded</span>
            <span>{data.created_at ? new Date(data.created_at).toLocaleString() : '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Filename</span>
            <span>{data.jd_filename || '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Experience</span>
            <span>{struct.experience_min_years ?? '?'} – {struct.experience_max_years ?? '?'} yrs</span>
            <span style={{ color: 'var(--text-muted)' }}>Domains</span>
            <span>{(struct.preferred_domains || []).join(', ') || '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Candidates</span>
            <span>{(data.candidates || []).length} screened · {(data.submissions || []).length} submissions · {(data.interviews || []).length} interviews</span>
          </div>

          <h3 style={{ margin: '12px 0 8px', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Critical skills ({(struct.critical_skills || []).length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {(struct.critical_skills || []).map(s => (
              <span key={s} style={{
                background: 'var(--primary-soft)', color: 'var(--primary)',
                padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
              }}>{s}</span>
            ))}
            {(struct.critical_skills || []).length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None identified.</span>
            )}
          </div>

          <h3 style={{ margin: '12px 0 8px', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Important skills ({(struct.important_skills || []).length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {(struct.important_skills || []).map(s => (
              <span key={s} style={{
                background: 'var(--bg-subtle)', color: 'var(--text-main)',
                padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 500,
              }}>{s}</span>
            ))}
          </div>

          <h3 style={{ margin: '12px 0 8px', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Assessment links (one per level)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {['L1', 'L2', 'L3'].map(L => (
              <div key={L} className="assessment-callout" style={{ marginTop: 0 }}>
                <div className="ico"><FiExternalLink size={14} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{L}</strong>:{' '}
                  <a href={(data.assessment_urls || {})[L]} target="_blank" rel="noreferrer"
                     style={{ wordBreak: 'break-all' }}>
                    {(data.assessment_urls || {})[L]}
                  </a>
                </div>
              </div>
            ))}
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              Show JD text
            </summary>
            <pre style={{
              marginTop: 8, padding: '12px 14px', background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius)', fontSize: '0.82rem', lineHeight: 1.5,
              whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto',
              fontFamily: 'inherit', color: 'var(--text-main)',
            }}>{data.jd_text || ''}</pre>
          </details>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default Jobs;
