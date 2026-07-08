import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  FiMic, FiMicOff, FiSend, FiPlusSquare, FiFileText, FiUsers,
  FiMessageSquare, FiTrash2, FiDownload, FiVolume2, FiVolumeX, FiSquare,
  FiMail, FiCheckCircle, FiXCircle, FiX, FiCopy, FiExternalLink, FiClipboard,
  FiUpload, FiDatabase, FiPlayCircle, FiArrowRight,
} from 'react-icons/fi';

// Import API_BASE from the shared lib so this file picks up VITE_API_BASE
// at build time too — no separate env-var wiring needed here.
import { setActiveJobId, API_BASE } from '../lib/enterprise.js';

const SETTINGS_KEY = 'geeky_ai_settings';

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const INTERVIEW_THRESHOLD = 50;
// Green if invited, red if rejected. No middle band.
const scoreClass = (s) => (s >= INTERVIEW_THRESHOLD ? 'high' : 'low');

const buildMailto = (to, subject, body) => {
  const enc = encodeURIComponent;
  return `mailto:${to}?subject=${enc(subject || '')}&body=${enc(body || '')}`;
};

// Assessment URL is ONLY ever read from `row.Assessment_Url` — never scraped
// from the email body — so a rejection email can't accidentally surface a link.

/* ---------- Per-row email action button (opens preview modal) ---------- */
const EmailAction = ({ row, onPreview }) => {
  const score = Number(row.Fit_Score_Out_Of_100) || 0;
  const isInterview = score >= INTERVIEW_THRESHOLD;
  const to = row.Email || '';

  if (!to) {
    return (
      <span className="email-action disabled" title="No email address found on this resume">
        <FiMail /> No email
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`email-action ${isInterview ? 'invite' : 'reject'}`}
      onClick={() => onPreview(row, isInterview)}
      title={`Preview the ${isInterview ? 'interview invite' : 'rejection'} for ${to}`}
    >
      {isInterview ? <FiCheckCircle /> : <FiXCircle />}
      {isInterview ? 'Preview Invite' : 'Preview Rejection'}
    </button>
  );
};

