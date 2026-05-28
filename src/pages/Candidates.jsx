import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  FiDownload, FiUsers, FiSearch, FiMail, FiCheckCircle, FiXCircle,
  FiX, FiClipboard, FiSend, FiExternalLink, FiKey, FiAward, FiAlertCircle,
  FiEdit3, FiBookmark, FiTrash2, FiFileText, FiInfo, FiPhone, FiVolume2,
  FiShield, FiFile
} from 'react-icons/fi';
import {
  API_BASE, INTERVIEW_THRESHOLD, ASSESSMENT_PASS_PERCENT,
  STAGES, STAGE_MAP, loadCandidateState, getStage, setStage, getNotes, addNote, deleteNote,
  candidateKey, buildMailto, relativeTime,
  getActiveJobId, setActiveJobId, LEGACY_SESSION_ID,
} from '../lib/enterprise.js';
import { PhoneConfirmModal, InterviewRoom, PhoneCallRoom } from '../components/InterviewRoom.jsx';

const readChats = () => {
  try {
    const raw = localStorage.getItem('geeky_ai_chats');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const scoreClass = (s) => (s >= INTERVIEW_THRESHOLD ? 'high' : 'low');

const fallbackInterviewBody = (name) =>
  `Dear ${name},\n\nThank you for your interest in the role. We are pleased to inform you that your profile has been shortlisted for the next stage of our selection process.\n\nAs the next step, please complete the online technical assessment shared with you.\n\nKind regards,\n\nTalent Acquisition Team\nGeeky AI`;

const fallbackRejectionBody = (name) =>
  `Dear ${name},\n\nThank you for the time and effort you invested in applying for the role.\n\nAfter careful consideration, we have decided to move forward with other candidates whose backgrounds more closely align with the specific requirements of this opportunity at this time.\n\nWe will keep your profile on file for future opportunities.\n\nKind regards,\n\nTalent Acquisition Team\nGeeky AI`;

/* =========================================================================
   Stage picker (click pill -> menu of stage choices)
   ========================================================================= */
const StagePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const current = STAGE_MAP[value] || STAGE_MAP.new;
  return (
    <div className="stage-picker">
      <button
        type="button"
        className={`stage-pill ${current.cls}`}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      >
        {current.label}
      </button>
      {open && (
        <div className="stage-menu">
          {STAGES.map(s => (
            <button
              key={s.key}
              type="button"
              className={s.key === value ? 'current' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.key);
                setOpen(false);
              }}
            >
              <span className={`stage-pill ${s.cls}`} style={{ pointerEvents: 'none' }}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   Email-action button (opens preview)
   ========================================================================= */
const EmailAction = ({ row, onPreview }) => {
  const score = Number(row.Fit_Score_Out_Of_100) || 0;
  const isInterview = score >= INTERVIEW_THRESHOLD;
  const to = row.Email || '';
  if (!to) {
    return <span className="email-action disabled" title="No email found"><FiMail /> No email</span>;
  }
  return (
    <button
      type="button"
      className={`email-action ${isInterview ? 'invite' : 'reject'}`}
      onClick={() => onPreview(row, isInterview)}
      title={`Preview ${isInterview ? 'invite' : 'rejection'} for ${to}`}
    >
      {isInterview ? <FiCheckCircle /> : <FiXCircle />}
      {isInterview ? 'Preview Invite' : 'Preview Rejection'}
    </button>
  );
};

/* =========================================================================
   Email preview modal
   ========================================================================= */
// Pick a default OA level from years of experience.
const recommendLevel = (years) => {
  const y = Number(years) || 0;
  if (y <= 3) return 'L1';
  if (y <= 7) return 'L2';
  return 'L3';
};
const LEVEL_META = {
  L1: { label: 'Level 1 — Entry / Junior', short: 'Level 1', range: '0–3 yrs experience', accent: '#10b981' },
  L2: { label: 'Level 2 — Mid-Level',      short: 'Level 2', range: '4–7 yrs experience', accent: '#f59e0b' },
  L3: { label: 'Level 3 — Senior / Lead',  short: 'Level 3', range: '8+ yrs experience',  accent: '#7c3aed' },
};
const _buildLevelUrl = (baseUrl, urlsByLevel, level) => {
  if (urlsByLevel && urlsByLevel[level]) return urlsByLevel[level];
  if (!baseUrl) return '';
  try {
    const u = new URL(baseUrl);
    u.searchParams.set('level', level);
    return u.toString();
  } catch {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}level=${level}`;
  }
};

const EmailPreviewModal = ({ data, onClose, onRowUpdate, activeJobId }) => {
  const [copied, setCopied] = useState(false);
  // Inline OA-generation state — only used when the row has no assessment URL
  // yet. Lets the recruiter pick AI / Mix / Custom right from the modal.
  const [genBusy, setGenBusy] = useState(false);
  const [genErr,  setGenErr]  = useState('');
  // Multi-level selection — start with just the recommended level checked.
  const [selectedLevels, setSelectedLevels] = useState(
    () => new Set([recommendLevel(data?.row?.Years_Experience)])
  );

  // Editable fields — initialised from the row, then under the recruiter's
  // control. ``bodyEdited`` tracks whether the recruiter has manually changed
  // the body; once true, we stop overwriting it when level checkboxes change.
  const [editTo, setEditTo] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [bodyEdited, setBodyEdited] = useState(false);

  // Per-candidate, per-level invite tokens minted by the backend with the
  // admin-configured TTL (default 48h).  Keyed by level → URL (e.g.
  // "L2": "https://host/invite/abc123").  Until these load, the modal shows
  // the raw /assessment/JD-XXXX URL as a fallback so nothing breaks if the
  // backend is old.
  const [inviteUrls, setInviteUrls] = useState({});
  const [inviteErr,  setInviteErr]  = useState('');
  // Hours the minted tokens will be valid — pulled from /api/config so the
  // email body says "valid for 48 hours" instead of a hard-coded duration.
  const [inviteHours, setInviteHours] = useState(48);

  // Reset modal state when a different candidate's preview opens.
  useEffect(() => {
    if (data?.row) {
      setSelectedLevels(new Set([recommendLevel(data.row.Years_Experience)]));
      setEditTo(data.row.Email || '');
      setEditSubject(
        data.row.Email_Subject ||
        (data.isInterview
          ? "Next Steps in Your Application"
          : "Update on Your Application")
      );
      setBodyEdited(false);
      setInviteUrls({});
      setInviteErr('');
    }
  }, [data]);

  // Mint per-candidate invite tokens (1-hour TTL, one-time use) whenever a
  // new candidate's invite preview opens.  We mint for all three levels so
  // ticking a different level in the modal doesn't trigger another network
  // round-trip — the tokens are coalesced server-side (same email+level
  // returns the same token), so this is safe to call multiple times.
  useEffect(() => {
    if (!data?.row || !data?.isInterview) return;
    const row = data.row;
    const email = row.Email || '';
    const jobId = row.Job_Id || row.job_id || row.session_id || activeJobId || '';
    if (!email || !jobId) {
      setInviteErr(email ? '' : 'Candidate has no email on file — cannot mint a per-candidate link.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Mint without explicit ttl_seconds → backend uses the admin-
        // configured default (Settings → Invite link expiry, 48h default).
        const res = await axios.post(`${API_BASE}/api/invites/mint`, {
          session_id: jobId,
          candidate_email: email,
          candidate_name: row.Candidate_Name || '',
          levels: ['L1', 'L2', 'L3'],
        });
        if (cancelled) return;
        const map = {};
        let hours = inviteHours;
        (res.data?.invites || []).forEach(inv => {
          map[inv.level] = inv.url;
          if (inv.remaining_seconds) {
            hours = Math.round((inv.remaining_seconds / 3600) * 10) / 10;
          }
        });
        setInviteUrls(map);
        setInviteHours(hours);
        setInviteErr('');
      } catch (e) {
        if (cancelled) return;
        const msg = e.response?.data?.message || e.message || 'Could not mint invite tokens.';
        setInviteErr(msg);
      }
    })();
    return () => { cancelled = true; };
  }, [data, activeJobId]);

  // Recompute the auto-generated email body whenever the row or the recruiter's
  // level selection changes. Pushes the result into ``editBody`` UNLESS the
  // recruiter has manually edited it (then we leave their edit alone).
  //
  // Lives BEFORE any early return so React always sees the same number of
  // hooks per render — otherwise the modal blanks out on the second open.
  useEffect(() => {
    if (!data?.row) return;
    const { row, isInterview } = data;
    const urlsByLevel = row.Assessment_Urls || null;
    const baseUrl     = row.Assessment_Url || '';
    const orderedSelected = ['L1', 'L2', 'L3'].filter(L => selectedLevels.has(L));
    // Prefer the per-candidate /invite/<token> URL (1-hour TTL, single-use)
    // over the bare /assessment/JD-XXXX URL.  Falls back to the raw URL
    // only when the mint hasn't completed (or the backend is missing the
    // /api/invites/mint route).
    const urlFor = (L) => inviteUrls[L] || _buildLevelUrl(baseUrl, urlsByLevel, L);
    const levelUrls = isInterview
      ? orderedSelected.map(L => ({ level: L, url: urlFor(L) }))
      : [];

    let computed = row.Email_Body || (isInterview
      ? fallbackInterviewBody(row.Candidate_Name)
      : fallbackRejectionBody(row.Candidate_Name));

    if (!isInterview && /https?:\/\//i.test(computed)) {
      computed = fallbackRejectionBody(row.Candidate_Name);
    } else if (isInterview && levelUrls.length > 0) {
      // The note about expiry sits next to the link so candidates can't miss
      // it. Same wording on single-level and multi-level invites. The hour
      // count comes from the freshly-minted token's remaining_seconds, so
      // it always matches the admin-configured TTL.
      const hoursText = inviteHours >= 24
        ? `${Math.round(inviteHours / 24)} day${Math.round(inviteHours / 24) === 1 ? '' : 's'}`
        : `${inviteHours} hour${inviteHours === 1 ? '' : 's'}`;
      const expiryNote = `⏱ This link is valid for ${hoursText} after delivery and can only be used once. Open it from a quiet space with your camera + microphone ready.`;
      const links = levelUrls.length === 1
        ? `As the next step, please complete the online technical assessment for this role. The assessment is designed to evaluate the core competencies required for the position and typically takes 15 to 20 minutes to complete.\n\nPlease access your assessment using the secure link below:\n\n  ${levelUrls[0].url}\n\n${expiryNote}`
        : `As the next step, we'd like you to complete the following ${levelUrls.length} online assessments. Each is short (15–20 minutes) and focuses on a different proficiency level for this role:\n\n${levelUrls.map(L => `  • ${LEVEL_META[L.level].label} (${LEVEL_META[L.level].range}) — ${L.url}`).join('\n')}\n\n${expiryNote}`;
      computed = computed.replace(
        /As the next step[\s\S]*?(?=Should you have any questions|We look forward|Kind regards|$)/i,
        links + '\n\n',
      );
      if (!computed.includes(levelUrls[0].url)) {
        computed = computed.replace(/(Dear [^,]+,\s*\n+)/, `$1\n${links}\n\n`);
      }
    }

    if (!bodyEdited) setEditBody(computed);
  }, [data, selectedLevels, bodyEdited, inviteUrls, inviteHours]);

  if (!data) return null;
  const { row, isInterview } = data;
  const yrs = row.Years_Experience;
  const recLevel = recommendLevel(yrs);
  const to = editTo;
  const subject = editSubject;
  const body = editBody;

  const urlsByLevel = row.Assessment_Urls || null;
  const baseUrl     = row.Assessment_Url || '';
  // True when the row has NO assessment links yet — i.e. nobody picked a
  // question source after screening for this job. We show an inline
  // "Generate OA" panel in that case so the recruiter can build the OA
  // right here without leaving the modal.
  const needsGeneration = isInterview && !baseUrl && !(urlsByLevel && Object.keys(urlsByLevel).length);

  // Which job_id does this row belong to? Prefer the row's own copy (set by
  // the screening step), fall back to the page-level active job selector.
  const rowJobId = row.Job_Id || row.job_id || row.session_id || activeJobId || '';

  // Build URLs for every level the recruiter ticked, in canonical L1→L3 order.
  // Prefer the per-candidate /invite/<token> URL minted with a 1-hour TTL;
  // fall back to /assessment/JD-XXXX only while the mint request is in
  // flight or if the backend doesn't have the /api/invites/mint route yet.
  const orderedSelected = ['L1', 'L2', 'L3'].filter(L => selectedLevels.has(L));
  const levelUrls = isInterview
    ? orderedSelected.map(L => ({
        level: L,
        url: inviteUrls[L] || _buildLevelUrl(baseUrl, urlsByLevel, L),
        is_invite: !!inviteUrls[L],
      })).filter(L => L.url)
    : [];

  const generateAssessment = async (source) => {
    if (!rowJobId) {
      setGenErr('Could not determine which job this candidate belongs to. Pick the job in the dropdown at the top of the page first.');
      return;
    }
    setGenBusy(true);
    setGenErr('');
    try {
      const res = await axios.post(`${API_BASE}/api/assessment/generate`, {
        session_id: rowJobId, question_source: source,
      });
      const d = res.data || {};
      if (d.status !== 'success') {
        setGenErr(d.message || 'Generation failed.');
        return;
      }
      // Patch this row in-memory so the modal immediately renders the URLs.
      // The parent also gets notified so the Candidates table re-renders.
      const patched = {
        ...row,
        Assessment_Url:  d.assessment_url || '',
        Assessment_Urls: d.assessment_urls || null,
      };
      if (typeof onRowUpdate === 'function') onRowUpdate(patched);
    } catch (e) {
      setGenErr(e.response?.data?.message || e.message || 'Generation failed.');
    } finally {
      setGenBusy(false);
    }
  };
  const primaryUrl = levelUrls[0]?.url || '';

  const toggleLevel = (L) => {
    setSelectedLevels(prev => {
      const next = new Set(prev);
      if (next.has(L)) {
        if (next.size > 1) next.delete(L); // never empty
      } else {
        next.add(L);
      }
      return next;
    });
  };

  const assessmentUrl = primaryUrl;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const handleSend = () => {
    window.location.href = buildMailto(to, subject, body);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {isInterview ? <FiCheckCircle color="var(--success)" /> : <FiXCircle color="var(--danger)" />}
            Email Preview
            <span className={`badge ${isInterview ? 'invite' : 'reject'}`}>
              {isInterview ? 'Interview Invite' : 'Rejection'}
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>To</label>
            <input
              type="email"
              className="modal-input"
              value={editTo}
              onChange={(e) => setEditTo(e.target.value)}
              placeholder="candidate@example.com"
              style={{
                width: '100%', padding: '10px 12px', fontSize: '0.92rem',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
                background: 'var(--bg-surface)', color: 'var(--text-main)',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
          <div className="modal-field">
            <label>Subject</label>
            <input
              type="text"
              className="modal-input"
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              placeholder="Email subject"
              style={{
                width: '100%', padding: '10px 12px', fontSize: '0.92rem',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
                background: 'var(--bg-surface)', color: 'var(--text-main)',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
          {isInterview && (
            <div className="modal-field">
              {/* ── Big highlighted proficiency callout — first thing the
                   recruiter sees. The recommended level is computed from the
                   candidate's years-of-experience (≤3 → Level 1, 4–7 → Level 2,
                   ≥8 → Level 3). ── */}
              <div style={{
                padding: '14px 18px', marginBottom: 14,
                borderRadius: 'var(--radius)',
                background: `linear-gradient(135deg, ${LEVEL_META[recLevel].accent}22, ${LEVEL_META[recLevel].accent}0d)`,
                border: `2px solid ${LEVEL_META[recLevel].accent}`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 56, height: 56, flexShrink: 0,
                  borderRadius: 14, background: LEVEL_META[recLevel].accent,
                  color: '#fff', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, letterSpacing: '-0.02em',
                  boxShadow: `0 6px 14px ${LEVEL_META[recLevel].accent}55`,
                }}>
                  <div style={{ fontSize: '0.6rem', opacity: 0.9, letterSpacing: '0.08em' }}>LEVEL</div>
                  <div style={{ fontSize: '1.5rem', lineHeight: 1, marginTop: 2 }}>{recLevel.slice(1)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: LEVEL_META[recLevel].accent, textTransform: 'uppercase' }}>
                    Recommended proficiency
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginTop: 2, letterSpacing: '-0.01em' }}>
                    {LEVEL_META[recLevel].label}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {yrs ? `Based on ${yrs} years of experience` : 'Experience unknown — defaulting to Level 1'} · {LEVEL_META[recLevel].range}
                  </div>
                </div>
              </div>

              {/* ── Dropdown: assessment level to send ── */}
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Assessment level
              </label>
              <select
                value={orderedSelected[0] || recLevel}
                onChange={(e) => setSelectedLevels(new Set([e.target.value]))}
                style={{
                  width: '100%', padding: '11px 14px', fontSize: '0.95rem',
                  fontWeight: 600,
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
                  background: 'var(--bg-surface)', color: 'var(--text-main)',
                  fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                }}
              >
                {['L1', 'L2', 'L3'].map(L => (
                  <option key={L} value={L}>
                    {LEVEL_META[L].label}{L === recLevel ? '  ★ Recommended' : ''} · {LEVEL_META[L].range}
                  </option>
                ))}
              </select>

              {/* Optional second/third level — small chips below so the
                  recruiter can include extra assessments alongside the primary
                  one without going back to the older clutter of three tiles. */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Also include:</span>
                {['L1', 'L2', 'L3']
                  .filter(L => L !== (orderedSelected[0] || recLevel))
                  .map(L => {
                    const checked = selectedLevels.has(L);
                    return (
                      <button
                        type="button"
                        key={L}
                        onClick={() => toggleLevel(L)}
                        style={{
                          padding: '5px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.15s',
                          border: `1px solid ${checked ? LEVEL_META[L].accent : 'var(--border-color)'}`,
                          background: checked ? `${LEVEL_META[L].accent}1a` : 'var(--bg-surface)',
                          color: checked ? LEVEL_META[L].accent : 'var(--text-muted)',
                        }}
                      >
                        {checked ? '✓ ' : '+ '}{LEVEL_META[L].short}
                      </button>
                    );
                  })}
              </div>

              {levelUrls.length > 0 && (
                <div className="assessment-callout" style={{ marginTop: 14 }}>
                  <div className="ico"><FiExternalLink size={14} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>
                      {levelUrls.length === 1
                        ? `${LEVEL_META[levelUrls[0].level].short} assessment`
                        : `${levelUrls.length} assessments will be included`}
                    </strong>
                    {' '}— 25 MCQ + MSQ questions, 25-minute proctored window.
                    <div style={{
                      marginTop: 6, padding: '6px 10px',
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: 6, fontSize: '0.76rem', color: '#854d0e',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      ⏱ Each link is unique to this candidate · expires in {inviteHours >= 24 ? `${Math.round(inviteHours / 24)} day${Math.round(inviteHours / 24) === 1 ? '' : 's'}` : `${inviteHours} hour${inviteHours === 1 ? '' : 's'}`} · single-use only.
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {levelUrls.map(({ level: L, url, is_invite }) => (
                        <div key={L} style={{ fontSize: '0.84rem' }}>
                          <strong style={{ color: LEVEL_META[L].accent }}>{LEVEL_META[L].short}</strong>:{' '}
                          <a href={url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                            {url}
                          </a>
                          {!is_invite && (
                            <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
                              · per-candidate token not minted (using fallback URL)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {inviteErr && (
                      <div style={{ marginTop: 6, fontSize: '0.76rem', color: '#991b1b' }}>
                        Could not mint per-candidate links: {inviteErr}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── No-URL state: generate the OA right here ─────────────── */}
              {needsGeneration && (
                <div style={{
                  marginTop: 14, padding: '14px 16px',
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  borderRadius: 'var(--radius)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <FiAlertCircle style={{ color: '#854d0e' }} />
                    <strong style={{ color: '#854d0e' }}>OA assessment isn't built for this job yet</strong>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0 0 12px 0', lineHeight: 1.55 }}>
                    Pick where the questions should come from — Geeky AI will build Level 1, 2,
                    and 3 question banks tailored to this job and embed the link in the email.
                  </p>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    {[
                      { key: 'ai',     label: 'AI-generated',  desc: 'Gemini writes every question.' },
                      { key: 'mix',    label: 'Mix · uploaded + AI', desc: 'Half from your bank, half AI.' },
                      { key: 'custom', label: 'From my uploaded questions', desc: 'Your bank; AI only pads if short.' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={genBusy}
                        onClick={() => generateAssessment(opt.key)}
                        style={{
                          padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-surface)', cursor: genBusy ? 'wait' : 'pointer',
                          fontFamily: 'inherit', transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--primary, #4f46e5)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                  {genBusy && (
                    <div style={{ marginTop: 10, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                      Building questions… this usually takes 20–40 seconds.
                    </div>
                  )}
                  {genErr && (
                    <div style={{ marginTop: 10, fontSize: '0.84rem', color: '#991b1b' }}>
                      <FiAlertCircle style={{ verticalAlign: '-2px', marginRight: 4 }} />
                      {genErr}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="modal-field">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>
                Body
                {bodyEdited && (
                  <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                    · EDITED
                  </span>
                )}
              </span>
              {bodyEdited && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setBodyEdited(false)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--primary)',
                    cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                    textDecoration: 'underline', padding: 0,
                  }}
                  title="Discard your edits and regenerate from the template"
                >
                  Reset to template
                </button>
              )}
            </label>
            <textarea
              className="email-body-edit"
              value={editBody}
              onChange={(e) => { setEditBody(e.target.value); setBodyEdited(true); }}
              rows={14}
              spellCheck
              style={{
                width: '100%', padding: '14px 16px', fontSize: '0.9rem',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
                background: 'var(--bg-surface)', color: 'var(--text-main)',
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                lineHeight: 1.55, outline: 'none', resize: 'vertical', minHeight: 240,
                whiteSpace: 'pre-wrap',
              }}
            />
            <div className="hint" style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Tip: tick or untick a level above to regenerate the assessment block — your manual edits stay put until you hit <em>Reset to template</em>.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {copied && <span className="copy-feedback"><FiCheckCircle /> Copied!</span>}
          <button className="btn-secondary" onClick={handleCopy}><FiClipboard /> Copy</button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSend}><FiSend /> Open in mail client</button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Candidate detail drawer (notes + actions)
   ========================================================================= */
const CandidateDrawer = ({ row, state, onClose, onChange }) => {
  const [draft, setDraft] = useState('');
  if (!row) return null;
  const stage = getStage(state, row);
  const notes = getNotes(state, row);

  const handleAddNote = () => {
    if (!draft.trim()) return;
    onChange(addNote(state, row, draft));
    setDraft('');
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-header">
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>
              Candidate
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '1.15rem' }}>{row.Candidate_Name}</h2>
            {row.Email && (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 2 }}>{row.Email}</div>
            )}
            {row.Phone && (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FiPhone size={12} /> {row.Phone}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onClose}><FiX /></button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <div className="drawer-section-title">Pipeline stage</div>
            <StagePicker value={stage} onChange={(s) => onChange(setStage(state, row, s))} />
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">At-a-glance</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="compare-cell">
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 2 }}>Fit score</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{row.Fit_Score_Out_Of_100 ?? '—'}/100</div>
              </div>
              <div className="compare-cell">
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 2 }}>Years</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{row.Years_Experience || '—'}</div>
              </div>
            </div>
            {row.Score_Breakdown && (
              <div className="compare-cell" style={{ marginTop: 10, fontSize: '0.82rem' }}>
                {row.Score_Breakdown}
              </div>
            )}
          </div>

          {row.Key_Strengths && (
            <div className="drawer-section">
              <div className="drawer-section-title">Matched skills</div>
              <div className="compare-cell">{row.Key_Strengths}</div>
            </div>
          )}

          {row.Missing_Skills && (
            <div className="drawer-section">
              <div className="drawer-section-title">Missing skills</div>
              <div className="compare-cell">{row.Missing_Skills}</div>
            </div>
          )}

          <div className="drawer-section">
            <div className="drawer-section-title">Notes ({notes.length})</div>
            {notes.length === 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                No notes yet. Add the first one below.
              </div>
            )}
            {notes.map((n, i) => (
              <div key={i} className="note-item">
                <div className="note-body">{n.text}</div>
                <div className="note-meta" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{relativeTime(n.at)}</span>
                  <button
                    className="icon-btn"
                    style={{ padding: 2 }}
                    onClick={() => onChange(deleteNote(state, row, i))}
                    title="Delete note"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            <textarea
              className="note-input"
              placeholder="Add a note about this candidate…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn-primary" onClick={handleAddNote} disabled={!draft.trim()}>
                <FiBookmark /> Save note
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

/* =========================================================================
   Compare modal (side-by-side)
   ========================================================================= */
const CompareModal = ({ rows, onClose }) => {
  if (!rows || rows.length < 2) return null;
  const fields = [
    { label: 'Fit score',     get: r => `${r.Fit_Score_Out_Of_100 ?? '—'} / 100` },
    { label: 'Years',         get: r => r.Years_Experience || '—' },
    { label: 'Skills matched', get: r => r.Matched_Count != null ? `${r.Matched_Count}/${r.Total_Required}` : '—' },
    { label: 'Matched',       get: r => r.Key_Strengths || '—' },
    { label: 'Missing',       get: r => r.Missing_Skills || '—' },
    { label: 'Email',         get: r => r.Email || '—' },
    { label: 'Breakdown',     get: r => r.Score_Breakdown || '—' },
  ];
  const cols = `200px repeat(${rows.length}, 1fr)`;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
        <div className="modal-header">
          <h2>Side-by-side comparison · {rows.length} candidates</h2>
          <button className="icon-btn" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          <div className="compare-grid" style={{ gridTemplateColumns: cols }}>
            <div className="field-label">Candidate</div>
            {rows.map((r, i) => (
              <div key={i} className="field-label" style={{ color: 'var(--text-main)' }}>
                {r.Candidate_Name}
              </div>
            ))}
            {fields.map((f, fi) => (
              <React.Fragment key={fi}>
                <div className="field-label">{f.label}</div>
                {rows.map((r, ri) => (
                  <div key={ri} className="compare-cell">{f.get(r)}</div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Assessment Results section
   ========================================================================= */
const AssessmentResults = ({ submissions, passThreshold, onOpenAnswerKey, onRefresh, status, activeJobId }) => {
  const [expanded, setExpanded] = useState(null);
  const hasJD = status?.has_jd;
  const hasQuestions = (status?.num_questions || 0) > 0;
  const assessmentUrl = status?.assessment_url || '';

  let emptyTitle = 'No submissions yet';
  let emptyBody = 'Once shortlisted candidates open their assessment link and submit answers, their results will appear here.';
  if (!hasJD) {
    emptyTitle = 'No job description uploaded';
    emptyBody = 'Go to the Voice Screening tab and upload a job description first — that\'s what builds the assessment.';
  } else if (!hasQuestions) {
    emptyTitle = 'Assessment not generated yet';
    emptyBody = 'Re-upload the job description from the Voice Screening tab to build a fresh assessment.';
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FiAward color="var(--primary)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>Assessment Results</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Qualifying mark: {passThreshold}% or higher
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {assessmentUrl && (
            <a className="btn-secondary" href={assessmentUrl} target="_blank" rel="noreferrer">
              <FiExternalLink /> Open assessment page
            </a>
          )}
          <button className="btn-secondary" onClick={onRefresh}>Refresh</button>
          <button className="btn-secondary" onClick={onOpenAnswerKey}><FiKey /> Answer Key</button>
        </div>
      </div>

      {status && (
        <div style={{
          padding: '10px 20px', borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-subtle)', display: 'flex', gap: 18, alignItems: 'center',
          fontSize: '0.8rem', color: 'var(--text-muted)', flexWrap: 'wrap',
        }}>
          <span><strong style={{ color: 'var(--text-main)' }}>{status.num_questions}</strong> questions cached</span>
          <span><strong style={{ color: 'var(--text-main)' }}>{status.num_submissions}</strong> submissions</span>
          {status.latest_submission_at && (
            <span>last: {new Date(status.latest_submission_at).toLocaleString()}</span>
          )}
          {status.jd_title && (
            <span style={{ marginLeft: 'auto' }}>JD: <strong style={{ color: 'var(--text-main)' }}>{status.jd_title}</strong></span>
          )}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 20px' }}>
          <div className="icon-wrap" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
            <FiAlertCircle />
          </div>
          <h3>{emptyTitle}</h3>
          <p>{emptyBody}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="results-table" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Candidate</th>
                <th style={{ textAlign: 'center', width: 110 }}>Score</th>
                <th style={{ textAlign: 'center', width: 110 }}>Percentage</th>
                <th style={{ textAlign: 'center', width: 130 }}>Status</th>
                <th style={{ textAlign: 'center', width: 90 }}>Proctoring</th>
                <th style={{ width: 165 }}>Submitted</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s, idx) => {
                const isExpanded = expanded === idx;
                return (
                  <React.Fragment key={idx}>
                    <tr>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ textAlign: 'center' }}>{s.score === null ? '—' : `${s.score} / ${s.total}`}</td>
                      <td style={{ textAlign: 'center' }}>
                        {s.percent === null ? '—' : (
                          <span className={`score-pill ${s.passed ? 'high' : 'low'}`}>{s.percent}%</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {s.passed === null ? (
                          <span className="summary-pill" style={{ padding: '4px 10px', background: 'var(--warning-soft)', color: '#854d0e' }}>
                            Awaiting review
                          </span>
                        ) : s.passed ? (
                          <span className="summary-pill invite" style={{ padding: '4px 10px' }}><FiCheckCircle /> Qualified</span>
                        ) : (
                          <span className="summary-pill reject" style={{ padding: '4px 10px', background: 'var(--danger-soft)', color: '#991b1b' }}>
                            <FiXCircle /> Not Qualified
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {(() => {
                          const v = (s.violations && s.violations.length) || 0;
                          const auto = s.proctoring?.auto_submitted;
                          if (v === 0 && !auto) {
                            return <span title="No proctoring flags" style={{ color: 'var(--success)', fontSize: '0.85rem' }}>
                              <FiShield style={{ verticalAlign: '-2px' }} /> Clean
                            </span>;
                          }
                          return (
                            <span
                              title={auto ? `Auto-submitted after ${v} violations` : `${v} proctoring violation${v === 1 ? '' : 's'}`}
                              style={{
                                color: auto ? '#991b1b' : '#854d0e',
                                background: auto ? 'var(--danger-soft)' : 'var(--warning-soft)',
                                padding: '3px 9px', borderRadius: 999,
                                fontSize: '0.78rem', fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <FiAlertCircle size={12} /> {v}
                              {auto && <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>· auto</span>}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                        {new Date(s.submitted_at).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                  onClick={() => setExpanded(isExpanded ? null : idx)}>
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                          <a
                            className="btn-secondary"
                            href={`${API_BASE}/api/scorecard/${activeJobId}/${idx}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                            title="Download scorecard as PDF"
                          >
                            <FiFile size={13} /> PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--bg-app)', padding: '12px 20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {s.answers.map((a, qi) => (
                              <div key={qi} style={{
                                background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius)', padding: '10px 14px',
                                display: 'flex', alignItems: 'flex-start', gap: 12,
                              }}>
                                <span style={{
                                  flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                                  background: a.is_correct ? 'var(--success-soft)' : 'var(--danger-soft)',
                                  color: a.is_correct ? '#166534' : '#991b1b',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 12, fontWeight: 700, marginTop: 2,
                                }}>{a.is_correct ? '✓' : '✗'}</span>
                                <div style={{ flex: 1 }}>
                                  {a.skill && <div style={{ display: 'inline-block', background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, marginBottom: 4 }}>{a.skill}</div>}
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>Q{qi + 1}. {a.question}</div>
                                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                    Their answer: <strong style={{ color: a.is_correct ? '#166534' : '#991b1b' }}>{a.chosen_text || '(no answer)'}</strong>
                                    {!a.is_correct && a.correct_text && (<> · Correct: <strong style={{ color: '#166534' }}>{a.correct_text}</strong></>)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   Answer key modal
   ========================================================================= */
const AnswerKeyModal = ({ data, onClose }) => {
  if (!data) return null;
  const { role_title, questions } = data;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>
            <FiKey color="var(--primary)" /> Answer Key
            {role_title && <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>· {role_title}</span>}
          </h2>
          <button className="icon-btn" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          {questions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No assessment generated yet. Upload a JD to create one.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {questions.map((q, qi) => (
                <div key={qi} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                  {q.skill && <div style={{ display: 'inline-block', background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, marginBottom: 6 }}>{q.skill}</div>}
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Q{qi + 1}. {q.question}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(q.options || []).map((opt, oi) => {
                      const isCorrect = oi === q.correct_index;
                      return (
                        <div key={oi} style={{
                          padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid', borderColor: isCorrect ? 'var(--success)' : 'var(--border-color)',
                          background: isCorrect ? 'var(--success-soft)' : 'var(--bg-app)',
                          color: isCorrect ? '#166534' : 'var(--text-main)',
                          fontWeight: isCorrect ? 600 : 400, fontSize: '0.9rem',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          {isCorrect && <FiCheckCircle />}
                          <span>{String.fromCharCode(65 + oi)}. {opt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Main Candidates page
   ========================================================================= */
const Candidates = () => {
  const [query, setQuery] = useState('');
  const [chats, setChats] = useState([]);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [passThreshold, setPassThreshold] = useState(ASSESSMENT_PASS_PERCENT);
  const [answerKey, setAnswerKey] = useState(null);
  const [status, setStatus] = useState(null);
  const [candidateState, setCandidateState] = useState(() => loadCandidateState());
  const [drawerRow, setDrawerRow] = useState(null);
  const [compareIds, setCompareIds] = useState(new Set());
  const [compareModal, setCompareModal] = useState(null);
  const [phoneConfirmFor, setPhoneConfirmFor] = useState(null);  // candidate row
  const [interviewSession, setInterviewSession] = useState(null); // { candidate, phone, mode }
  const [interviews, setInterviews] = useState([]);
  const [transcriptView, setTranscriptView] = useState(null);     // a saved interview record
  const [stageFilter, setStageFilter] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [onlyWithEmail, setOnlyWithEmail] = useState(false);
  const [selected, setSelected] = useState(new Set());
  // ── Jobs (one per JD upload) ──
  const [jobs, setJobs] = useState([]);
  const [activeJobId, _setActiveJobIdState] = useState(() => getActiveJobId());

  const switchJob = useCallback((jobId) => {
    _setActiveJobIdState(jobId);
    setActiveJobId(jobId);
  }, []);

  useEffect(() => { setChats(readChats()); }, []);

  // Load the list of jobs from the backend.
  const fetchJobs = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/jobs`);
      const list = res.data.jobs || [];
      setJobs(list);
      // If the current activeJobId is no longer in the list (e.g. legacy or
      // after a reset), drift to the newest job that does exist.
      if (list.length && !list.find(j => j.job_id === activeJobId)) {
        switchJob(list[0].job_id);
      }
    } catch {}
  }, [activeJobId, switchJob]);

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 15000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  const fetchSubmissions = useCallback(async () => {
    if (!activeJobId) return;
    try {
      const [subsRes, statusRes] = await Promise.all([
        axios.get(`${API_BASE}/api/assessment/submissions/${activeJobId}`),
        axios.get(`${API_BASE}/api/assessment/status/${activeJobId}`),
      ]);
      setSubmissions(subsRes.data.submissions || []);
      if (typeof subsRes.data.pass_threshold === 'number') setPassThreshold(subsRes.data.pass_threshold);
      setStatus(statusRes.data || null);
    } catch {}
  }, [activeJobId]);

  useEffect(() => {
    fetchSubmissions();
    const id = setInterval(fetchSubmissions, 10000);
    return () => clearInterval(id);
  }, [fetchSubmissions]);

  const fetchInterviews = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/interview/transcripts/${activeJobId}`);
      setInterviews(res.data.interviews || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchInterviews();
    const id = setInterval(fetchInterviews, 15000);
    return () => clearInterval(id);
  }, [fetchInterviews]);

  const openAnswerKey = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/assessment/answer_key/${activeJobId}`);
      setAnswerKey({ role_title: res.data.role_title || '', questions: res.data.questions || [] });
    } catch {
      setAnswerKey({ role_title: '', questions: [] });
    }
  }, []);

  const openPreview = useCallback((row, isInterview) => setPreviewEmail({ row, isInterview }), []);

  // Patch a row in-place across every chat that contains it. Used after the
  // Email Preview generates a previously-missing OA so the new URLs flow
  // back into the on-disk chat store and the Candidates table re-renders.
  const patchRow = useCallback((updatedRow) => {
    const matchKey = updatedRow.File_Name || updatedRow.Candidate_Name;
    setChats(prev => {
      const next = prev.map(c => ({
        ...c,
        messages: (c.messages || []).map(m => {
          if (!Array.isArray(m.tableData)) return m;
          const hit = m.tableData.some(r => (r.File_Name || r.Candidate_Name) === matchKey);
          if (!hit) return m;
          return {
            ...m,
            tableData: m.tableData.map(r =>
              (r.File_Name || r.Candidate_Name) === matchKey
                ? { ...r, ...updatedRow }
                : r,
            ),
          };
        }),
      }));
      try { localStorage.setItem('geeky_ai_chats', JSON.stringify(next)); } catch {}
      return next;
    });
    // Also patch the currently-open modal so the freshly-minted URLs appear
    // without the recruiter having to close and reopen the preview.
    setPreviewEmail(p => p ? { ...p, row: { ...p.row, ...updatedRow } } : p);
  }, []);

  const candidates = useMemo(() => {
    const seen = new Map();
    chats.forEach(c => (c.messages || []).forEach(m => (m.tableData || []).forEach(row => {
      seen.set(row.File_Name || row.Candidate_Name, row);
    })));
    return Array.from(seen.values())
      .sort((a, b) => (Number(b.Fit_Score_Out_Of_100) || 0) - (Number(a.Fit_Score_Out_Of_100) || 0));
  }, [chats]);

  const filtered = useMemo(() => {
    return candidates.filter(c => {
      const score = Number(c.Fit_Score_Out_Of_100) || 0;
      if (score < minScore) return false;
      if (onlyWithEmail && !c.Email) return false;
      if (stageFilter !== 'all' && getStage(candidateState, c) !== stageFilter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        (c.Candidate_Name || '').toLowerCase().includes(q) ||
        (c.Key_Strengths || '').toLowerCase().includes(q) ||
        (c.Missing_Skills || '').toLowerCase().includes(q) ||
        (c.Email || '').toLowerCase().includes(q)
      );
    });
  }, [candidates, query, stageFilter, minScore, onlyWithEmail, candidateState]);

  const invitesCount = filtered.filter(c => (Number(c.Fit_Score_Out_Of_100) || 0) >= INTERVIEW_THRESHOLD).length;
  const rejectsCount = filtered.length - invitesCount;

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(candidateKey(c)));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(candidateKey)));
    }
  };
  const toggleSelect = (row) => {
    const k = candidateKey(row);
    setSelected(s => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const bulkSetStage = (stageKey) => {
    let s = candidateState;
    filtered.forEach(r => {
      if (selected.has(candidateKey(r))) s = setStage(s, r, stageKey);
    });
    setCandidateState(s);
    setSelected(new Set());
  };
  const openCompare = () => {
    const rows = filtered.filter(c => selected.has(candidateKey(c)));
    if (rows.length < 2) {
      alert('Select at least 2 candidates to compare.');
      return;
    }
    setCompareModal(rows.slice(0, 4));
  };

  const activeJob = jobs.find(j => j.job_id === activeJobId);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Candidate Database</h1>
          <p className="subtitle">All applicants Geeky AI has screened, ranked by fit score.</p>
        </div>
        <a href={`${API_BASE}/api/download_report`} target="_blank" rel="noreferrer" className="btn-primary">
          <FiDownload /> Download Excel
        </a>
      </div>

      {/* Job switcher — every JD upload is its own job with its own data */}
      {jobs.length > 0 && (
        <div className="card" style={{
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <FiFileText color="var(--primary)" />
            <strong style={{ fontSize: '0.9rem' }}>Job role:</strong>
          </div>
          <select
            value={activeJobId}
            onChange={(e) => switchJob(e.target.value)}
            style={{
              flex: 1, minWidth: 280,
              padding: '8px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              fontFamily: 'inherit', fontSize: '0.92rem',
              background: 'var(--bg-surface)', color: 'var(--text-main)',
              outline: 'none', cursor: 'pointer',
            }}
          >
            {!jobs.find(j => j.job_id === activeJobId) && (
              <option value={activeJobId}>Legacy session</option>
            )}
            {jobs.map(j => (
              <option key={j.job_id} value={j.job_id}>
                {j.role_title || j.jd_title || j.job_id}
                {j.submissions_count ? ` · ${j.submissions_count} submission${j.submissions_count === 1 ? '' : 's'}` : ''}
                {j.created_at ? ` · ${new Date(j.created_at).toLocaleDateString()}` : ''}
              </option>
            ))}
          </select>
          {activeJob?.assessment_url && (
            <a
              href={activeJob.assessment_url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              title="Open the assessment page for this role"
            >
              <FiExternalLink /> Assessment link
            </a>
          )}
          <button
            className="btn-secondary"
            onClick={() => {
              const url = activeJob?.assessment_url || '';
              if (!url) return;
              navigator.clipboard?.writeText(url).then(
                () => alert('Assessment link copied to clipboard.'),
                () => {}
              );
            }}
            disabled={!activeJob?.assessment_url}
            title="Copy the assessment link"
          >
            <FiClipboard /> Copy link
          </button>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="results-summary" style={{ margin: 0 }}>
          <span className="summary-pill invite">
            <FiCheckCircle /> {invitesCount} to invite (≥ {INTERVIEW_THRESHOLD})
          </span>
          <span className="summary-pill reject">
            <FiXCircle /> {rejectsCount} to reject
          </span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <div>
            <strong>{selected.size}</strong> candidate{selected.size === 1 ? '' : 's'} selected
          </div>
          <div className="actions">
            <button onClick={() => bulkSetStage('shortlist')}>Move to Shortlisted</button>
            <button onClick={() => bulkSetStage('interview')}>Move to Interview</button>
            <button onClick={() => bulkSetStage('rejected')}>Mark Rejected</button>
            <button onClick={openCompare} disabled={selected.size < 2}>Compare</button>
            <button onClick={() => setSelected(new Set())} style={{ background: 'rgba(255,255,255,0.08)' }}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <FiSearch color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search by name, strength, skill, or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.95rem', fontFamily: 'inherit', background: 'transparent', color: 'var(--text-main)' }}
          />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {filtered.length} of {candidates.length}
          </span>
        </div>

        {candidates.length > 0 && (
          <div className="filter-row">
            <button
              className={`filter-chip ${stageFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStageFilter('all')}
            >
              All stages
            </button>
            {STAGES.map(s => (
              <button
                key={s.key}
                className={`filter-chip ${stageFilter === s.key ? 'active' : ''}`}
                onClick={() => setStageFilter(s.key)}
              >
                {s.label}
              </button>
            ))}
            <div className="range-slider">
              Min score:
              <input type="range" min="0" max="100" step="5" value={minScore}
                     onChange={(e) => setMinScore(Number(e.target.value))} />
              <strong style={{ color: 'var(--text-main)', minWidth: 32 }}>{minScore}</strong>
            </div>
            <button
              className={`filter-chip ${onlyWithEmail ? 'active' : ''}`}
              onClick={() => setOnlyWithEmail(v => !v)}
            >
              <FiMail size={12} /> Has email
            </button>
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="empty-state">
            <div className="icon-wrap"><FiUsers /></div>
            <h3>Your ATS is empty</h3>
            <p>Once Geeky AI finishes screening resumes, every candidate shows up here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon-wrap" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}><FiInfo /></div>
            <h3>No candidates match your filters</h3>
            <p>Try clearing the search or relaxing the filters above.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="results-table" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" className="row-checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  </th>
                  <th style={{ width: 50 }}>#</th>
                  <th>Candidate</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Score</th>
                  <th style={{ width: 130 }}>Stage</th>
                  <th>Key Strengths</th>
                  <th style={{ width: 280 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const score = Number(row.Fit_Score_Out_Of_100) || 0;
                  const k = candidateKey(row);
                  return (
                    <tr key={k + idx}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="row-checkbox"
                          checked={selected.has(k)}
                          onChange={() => toggleSelect(row)}
                        />
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{idx + 1}</td>
                      <td>
                        <button
                          onClick={() => setDrawerRow(row)}
                          style={{
                            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                            color: 'var(--text-main)', fontWeight: 600, fontFamily: 'inherit',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {row.Candidate_Name} <FiEdit3 size={12} style={{ color: 'var(--text-muted)' }} />
                        </button>
                        {row.Email && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {row.Email}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`score-pill ${scoreClass(score)}`}>{score}</span>
                      </td>
                      <td>
                        <StagePicker
                          value={getStage(candidateState, row)}
                          onChange={(s) => setCandidateState(setStage(candidateState, row, s))}
                        />
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{row.Key_Strengths}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <EmailAction row={row} onPreview={openPreview} />
                          <button
                            type="button"
                            className="email-action"
                            style={{
                              background: 'var(--bg-surface)',
                              color: 'var(--primary)',
                              border: '1px solid var(--primary)',
                            }}
                            onClick={() => setPhoneConfirmFor(row)}
                            title="Start a voice L1 interview"
                          >
                            <FiPhone /> Interview
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

      <AssessmentResults
        submissions={submissions}
        passThreshold={passThreshold}
        onRefresh={fetchSubmissions}
        onOpenAnswerKey={openAnswerKey}
        status={status}
        activeJobId={activeJobId}
      />

      {/* Interview transcripts section */}
      <InterviewTranscripts
        interviews={interviews}
        onView={setTranscriptView}
        onRefresh={fetchInterviews}
      />

      <EmailPreviewModal
        data={previewEmail}
        onClose={() => setPreviewEmail(null)}
        onRowUpdate={patchRow}
        activeJobId={activeJobId}
      />
      <AnswerKeyModal data={answerKey} onClose={() => setAnswerKey(null)} />
      <CompareModal rows={compareModal} onClose={() => setCompareModal(null)} />
      <CandidateDrawer
        row={drawerRow}
        state={candidateState}
        onClose={() => setDrawerRow(null)}
        onChange={setCandidateState}
      />

      <PhoneConfirmModal
        candidate={phoneConfirmFor}
        onClose={() => setPhoneConfirmFor(null)}
        onConfirm={(phone, mode, language) => {
          setInterviewSession({ candidate: phoneConfirmFor, phone, mode: mode || 'browser', language: language || 'en-IN' });
          setPhoneConfirmFor(null);
        }}
      />

      {interviewSession && interviewSession.mode === 'phone' && (
        <PhoneCallRoom
          candidate={interviewSession.candidate}
          phone={interviewSession.phone}
          onClose={() => setInterviewSession(null)}
          onSaved={() => { fetchInterviews(); }}
        />
      )}
      {interviewSession && interviewSession.mode !== 'phone' && (
        <InterviewRoom
          candidate={interviewSession.candidate}
          phone={interviewSession.phone}
          language={interviewSession.language}
          onClose={() => setInterviewSession(null)}
          onSaved={() => { fetchInterviews(); }}
        />
      )}

      <InterviewTranscriptModal data={transcriptView} onClose={() => setTranscriptView(null)} />
    </div>
  );
};

/* =========================================================================
   Interview transcripts list section
   ========================================================================= */
const InterviewTranscripts = ({ interviews, onView, onRefresh }) => {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FiPhone color="var(--primary)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>L1 Interview Transcripts</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Voice interviews conducted by Geeky AI, ready to review.
            </div>
          </div>
        </div>
        <button className="btn-secondary" onClick={onRefresh}>Refresh</button>
      </div>

      {interviews.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 20px' }}>
          <div className="icon-wrap" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
            <FiPhone />
          </div>
          <h3>No interviews yet</h3>
          <p>Click <strong>Interview</strong> on any candidate row above to start a voice L1 interview.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="results-table" style={{ border: 'none', borderRadius: 0, margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Candidate</th>
                <th>Phone</th>
                <th style={{ textAlign: 'center', width: 110 }}>Answered</th>
                <th style={{ width: 180 }}>Conducted</th>
                <th style={{ width: 100 }}>Transcript</th>
              </tr>
            </thead>
            <tbody>
              {interviews.map((iv, idx) => {
                const answered = (iv.transcript || []).filter(t => (t.answer || '').trim()).length;
                const total = (iv.transcript || []).length;
                return (
                  <tr key={iv.interview_id || idx}>
                    <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{iv.candidate_name}</div>
                      {iv.role_title && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {iv.role_title}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>{iv.phone}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`score-pill ${answered >= total * 0.6 ? 'high' : 'low'}`}>
                        {answered} / {total}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                      {new Date(iv.saved_at || iv.ended_at).toLocaleString()}
                    </td>
                    <td>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                        onClick={() => onView(iv)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   View transcript modal
   ========================================================================= */
const InterviewTranscriptModal = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h2>
            <FiPhone color="var(--primary)" />
            Interview Transcript
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>
              · {data.candidate_name}
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 6,
            fontSize: '0.86rem', marginBottom: 18, padding: '10px 14px',
            background: 'var(--bg-subtle)', borderRadius: 'var(--radius)',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Phone</span><span>{data.phone || '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Role</span><span>{data.role_title || '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Conducted</span>
            <span>{new Date(data.saved_at || data.ended_at).toLocaleString()}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(data.transcript || []).map((t, i) => (
              <div key={i} style={{
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '14px 16px',
                background: 'var(--bg-surface)',
              }}>
                <div style={{
                  display: 'inline-block', background: 'var(--primary-soft)', color: 'var(--primary)',
                  padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, marginBottom: 6,
                }}>
                  {t.category}{t.skill ? ` · ${t.skill}` : ''}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.94rem' }}>
                  Q{i + 1}. {t.question}
                </div>
                {t.answer ? (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {t.answer}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.86rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>
                    No answer captured.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default Candidates;
