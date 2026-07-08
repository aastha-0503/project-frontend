import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiBriefcase, FiSearch, FiExternalLink, FiClipboard, FiCheckCircle,
  FiTrash2, FiArrowRight, FiX, FiUsers, FiAward, FiFileText, FiInfo, FiUser,
  FiDownload,
} from 'react-icons/fi';
import {
  API_BASE, setActiveJobId, getActiveJobId, relativeTime,
} from '../lib/enterprise.js';
import { useAuth } from '../lib/auth.jsx';

const JOBS_PER_PAGE = 25;

const Jobs = () => {
  const { account } = useAuth();
  const isAdmin = account?.role === 'admin';

  const [jobs, setJobs]       = useState([]);
  const [query, setQuery]     = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');     // admin-only
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

  // Employee dropdown options — derived from the visible job list.
  const employeeOptions = useMemo(() => {
    if (!isAdmin) return [];
    const seen = new Map();
    jobs.forEach(j => {
      if (!j.owner_id) return;
      if (!seen.has(j.owner_id)) {
        seen.set(j.owner_id, {
          id:   j.owner_id,
          name: j.owner_name || j.owner_email || j.owner_id,
          role: j.owner_role || '',
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isAdmin, jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const owner = (ownerFilter || '').toLowerCase();
    return jobs.filter(j => {
      if (isAdmin && owner && (j.owner_id || '').toLowerCase() !== owner) return false;
      if (!q) return true;
      // JD number — match "23", "JD-23", "JD-0023", "0023"
      const numStr = j.jd_number_display || '';
      const justNum = String(j.jd_number || '');
      if (numStr.toLowerCase().includes(q)) return true;
      if (justNum.includes(q.replace(/^jd-?0*/i, ''))) return true;
      if ((j.jd_title || '').toLowerCase().includes(q)) return true;
      if ((j.role_title || '').toLowerCase().includes(q)) return true;
      if ((j.jd_filename || '').toLowerCase().includes(q)) return true;
      if ((j.skills || []).some(s => s.toLowerCase().includes(q))) return true;
      if (isAdmin && (j.owner_name || '').toLowerCase().includes(q)) return true;
      if (isAdmin && (j.owner_email || '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [jobs, query, ownerFilter, isAdmin]);

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
          {isAdmin && (
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              title="Filter by uploader"
              style={{
                padding: '8px 12px', borderRadius: 10,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)', color: 'var(--text-main)',
                fontSize: '0.88rem', fontFamily: 'inherit',
              }}
            >
              <option value="">All employees</option>
              {employeeOptions.map(e => (
                <option key={e.id} value={e.id}>
                  👤 {e.name}{e.role === 'admin' ? ' · admin' : ''}
                </option>
              ))}
            </select>
          )}
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
            <p>Head to Resume Screening to upload your first job description. Each one gets a unique JD number and its own assessment links.</p>
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
                  {isAdmin && <th style={{ width: 150 }}>Uploaded by</th>}
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
                      {isAdmin && (
                        <td>
                          {job.owner_name || job.owner_id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                              <FiUser size={11} style={{ color: 'var(--text-muted)' }} />
                              <span>
                                {job.owner_name || job.owner_id}
                                {job.owner_role === 'admin' && (
                                  <span style={{ marginLeft: 6, fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)' }}>admin</span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>
                          )}
                        </td>
                      )}
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
                          {/* Download the original JD file. Backend returns
                              404 for JDs uploaded before file persistence
                              landed — the browser will show the JSON error
                              inline, no client-side check needed. */}
                          <a className="btn-secondary"
                             style={{ padding: '6px 10px', fontSize: '0.8rem', textDecoration: 'none' }}
                             href={`${API_BASE}/api/jd/${job.job_id}/download`}
                             target="_blank" rel="noreferrer"
                             title="Download the original JD file">
                            <FiDownload /> JD
                          </a>
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
  const [resumes, setResumes] = useState([]);
  useEffect(() => {
    if (!data?.job_id) { setResumes([]); return; }
    let cancelled = false;
    axios.get(`${API_BASE}/api/jd/${data.job_id}/resumes`)
      .then(res => { if (!cancelled) setResumes(res.data?.resumes || []); })
      .catch(() => { if (!cancelled) setResumes([]); });
    return () => { cancelled = true; };
  }, [data?.job_id]);
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

          {/* Uploaded resumes — persisted per-JD on the mounted volume, so this
              list survives redeploys. Each row links straight to the file. */}
          <h3 style={{ margin: '12px 0 8px', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Uploaded resumes ({resumes.length})
          </h3>
          {resumes.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 14 }}>
              No resumes on file for this JD.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {resumes.map(r => (
                <a
                  key={r.filename}
                  href={`${API_BASE}${r.download_url}`}
                  target="_blank" rel="noreferrer"
                  className="assessment-callout"
                  style={{
                    marginTop: 0, textDecoration: 'none', color: 'var(--text-main)',
                    fontSize: '0.86rem',
                  }}
                  title={`Download ${r.filename}`}
                >
                  <div className="ico"><FiDownload size={13} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ wordBreak: 'break-all', fontWeight: 500 }}>{r.filename}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {(r.size_bytes / 1024).toFixed(1)} KB · uploaded {new Date(r.uploaded_at).toLocaleString()}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

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
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <a className="btn-secondary"
             style={{ padding: '8px 14px', textDecoration: 'none' }}
             href={`${API_BASE}/api/jd/${data.job_id}/download`}
             target="_blank" rel="noreferrer"
             title="Download the original JD file">
            <FiDownload /> Download JD
          </a>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default Jobs;