/* ---------- Email preview modal ---------- */
const EmailPreviewModal = ({ data, onClose }) => {
  const [copied, setCopied] = useState(false);
  // Editable fields — initialised from the row, then under the recruiter's
  // control. Once they touch the body we stop overwriting it.
  const [editTo, setEditTo] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [bodyEdited, setBodyEdited] = useState(false);

  useEffect(() => {
    if (!data) return;
    const { row, isInterview } = data;
    setEditTo(row.Email || '');
    setEditSubject(
      row.Email_Subject ||
      (isInterview
        ? "Congratulations — Next Step: Online Assessment"
        : "Update on your application")
    );
    let initialBody = row.Email_Body || '';
    if (!isInterview && /https?:\/\//i.test(initialBody)) {
      initialBody = initialBody
        .replace(/^.*assessment.*$/gim, '')
        .replace(/^\s*https?:\/\/\S+\s*$/gim, '')
        .replace(/[ \t]*https?:\/\/\S+/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    setEditBody(initialBody);
    setBodyEdited(false);
  }, [data]);

  if (!data) return null;

  const { row, isInterview } = data;
  const to = editTo;
  const subject = editSubject;
  const body = editBody;
  // Only invite emails ever surface an assessment URL.
  const assessmentUrl = isInterview ? (row.Assessment_Url || '') : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSend = () => {
    window.location.href = buildMailto(to, subject, body);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>
            {isInterview ? <FiCheckCircle color="var(--success)" /> : <FiXCircle color="var(--danger)" />}
            Email Preview
            <span className={`badge ${isInterview ? 'invite' : 'reject'}`}>
              {isInterview ? 'Interview Invite' : 'Rejection'}
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close preview">
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-field">
            <label>To</label>
            <input
              type="email"
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

          {isInterview && assessmentUrl && (
            <div className="modal-field">
              <label>Online Assessment</label>
              <div className="assessment-callout">
                <div className="ico"><FiExternalLink size={14} /></div>
                <div style={{ flex: 1 }}>
                  Demo assessment tailored to this role. The candidate gets this link in the email.
                  <div style={{ marginTop: 4 }}>
                    <a href={assessmentUrl} target="_blank" rel="noreferrer">{assessmentUrl}</a>
                  </div>
                </div>
              </div>
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
            </label>
            <textarea
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
              Edit any field above before sending. The mail-client opens with your final version.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {copied && <span className="copy-feedback"><FiCheckCircle /> Copied!</span>}
          <button className="btn-secondary" onClick={handleCopy}>
            <FiClipboard /> Copy
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSend}>
            <FiSend /> Open in mail client
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Results table rendered inside a chat message ---------- */
const ResultsTable = ({ tableData, onPreview }) => {
  if (!tableData || tableData.length === 0) return null;
  const invites = tableData.filter(r => (Number(r.Fit_Score_Out_Of_100) || 0) >= INTERVIEW_THRESHOLD).length;
  const rejects = tableData.length - invites;
  return (
    <div style={{ marginTop: 14, overflowX: 'auto' }}>
      <div className="results-summary">
        <span className="summary-pill invite"><FiCheckCircle /> {invites} to invite</span>
        <span className="summary-pill reject"><FiXCircle /> {rejects} to reject</span>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th style={{ width: 50 }}>Rank</th>
            <th>Candidate</th>
            <th style={{ textAlign: 'center', width: 80 }}>Score</th>
            <th>Key Strengths</th>
            <th>Missing Skills</th>
            <th style={{ width: 200 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {tableData.map((row, idx) => {
            const score = Number(row.Fit_Score_Out_Of_100) || 0;
            return (
              <tr key={idx}>
                <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{idx + 1}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.Candidate_Name}</div>
                  {row.Email && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {row.Email}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`score-pill ${scoreClass(score)}`}>{score}</span>
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>{row.Key_Strengths}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>{row.Missing_Skills}</td>
                <td><EmailAction row={row} onPreview={onPreview} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <a
        href={`${API_BASE}/api/download_report`}
        target="_blank"
        rel="noreferrer"
        className="action-btn"
        style={{ marginTop: 12, width: 'auto', display: 'inline-flex' }}
      >
        <FiDownload /> Download full Excel report
      </a>
    </div>
  );
};

/* ---------- Skills-only "virtual JD" modal --------------------------
   Pasted-skills path for recruiters who don't have a JD doc to upload.
   Comma- or newline-separated input, optional role title; submits to
   /api/upload_jd_skills which mints a session with just jd_skills set.
   -------------------------------------------------------------------- */
const SkillsOnlyModal = ({ open, onClose, onSubmit, busy }) => {
  const [skills, setSkills] = useState('');
  const [title,  setTitle]  = useState('');

  if (!open) return null;

  const skillCount = skills.split(/[\n,]/).map(s => s.trim()).filter(Boolean).length;
  const submit = (e) => {
    e.preventDefault();
    if (!skills.trim() || busy) return;
    onSubmit(skills, title);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Paste skill list</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <FiX />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="subtitle" style={{ marginTop: 0, marginBottom: 14 }}>
              No JD doc? Just paste the skills you're hiring for — SmartStaff will
              treat every skill as critical and rank uploaded resumes against the list.
            </p>
            <div className="modal-field">
              <label>Role title (optional)</label>
              <input
                type="text" value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Python Backend Engineer"
                style={{
                  width: '100%', padding: '10px 12px', fontSize: '0.92rem',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
                  background: 'var(--bg-surface)', color: 'var(--text-main)',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
            <div className="modal-field">
              <label>
                Required skills · <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                  {skillCount > 0 ? `${skillCount} listed` : 'comma- or newline-separated'}
                </span>
              </label>
              <textarea
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                rows={6}
                autoFocus
                placeholder={'Python, Django, PostgreSQL, AWS, Docker, Kubernetes, Kafka, Redis, REST APIs, microservices'}
                spellCheck={false}
                style={{
                  width: '100%', padding: '12px 14px', fontSize: '0.92rem',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
                  background: 'var(--bg-surface)', color: 'var(--text-main)',
                  fontFamily: 'ui-monospace, "Cascadia Code", "Consolas", monospace',
                  outline: 'none', resize: 'vertical', minHeight: 120,
                }}
              />
              <div className="hint" style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Up to 30 skills · separate with commas or new lines. Order doesn't matter.
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!skills.trim() || busy}>
              {busy ? 'Submitting…' : `Use these ${skillCount || 0} skill${skillCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ---------- Generic inline action buttons under a bot bubble --------
   Used to guide the recruiter through the workflow — "Upload your own
   questions", "Upload candidate resumes", "Run screening". Each action
   has a kind (matched in the click handler) + a label + an icon. The
   parent component supplies the click handler that interprets `kind`.
   -------------------------------------------------------------------- */
const ChatActions = ({ actions, onClick, disabled }) => {
  if (!actions || actions.length === 0) return null;
  return (
    <div style={{
      marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8,
    }}>
      {actions.map((a, i) => {
        const Icon = a.icon;
        const isPrimary = a.primary;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onClick(a)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 16px', borderRadius: 10,
              border: `1px solid ${isPrimary ? 'var(--primary, #4f46e5)' : 'var(--border-color)'}`,
              background: isPrimary ? 'var(--primary, #4f46e5)' : 'var(--bg-surface)',
              color: isPrimary ? '#fff' : 'var(--text-main)',
              fontWeight: 600, fontSize: '0.86rem',
              cursor: disabled ? 'wait' : 'pointer', transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {Icon && <Icon />} {a.label}
            {a.note && (
              <span style={{ opacity: 0.75, fontWeight: 400, fontSize: '0.78rem', marginLeft: 4 }}>
                · {a.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ---------- Post-screening question-source picker -------------------
   Rendered inside the bot bubble that asks "Where should the OA questions
   come from?".  Three big buttons — AI, Mix, Custom — call back into the
   parent which fires /api/assessment/generate.  Once clicked, all three
   buttons disable so the operator can't accidentally trigger two builds.
   -------------------------------------------------------------------- */
const SourcePromptButtons = ({ onPick, disabled }) => {
  const opts = [
    {
      key: 'ai',
      title: 'AI-generated',
      desc:  'SmartStaff writes every question for this role using Gemini.',
      icon:  FiCheckCircle,
      accent: '#4f46e5',
    },
    {
      key: 'mix',
      title: 'Mix · uploaded + AI',
      desc:  'Half from your uploaded bank, half AI-generated.',
      icon:  FiClipboard,
      accent: '#06b6d4',
    },
    {
      key: 'custom',
      title: 'From my uploaded questions',
      desc:  'Pulled from your bank. AI pads only if the bank is short.',
      icon:  FiFileText,
      accent: '#10b981',
    },
  ];
  return (
    <div style={{
      marginTop: 12, display: 'grid', gap: 10,
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    }}>
      {opts.map(o => {
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(o.key)}
            style={{
              textAlign: 'left',
              padding: '12px 14px', borderRadius: 12,
              border: `2px solid ${disabled ? 'var(--border-color)' : o.accent}`,
              background: disabled ? 'var(--bg-subtle)' : `${o.accent}10`,
              color: 'var(--text-main)',
              cursor: disabled ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.92rem', color: o.accent }}>
              <Icon /> {o.title}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {o.desc}
            </div>
          </button>
        );
      })}
    </div>
  );
};

/* ---------- Typewriter rendering for new bot messages ---------- */
const TypewriterText = ({ text, animate, instant }) => {
  const [shown, setShown] = useState(animate && !instant ? '' : text);

  useEffect(() => {
    if (!animate || instant) {
      setShown(text);
      return;
    }
    let i = 0;
    setShown('');
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 12);
    return () => clearInterval(id);
  }, [text, animate, instant]);

  return <span style={{ whiteSpace: 'pre-wrap' }}>{shown}</span>;
};

/* =================================================================
   MAIN COMPONENT
   ================================================================= */
const VoiceScreening = () => {
  /* ----- session state ----- */
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem('geeky_ai_chats');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [{
      id: Date.now(),
      title: 'New Session',
      messages: [{
        sender: 'bot',
        text: "Hi! I'm SmartStaff, your AI recruiter. Upload a job description and the resumes you'd like screened, then tell me when you're ready to start."
      }]
    }];
  });

  const [activeChatId, setActiveChatId] = useState(chats[0]?.id || null);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [progressLog, setProgressLog] = useState('');

  /* ----- speech state ----- */
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);    // hands-free toggle
  const [voiceEnabled, setVoiceEnabled] = useState(true); // TTS on/off
  const [uploads, setUploads] = useState({ jd: false, resumes: 0 });
  // Skills-only modal: lets the recruiter paste a comma-separated skill list
  // instead of uploading a JD doc, then run screening against it.
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  // Question-source mode for OA generation. Persisted in localStorage so the
  // operator's last pick sticks across reloads. AI is the safe default.
  const [questionSource, setQuestionSource] = useState(() => {
    try { return localStorage.getItem('geeky_ai_question_source') || 'ai'; }
    catch { return 'ai'; }
  });
  const [previewEmail, setPreviewEmail] = useState(null);
  const openPreview = useCallback((row, isInterview) => {
    setPreviewEmail({ row, isInterview });
  }, []);

  /* ----- refs ----- */
  const messagesEndRef = useRef(null);
  const jdInputRef = useRef(null);
  const resumeInputRef = useRef(null);
  // Hidden file input for the question-bank chat action (admin only).
  const questionBankInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const settingsRef = useRef(loadSettings());
  const voiceModeRef = useRef(false);
  const listeningRef = useRef(false);

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { listeningRef.current = isListening; }, [isListening]);

  /* Persist chats. */
  useEffect(() => {
    localStorage.setItem('geeky_ai_chats', JSON.stringify(chats));
  }, [chats]);

  /* Scroll to bottom on activity. */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId, isThinking, progressLog, interimTranscript]);

  /* Load TTS voices once available (Chrome loads them asynchronously). */
  useEffect(() => {
    const load = () => {
      voicesRef.current = window.speechSynthesis?.getVoices?.() || [];
    };
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);

  /* Cancel any ongoing speech when component unmounts. */
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
        recognitionRef.current?.abort?.();
      } catch {}
    };
  }, []);

  const activeChat = chats.find(c => c.id === activeChatId) || { messages: [] };
  // The current job_id (one per JD upload). Falls back to a legacy id when no
  // JD has been uploaded in this chat yet — backend handles that as a no-op.
  const currentJobId = activeChat.job_id || 'local_react_user';

  /* =================== TTS =================== */
  const loggedVoiceRef = useRef('');
  // Score-based selection — picks the most natural Indian-English voice the
  // browser has, preferring Neural/Online/Natural engines so the caller can't
  // tell it's a bot. Mirrors InterviewRoom.jsx so the voice feels consistent
  // across the whole product.
  const pickVoice = useCallback(() => {
    const list = voicesRef.current;
    if (!list.length) return null;
    const preferred = settingsRef.current.voiceName;
    if (preferred) {
      const match = list.find(v => v.name === preferred);
      if (match) return match;
    }
    const INDIAN_NAMES = /heera|ravi|kalpana|prabhat|aarav|aditi|raveena|veena|chitra|hemant|prashant|priya|kabir|sneha|isha|neel|rishi|arjun/i;
    const scoreVoice = (v) => {
      let s = 0;
      if (/en[-_]IN/i.test(v.lang)) s += 100;
      else if (/hi[-_]IN/i.test(v.lang)) s += 70;
      else if (/^en/i.test(v.lang)) s += 20;
      if (/\bIndia(n)?\b/i.test(v.name)) s += 60;
      if (INDIAN_NAMES.test(v.name)) s += 60;
      if (/neural/i.test(v.name)) s += 40;
      if (/natural/i.test(v.name)) s += 30;
      if (/online/i.test(v.name)) s += 25;
      if (/google/i.test(v.name)) s += 15;
      if (/female|aria|jenny|samantha|zira/i.test(v.name)) s += 5;
      if (/microsoft.*desktop/i.test(v.name)) s -= 10; // older robotic voices
      return s;
    };
    const ranked = [...list].sort((a, b) => scoreVoice(b) - scoreVoice(a));
    const chosen = ranked[0] || list[0];
    if (chosen && loggedVoiceRef.current !== chosen.name) {
      console.log("[SmartStaff] Using voice:", chosen.name, `(${chosen.lang}) score=${scoreVoice(chosen)}`);
      loggedVoiceRef.current = chosen.name;
    }
    return chosen;
  }, []);

  const splitSentencesForSpeech = (raw) => {
    const cleaned = (raw || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return [];
    const parts = cleaned.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [cleaned];
    const out = [];
    for (const p of parts) {
      const t = p.trim();
      if (t.length <= 140) { out.push(t); continue; }
      const sub = t.split(/(?<=[,;:—-])\s+/);
      out.push(...sub.map(s => s.trim()).filter(Boolean));
    }
    return out;
  };

  const speak = useCallback((text, onDone) => {
    if (!text || !window.speechSynthesis) { onDone?.(); return; }
    // Re-hydrate settings each call so toggling the master mute on the Settings
    // page takes effect immediately — no refresh, no remount required.
    settingsRef.current = { ...settingsRef.current, ...loadSettings() };
    // Per-page mute (header speaker button) AND global mute (Settings).
    if (!voiceEnabled) { onDone?.(); return; }
    if (settingsRef.current?.botVoiceEnabled === false) { onDone?.(); return; }
    try { window.speechSynthesis.cancel(); } catch {}

    const chunks = splitSentencesForSpeech(text);
    if (chunks.length === 0) { onDone?.(); return; }

    const voice = pickVoice();
    // Slower + warmer defaults so the voice feels human, not robotic.
    const rate  = Number(settingsRef.current.rate)  || 0.82;
    const pitch = Number(settingsRef.current.pitch) || 0.97;

    setIsSpeaking(true);
    let idx = 0;
    const next = () => {
      if (idx >= chunks.length) {
        setIsSpeaking(false);
        onDone?.();
        return;
      }
      const chunk = chunks[idx];
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = pitch;
      u.volume = 1.0;
      // Longer breath after a full stop, shorter after a comma/clause break —
      // mirrors how real interviewers pace their sentences.
      const endsHard = /[.!?]\s*$/.test(chunk);
      const pauseMs = endsHard ? 280 : 154;
      u.onend = () => { idx += 1; setTimeout(next, pauseMs); };
      u.onerror = () => { idx += 1; setTimeout(next, 80); };
      try { window.speechSynthesis.speak(u); }
      catch { idx += 1; setTimeout(next, 80); }
    };
    next();
  }, [pickVoice, voiceEnabled]);

  const stopSpeaking = () => {
    try { window.speechSynthesis?.cancel(); } catch {}
    setIsSpeaking(false);
  };

  /* =================== STT =================== */
  const getRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    if (recognitionRef.current) return recognitionRef.current;

    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    return rec;
  }, []);

  const startListening = useCallback(() => {
    const rec = getRecognition();
    if (!rec) {
      alert("Your browser doesn't support speech recognition. Try Chrome or Edge.");
      return;
    }
    if (isListening) return;
    stopSpeaking();
    setInterimTranscript('');

    rec.onstart = () => setIsListening(true);
    rec.onerror = (e) => {
      setIsListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        alert('Microphone permission denied. Please allow mic access in your browser settings.');
      }
    };
    rec.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };
    rec.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInterimTranscript(interim);
      if (finalText.trim()) {
        setInterimTranscript('');
        try { rec.stop(); } catch {}
        triggerMessage(finalText.trim());
      }
    };

    try {
      rec.start();
    } catch (e) {
      // Some browsers throw if already started; safely ignore.
      setIsListening(false);
    }
  }, [getRecognition, isListening]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  /* When voice mode toggled on, immediately start listening. */
  useEffect(() => {
    if (voiceMode && !isListening && !isThinking && !isSpeaking) {
      startListening();
    } else if (!voiceMode && isListening) {
      stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode]);

  /* =================== chat helpers =================== */
  const updateActiveChat = (mutator) => {
    setChats(prev => prev.map(c => c.id === activeChatId ? mutator(c) : c));
  };

  const triggerMessage = async (
    rawText,
    { hidden = false, displayOverride = null } = {}
  ) => {
    if (!rawText?.trim() || !activeChatId) return;
    if (isThinking) return;

    setInputText('');
    setIsThinking(true);
    setProgressLog('');

    const userVisible = hidden ? (displayOverride || 'System command') : rawText;

    updateActiveChat(c => {
      const next = { ...c, messages: [...c.messages, { sender: 'user', text: userVisible }] };
      // First real user message becomes the chat title.
      if (!hidden && (c.title === 'New Session' || !c.title)) {
        next.title = rawText.slice(0, 38) + (rawText.length > 38 ? '…' : '');
      }
      return next;
    });

    // Poll progress while the backend processes.
    const progressInterval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/progress`);
        if (res.data.log) setProgressLog(res.data.log);
      } catch {}
    }, 1000);

    try {
      const response = await axios.post(`${API_BASE}/api/universal_execute`, {
        command: rawText,
        session_id: currentJobId,
        platform_config: {
          persona: 'SmartStaff, an elite Senior Tech Recruiter. The user may be speaking via voice-to-text, so be forgiving with typos and ASR errors. Keep replies under 3 sentences and warm in tone. When you finish screening, remind the user that they can click the Send Interview Invite buttons for candidates with score 80 or above, and Send Rejection for the rest.',
          industry: 'Human Resources and Hiring',
          available_tools: [{
            tag_name: 'PROCESS_RESUMES',
            description: 'Trigger ONLY when the user explicitly asks you to screen, rank, or process the resumes. Do not invent candidate names.',
            expected_params: 'job_description'
          }]
        }
      });

      const reply = response.data.reply;
      const tableData = response.data.table_data;

      updateActiveChat(c => ({
        ...c,
        messages: [...c.messages, { sender: 'bot', text: reply, tableData }]
      }));

      // Speak, then resume listening if in voice mode.
      speak(reply, () => {
        if (voiceModeRef.current && !listeningRef.current) {
          // Brief pause so the mic doesn't catch the tail of TTS.
          setTimeout(() => startListening(), 250);
        }
      });
    } catch (error) {
      const msg = 'I lost connection to the server. Please make sure the backend is running on port 8000.';
      updateActiveChat(c => ({
        ...c,
        messages: [...c.messages, { sender: 'bot', text: msg }]
      }));
      speak(msg);
    } finally {
      setIsThinking(false);
      clearInterval(progressInterval);
      setProgressLog('');
    }
  };

  /* =================== uploads (deterministic — no LLM in the loop) =================== */
  const appendUserMessage = (text) => {
    updateActiveChat(c => {
      const next = { ...c, messages: [...c.messages, { sender: 'user', text }] };
      if (c.title === 'New Session' || !c.title) {
        next.title = text.slice(0, 38) + (text.length > 38 ? '…' : '');
      }
      return next;
    });
  };

  const appendBotMessage = (text, tableData = null, { speakIt = true, sourcePrompt = null, actions = null } = {}) => {
    updateActiveChat(c => ({
      ...c,
      // ``sourcePrompt`` is null on regular messages; when set it tells the
      // renderer to draw the AI / Mix / Custom buttons under the bubble.
      // ``actions`` is a generic array of inline buttons — used to guide the
      // recruiter step-by-step (upload questions, upload resumes, run screening).
      messages: [...c.messages, { sender: 'bot', text, tableData, sourcePrompt, actions }]
    }));
    if (speakIt) {
      speak(text, () => {
        if (voiceModeRef.current && !listeningRef.current) {
          setTimeout(() => startListening(), 250);
        }
      });
    }
  };

  const runScreening = async () => {
    setIsThinking(true);
    setProgressLog('');

    const progressInterval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/progress`);
        if (res.data.log) setProgressLog(res.data.log);
      } catch {}
    }, 1000);

    try {
      const response = await axios.post(`${API_BASE}/api/run_screening`, {
        session_id: currentJobId,
      });
      const data = response.data || {};
      // Tag every candidate row with the currently-active job so the
      // Candidates page can filter its list by JD. Without this tag the
      // Candidates page ends up aggregating rows across every past
      // screening and switching JDs doesn't change the visible list.
      const tagged = Array.isArray(data.table_data)
        ? data.table_data.map(r => ({ ...r, Job_Id: currentJobId }))
        : data.table_data;
      appendBotMessage(data.reply, tagged);

      // (Removed) The in-chat "where should the OA questions come from?"
      // prompt used to fire here when data.needs_question_source was true.
      // OA generation is now triggered only from the Preview Invite flow on
      // the Candidates page, which already shows the question-source picker
      // with full context — keeping the chat focused on screening results.
    } catch {
      appendBotMessage("I couldn't run the screening — please check the backend logs.");
    } finally {
      setIsThinking(false);
      clearInterval(progressInterval);
      setProgressLog('');
    }
  };

  // ── Generate the OA after the recruiter picks a source from the prompt ──
  const generateAssessment = async (jobId, source) => {
    setIsThinking(true);
    appendUserMessage(
      source === 'ai'     ? 'Use AI-generated questions'
    : source === 'mix'    ? 'Mix uploaded + AI'
    :                       'Use my uploaded questions',
    );
    try {
      const res = await axios.post(`${API_BASE}/api/assessment/generate`, {
        session_id: jobId, question_source: source,
      });
      const d = res.data || {};
      if (d.status !== 'success') {
        appendBotMessage(d.message || "I couldn't build the assessment. Try a different source.");
        return;
      }
      // Patch the freshly-minted URLs into the most recent ResultsTable
      // message so the Email Preview can pick them up immediately.
      if (Array.isArray(d.table_data) && d.table_data.length > 0) {
        // Re-tag with the job id so the Candidates page filter keeps
        // working after the URLs are patched in.
        const taggedForPatch = d.table_data.map(r => ({ ...r, Job_Id: jobId }));
        setChats(prev => prev.map(c => {
          if (c.id !== activeChatId) return c;
          const messages = [...(c.messages || [])];
          for (let i = messages.length - 1; i >= 0; i--) {
            if (Array.isArray(messages[i].tableData) && messages[i].tableData.length > 0) {
              messages[i] = { ...messages[i], tableData: taggedForPatch };
              break;
            }
          }
          return { ...c, messages, assessment_url: d.assessment_url };
        }));
      }
      const counts = d.counts || {};
      const label =
        source === 'ai'     ? 'AI-generated'
      : source === 'mix'    ? 'Mix · uploaded + AI'
      :                       'From your uploaded bank';
      appendBotMessage(
        `✅ OA assessments are ready (${label}). Level 1: ${counts.L1 || 0}, ` +
        `Level 2: ${counts.L2 || 0}, Level 3: ${counts.L3 || 0} questions.\n\n` +
        `Open any candidate row and click **Preview Invite** to send the link.`,
        null,
        { speakIt: false },
      );
      if (d.assessment_url) {
        appendBotMessage(
          `📎 Primary link (Level 1):\n${d.assessment_url}`,
          null,
          { speakIt: false },
        );
      }
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      appendBotMessage(`Couldn't generate the assessment: ${msg}`);
    } finally {
      setIsThinking(false);
    }
  };

  const uploadJDFile = async (file, force) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', '');
    if (force) formData.append('force', '1');
    // Note: question_source is NOT sent here. The backend now defers OA
    // generation until /api/assessment/generate is called — which only
    // happens after the recruiter screens the resumes and picks a source.
    return axios.post(`${API_BASE}/api/upload_jd`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  };

  const applyJDUploadSuccess = (data, fallbackFilename) => {
    const newJobId  = data.session_id || data.job_id;
    const jdTitle   = data.jd_title || fallbackFilename;
    const url       = data.assessment_url || '';
    const jdNum     = data.jd_number_display || '';
    const titleForChat = jdNum ? `${jdNum} · ${jdTitle.slice(0, 32)}` : jdTitle.slice(0, 38);
    if (newJobId) {
      setChats(prev => prev.map(c => c.id === activeChatId
        ? {
            ...c, job_id: newJobId, jd_title: jdTitle,
            assessment_url: url, jd_number: jdNum, title: titleForChat,
          }
        : c));
      setActiveJobId(newJobId);
    }
    setUploads(u => ({ ...u, jd: true }));

    const reply = data.suggested_reply || 'Got the job description.';
    appendBotMessage(reply);

    if (jdNum) {
      appendBotMessage(
        `📋 Assigned identifier: ${jdNum} — you can find this job any time on the Jobs page by searching for ${jdNum}.`,
        null,
        { speakIt: false }
      );
    }

    // First branch in the guided workflow: ask whether the recruiter wants
    // to upload their own questions to the bank now, or jump straight to
    // uploading resumes. Both options live as inline buttons under one
    // bubble so the next step is unmissable.
    appendBotMessage(
      `Before we screen candidates: do you want to upload your own questions to use in the OA assessment? It's optional — if you skip, SmartStaff will write the questions later.`,
      null,
      { speakIt: true, actions: [
        { kind: 'upload-bank',    label: 'Upload my question bank', icon: FiDatabase, note: 'optional · JSON/CSV/XLSX' },
        { kind: 'upload-resumes', label: 'Skip — upload resumes',   icon: FiUsers,    primary: true },
      ]},
    );
    if (Array.isArray(data.evicted_jobs) && data.evicted_jobs.length > 0) {
      const list = data.evicted_jobs
        .map(e => `${e.jd_number ? 'JD-' + String(e.jd_number).padStart(4, '0') : (e.job_id || '?')}${e.jd_title ? ' (' + e.jd_title + ')' : ''}`)
        .join(', ');
      appendBotMessage(
        `🗑 At the 100-job limit — evicted oldest: ${list}.`,
        null,
        { speakIt: false }
      );
    }
  };

  const handleJDUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    appendUserMessage(`Uploaded job description: ${file.name}`);
    setIsThinking(true);

    try {
      const response = await uploadJDFile(file, false);
      const data = response.data || {};

      if (data.status === 'duplicate') {
        // Ask the user via the chat itself — they can answer with the system
        // confirm() dialog (works in every browser).
        const yes = confirm(
          (data.suggested_reply || 'This job description already exists. Upload again as a new job?') +
          '\n\n• Click OK to upload it again (creates a new JD number).\n• Click Cancel to switch to the existing job.'
        );
        if (yes) {
          appendBotMessage('Re-uploading as a new job…', null, { speakIt: false });
          const retry = await uploadJDFile(file, true);
          if (retry.data.status === 'success') {
            applyJDUploadSuccess(retry.data, file.name);
          } else {
            appendBotMessage(retry.data.suggested_reply || 'Re-upload failed.', null, { speakIt: false });
          }
        } else {
          // Switch to the existing job.
          const existingId = data.existing_job_id;
          setChats(prev => prev.map(c => c.id === activeChatId
            ? { ...c, job_id: existingId, jd_title: data.existing_jd_title, assessment_url: data.assessment_url, jd_number: data.existing_jd_number_display, title: `${data.existing_jd_number_display || ''} · ${(data.existing_jd_title || '').slice(0, 28)}` }
            : c));
          if (existingId) setActiveJobId(existingId);
          appendBotMessage(
            `Switched to existing ${data.existing_jd_number_display || ''} — ${data.existing_jd_title || ''}.`,
            null, { speakIt: false }
          );
        }
      } else if (data.status === 'success') {
        applyJDUploadSuccess(data, file.name);
      } else {
        appendBotMessage(data.suggested_reply || 'Upload failed.', null, { speakIt: false });
      }
    } catch {
      appendBotMessage('Upload failed. Is the backend running on port 8000?');
    } finally {
      setIsThinking(false);
      event.target.value = '';
    }
  };

  // Upload a custom-questions file (JSON/CSV/XLSX) into the bank.
  // Triggered from the in-chat "Upload my question bank" action button.
  const handleQuestionBankUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    appendUserMessage(`Uploaded question bank: ${file.name}`);
    setIsThinking(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_BASE}/api/questions/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data || {};
      if (d.ok) {
        const total = d.total ?? d.stats?.total ?? d.added;
        appendBotMessage(
          `📚 Added ${d.added} questions to your bank (${total} total).` +
          (d.warnings?.length ? ` Note: ${d.warnings.length} row(s) were skipped.` : ''),
          null,
          { speakIt: false, actions: [
            { kind: 'upload-resumes', label: 'Upload candidate resumes', icon: FiUsers, primary: true },
            { kind: 'upload-bank',    label: 'Upload more questions',    icon: FiUpload },
          ]},
        );
      } else {
        appendBotMessage(
          `Couldn't import that file: ${d.message || 'unknown error'}.`,
          null, { speakIt: false },
        );
      }
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      const hint = e.response?.status === 403
        ? ' (admin accounts only can upload to the bank)'
        : '';
      appendBotMessage(`Couldn't upload the question bank: ${msg}${hint}`, null, { speakIt: false });
    } finally {
      setIsThinking(false);
    }
  };

  // Dispatch a click from a ChatActions button to the right handler.
  const handleChatAction = (action) => {
    switch (action.kind) {
      case 'upload-bank':     return questionBankInputRef.current?.click();
      case 'upload-resumes':  return resumeInputRef.current?.click();
      case 'upload-jd':       return jdInputRef.current?.click();
      case 'paste-skills':    return setSkillsModalOpen(true);
      case 'run-screening':   return runScreening();
      default:                return;
    }
  };

  // ── Skills-only path: paste a comma-separated skill list and run with it
  //    instead of uploading a JD doc. Useful when the recruiter just knows
  //    the stack and doesn't have a JD handy.
  const submitSkillsOnly = async (rawSkills, roleTitle) => {
    setIsThinking(true);
    setSkillsModalOpen(false);
    appendUserMessage(`Submitted skills only: ${rawSkills.split(/[\n,]/).filter(s => s.trim()).slice(0, 5).join(', ')}…`);
    try {
      const res = await axios.post(`${API_BASE}/api/upload_jd_skills`, {
        skills: rawSkills,
        title:  roleTitle || '',
      });
      const data = res.data || {};
      if (data.status === 'success') {
        // Reuse the existing JD-success path so chat title + assessment URL
        // wiring stays consistent.
        applyJDUploadSuccess(data, '(skills only)');
      } else if (data.status === 'duplicate') {
        appendBotMessage(data.suggested_reply || 'That skill list is already on file.', null, { speakIt: false });
      } else {
        appendBotMessage(data.suggested_reply || 'Couldn\'t accept those skills — please try again.', null, { speakIt: false });
      }
    } catch (e) {
      const msg = e.response?.data?.suggested_reply || e.message || 'Network error.';
      appendBotMessage(`Skills upload failed: ${msg}`, null, { speakIt: false });
    } finally {
      setIsThinking(false);
    }
  };

  const handleResumeUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const count = files.length;
    appendUserMessage(`Uploaded ${count} resume${count === 1 ? '' : 's'}`);
    setIsThinking(true);

    // currentJobId already falls back to 'local_react_user' when the chat is
    // a pre-multi-job legacy one. The backend will return a clear error if no
    // JD exists in that session, instead of us blocking the upload here.

    const formData = new FormData();
    for (let i = 0; i < count; i++) formData.append('files', files[i]);
    formData.append('session_id', currentJobId);

    try {
      const response = await axios.post(`${API_BASE}/api/upload_resumes`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const reply = response.data.suggested_reply || `Got ${count} resume${count === 1 ? '' : 's'}.`;
      if (response.data.status === 'success') {
        setUploads(u => ({ ...u, resumes: count }));
      }
      // Attach an explicit "Run screening" button under the bot's confirmation
      // — replaces the old auto-screen so the recruiter stays in control of
      // when the (slow) ranking step kicks off.
      const wantsScreeningPrompt = response.data.status === 'success' && response.data.has_jd;
      appendBotMessage(
        reply,
        null,
        wantsScreeningPrompt
          ? { actions: [
              { kind: 'run-screening', label: 'Run screening now', icon: FiPlayCircle, primary: true },
              { kind: 'upload-resumes', label: 'Add more resumes',  icon: FiUsers },
            ]}
          : undefined,
      );
      setIsThinking(false);
      event.target.value = '';
      return;
    } catch {
      appendBotMessage('Upload failed. Is the backend running on port 8000?');
    }
    setIsThinking(false);
    event.target.value = '';
  };

  /* =================== session mgmt =================== */
  const handleSubmit = (e) => {
    e.preventDefault();
    triggerMessage(inputText);
  };

  const handleNewChat = async () => {
    stopSpeaking();
    stopListening();
    // Do NOT call /api/reset — it would wipe ALL jobs. A new chat just starts a
    // fresh local conversation; the next JD upload mints its own job_id.
    const newChat = {
      id: Date.now(),
      title: 'New Session',
      job_id: null,
      jd_title: '',
      assessment_url: '',
      messages: [{ sender: 'bot', text: "Fresh session ready. Upload a job description to begin — each role gets its own unique assessment link." }]
    };
    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);
    setUploads({ jd: false, resumes: 0 });
  };

  const selectChat = async (id) => {
    if (id === activeChatId) return;
    stopSpeaking();
    stopListening();
    setActiveChatId(id);
    // Update the global "active job" so the Candidates / Analytics / Dashboard
    // pages start showing data for THIS chat's JD.
    const chat = chats.find(c => c.id === id);
    if (chat?.job_id) setActiveJobId(chat.job_id);
  };

  const deleteChat = (id, e) => {
    e.stopPropagation();
    const remaining = chats.filter(c => c.id !== id);
    if (remaining.length === 0) {
      const fallback = {
        id: Date.now(),
        title: 'New Session',
        messages: [{ sender: 'bot', text: 'Ready when you are!' }]
      };
      setChats([fallback]);
      setActiveChatId(fallback.id);
    } else {
      setChats(remaining);
      if (activeChatId === id) setActiveChatId(remaining[0].id);
    }
  };

  /* =================== render =================== */
  const lastBotIndex = (() => {
    for (let i = activeChat.messages.length - 1; i >= 0; i--) {
      if (activeChat.messages[i].sender === 'bot') return i;
    }
    return -1;
  })();

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Resume Screening</h1>
          <p className="subtitle">Talk to SmartStaff, your AI recruiter, and let it rank candidates for you.</p>
        </div>
      </div>

      <div className="screening-layout">
        {/* ============ TOOLS PANEL ============ */}
        <aside className="tools-panel">
          <button className="btn-primary" onClick={handleNewChat}>
            <FiPlusSquare /> New session
          </button>

          <div className="section-title">Recent sessions</div>
          <div className="history-list">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={`history-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => selectChat(chat.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <FiMessageSquare size={14} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chat.title}
                  </span>
                </div>
                <button
                  className="icon-btn"
                  onClick={(e) => deleteChat(chat.id, e)}
                  aria-label="Delete session"
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="tools-section">
            <div className="section-title" style={{ margin: '0 0 8px 4px' }}>Workflow</div>

            {/* Question source moved out of JD upload — the operator now picks
                it AFTER resumes are screened, via the in-chat prompt that
                appears with the results. */}

            <input
              type="file"
              ref={jdInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.doc,.docx"
              onChange={handleJDUpload}
            />
            {/* Hidden trigger for the in-chat "Upload my question bank" action. */}
            <input
              type="file"
              ref={questionBankInputRef}
              style={{ display: 'none' }}
              accept=".json,.csv,.xlsx"
              onChange={handleQuestionBankUpload}
            />
            <button
              className={`action-btn ${!uploads.jd ? 'action-btn-highlight' : ''}`}
              onClick={() => jdInputRef.current?.click()}
              disabled={isThinking}
            >
              <FiFileText /> 1. Upload Job Description
              {uploads.jd && <span className="upload-tag">added</span>}
            </button>
            {/* Skills-only alternative — recruiter pastes a skill list when
                they don't have a JD doc on hand. Uses the same downstream
                flow (resume upload → screen → OA) as a real JD. */}
            <button
              className="action-btn"
              onClick={() => setSkillsModalOpen(true)}
              disabled={isThinking}
              style={{ marginTop: 6, opacity: 0.92 }}
              title="Skip the JD doc — just paste the skills you're hiring for"
            >
              <FiClipboard /> &nbsp;or · paste skills only
            </button>

            <input
              type="file"
              ref={resumeInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.doc,.docx"
              multiple
              onChange={handleResumeUpload}
            />
            <button
              className="action-btn"
              onClick={() => resumeInputRef.current?.click()}
              disabled={isThinking}
            >
              <FiUsers /> 2. Upload Resumes
              {uploads.resumes > 0 && <span className="upload-tag">{uploads.resumes}</span>}
            </button>
          </div>
        </aside>

        {/* ============ CHAT INTERFACE ============ */}
        <section className="chat-interface">
          <div className="chat-header">
            <div className="agent-info">
              <div className="agent-avatar">G</div>
              <div className="agent-meta">
                <h3>SmartStaff</h3>
                <span>
                  <span className="pulse-dot" />
                  {isThinking ? 'Processing' : isSpeaking ? 'Speaking' : isListening ? 'Listening' : 'Online'}
                </span>
              </div>
            </div>

            <div className="chat-header-actions">
              <label className="voice-toggle" title="Hands-free conversation mode">
                <input
                  type="checkbox"
                  checked={voiceMode}
                  onChange={(e) => setVoiceMode(e.target.checked)}
                />
                <span className="toggle-track" />
                <span>Voice mode</span>
              </label>

              <button
                className="icon-btn"
                onClick={() => {
                  setVoiceEnabled(v => {
                    if (v) stopSpeaking();
                    return !v;
                  });
                }}
                title={voiceEnabled ? 'Mute SmartStaff' : 'Unmute SmartStaff'}
                aria-label="Toggle voice"
              >
                {voiceEnabled ? <FiVolume2 /> : <FiVolumeX />}
              </button>

              {isSpeaking && (
                <button
                  className="icon-btn"
                  onClick={stopSpeaking}
                  title="Stop speaking"
                  aria-label="Stop speaking"
                >
                  <FiSquare />
                </button>
              )}
            </div>
          </div>

          <div className="messages-area">
            {activeChat.messages.map((msg, index) => (
              <div key={index} className={`message-wrapper ${msg.sender}`}>
                {msg.sender === 'bot' && <div className="msg-avatar">G</div>}
                <div className={`message-bubble ${msg.tableData ? 'has-table' : ''}`}>
                  {msg.sender === 'bot' ? (
                    <>
                      <TypewriterText
                        text={msg.text || (msg.tableData ? 'Here are your ranked candidates:' : '(no response)')}
                        animate={index === lastBotIndex}
                        instant={!!msg.tableData}
                      />
                      <ResultsTable tableData={msg.tableData} onPreview={openPreview} />
                      {msg.actions && msg.actions.length > 0 && (
                        <ChatActions
                          actions={msg.actions}
                          disabled={isThinking}
                          onClick={handleChatAction}
                        />
                      )}
                      {msg.sourcePrompt && (
                        <SourcePromptButtons
                          jobId={msg.sourcePrompt.jobId}
                          disabled={isThinking}
                          onPick={(src) => generateAssessment(msg.sourcePrompt.jobId, src)}
                        />
                      )}
                    </>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="message-wrapper bot">
                <div className="msg-avatar">G</div>
                <div className="message-bubble">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span className="typing-dots"><span /><span /><span /></span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Thinking…</span>
                  </span>
                  {progressLog && <div className="progress-log">{progressLog}</div>}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {(isListening || isSpeaking) && (
            <div className={`live-banner ${isSpeaking ? 'speaking' : ''}`}>
              <span className="wave" style={{ color: isSpeaking ? 'var(--accent)' : 'var(--danger)' }}>
                <span /><span /><span /><span /><span />
              </span>
              {isSpeaking
                ? <span>SmartStaff is speaking…</span>
                : (
                  <span className="interim">
                    {interimTranscript || 'Listening… speak now.'}
                  </span>
                )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="composer">
            <button
              type="button"
              className={`mic-btn ${isListening ? 'listening' : isSpeaking ? 'speaking' : ''}`}
              onClick={isListening ? stopListening : startListening}
              disabled={isThinking}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
              title={isListening ? 'Stop listening' : 'Tap to speak'}
            >
              {isListening ? <FiMicOff /> : <FiMic />}
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isListening ? 'Listening…' :
                isThinking ? 'SmartStaff is thinking…' :
                'Type a message or tap the mic to speak'
              }
              disabled={isThinking}
            />

            <button
              type="submit"
              className="send-btn"
              disabled={!inputText.trim() || isThinking}
              aria-label="Send"
            >
              <FiSend />
            </button>
          </form>
        </section>
      </div>

      <EmailPreviewModal data={previewEmail} onClose={() => setPreviewEmail(null)} />
      <SkillsOnlyModal
        open={skillsModalOpen}
        busy={isThinking}
        onClose={() => setSkillsModalOpen(false)}
        onSubmit={submitSkillsOnly}
      />
    </div>
  );
};

export default VoiceScreening;
