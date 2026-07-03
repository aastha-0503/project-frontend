// Enterprise feature utilities — theme, pipeline stages, notes, helpers.

// API base — driven by VITE_API_BASE at build time so the same bundle can
// point at localhost (dev), a Render deployment, ngrok, etc.  Falls back to
// localhost so `npm run dev` works with no env var.
//
// On Netlify: Site settings → Environment variables → add
//   VITE_API_BASE = https://your-render-backend.onrender.com
// Then redeploy — Vite inlines the value into the JS bundle at build time.
// When no VITE_API_BASE is set, point the API at whatever host is serving
// the frontend, on port 8000.  This lets the same dev build work from
// localhost AND from other devices on the LAN (e.g. http://10.5.49.100:5173
// → http://10.5.49.100:8000).  Hard-coding 0.0.0.0 only worked on the host
// machine — remote browsers would try to reach their own 0.0.0.0.
function defaultApiBase() {
  if (typeof window === 'undefined') return 'http://localhost:8001';
  const host = window.location.hostname || 'localhost';
  return `${window.location.protocol}//${host}:8001`;
}

export const API_BASE = (
  import.meta.env.VITE_API_BASE ||
  defaultApiBase()
).replace(/\/+$/, '');

// Legacy default — only used for pages opened with no active job selected.
// Per-JD job ids are minted by the backend and stored on each chat record.
export const LEGACY_SESSION_ID = 'local_react_user';

export const ACTIVE_JOB_KEY = 'geeky_ai_active_job';

export function getActiveJobId() {
  try {
    return localStorage.getItem(ACTIVE_JOB_KEY) || LEGACY_SESSION_ID;
  } catch {
    return LEGACY_SESSION_ID;
  }
}

export function setActiveJobId(jobId) {
  try {
    if (jobId) localStorage.setItem(ACTIVE_JOB_KEY, jobId);
    else       localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {}
}

// Back-compat alias: anything that imported SESSION_ID still works, but it now
// resolves to the currently active job at call time.
export const SESSION_ID = LEGACY_SESSION_ID;

export const INTERVIEW_THRESHOLD = 50;
export const ASSESSMENT_PASS_PERCENT = 50;

/* =========================================================================
   Interview languages (Web Speech API uses BCP-47 codes). `native` is shown
   in the picker so a recruiter sees the script; `name` is the English label.
   ========================================================================= */
export const INTERVIEW_LANGUAGES = [
  { code: 'en-IN', name: 'English (India)', native: 'English' },
  { code: 'hi-IN', name: 'Hindi',     native: 'हिन्दी' },
  { code: 'ta-IN', name: 'Tamil',     native: 'தமிழ்' },
  { code: 'te-IN', name: 'Telugu',    native: 'తెలుగు' },
  { code: 'kn-IN', name: 'Kannada',   native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr-IN', name: 'Marathi',   native: 'मराठी' },
  { code: 'bn-IN', name: 'Bengali',   native: 'বাংলা' },
  { code: 'gu-IN', name: 'Gujarati',  native: 'ગુજરાતી' },
  { code: 'pa-IN', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ' },
];

export const INTERVIEW_LANG_KEY = 'geeky_ai_interview_lang';

export function loadInterviewLang() {
  try { return localStorage.getItem(INTERVIEW_LANG_KEY) || 'en-IN'; }
  catch { return 'en-IN'; }
}

export function saveInterviewLang(code) {
  try { localStorage.setItem(INTERVIEW_LANG_KEY, code); } catch {}
}

/* =========================================================================
   Theme (light / dark / system)
   ========================================================================= */
export const THEME_KEY = 'geeky_ai_theme';

export function applyTheme(theme) {
  const t = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (theme === 'dark' ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
}

export function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'light';
  } catch {
    return 'light';
  }
}

export function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  applyTheme(theme);
}

/* =========================================================================
   Pipeline stages
   ========================================================================= */
export const STAGES = [
  { key: 'new',        label: 'New',        cls: 'new' },
  { key: 'shortlist',  label: 'Shortlisted', cls: 'shortlist' },
  { key: 'tested',     label: 'Test Passed', cls: 'tested' },
  { key: 'interview',  label: 'Interviewing', cls: 'interview' },
  { key: 'offered',    label: 'Offered',     cls: 'offered' },
  { key: 'hired',      label: 'Hired',       cls: 'hired' },
  { key: 'rejected',   label: 'Rejected',    cls: 'rejected' },
];

export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

export const CANDIDATE_STATE_KEY = 'geeky_ai_candidate_state';

export function loadCandidateState() {
  try {
    const raw = localStorage.getItem(CANDIDATE_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCandidateState(state) {
  try { localStorage.setItem(CANDIDATE_STATE_KEY, JSON.stringify(state)); } catch {}
}

export function candidateKey(row) {
  return row?.File_Name || row?.Email || row?.Candidate_Name || '';
}

export function getStage(state, row, defaultStage = 'new') {
  const k = candidateKey(row);
  return state[k]?.stage || defaultStage;
}

export function setStage(state, row, stage) {
  const k = candidateKey(row);
  if (!k) return state;
  const next = { ...state, [k]: { ...(state[k] || {}), stage } };
  saveCandidateState(next);
  return next;
}

export function getNotes(state, row) {
  const k = candidateKey(row);
  return state[k]?.notes || [];
}

export function addNote(state, row, text) {
  const k = candidateKey(row);
  if (!k || !text.trim()) return state;
  const existing = state[k] || {};
  const note = { text: text.trim(), at: new Date().toISOString() };
  const next = {
    ...state,
    [k]: { ...existing, notes: [...(existing.notes || []), note] },
  };
  saveCandidateState(next);
  return next;
}

export function deleteNote(state, row, idx) {
  const k = candidateKey(row);
  if (!k) return state;
  const existing = state[k] || {};
  const next = {
    ...state,
    [k]: { ...existing, notes: (existing.notes || []).filter((_, i) => i !== idx) },
  };
  saveCandidateState(next);
  return next;
}

/* =========================================================================
   Helpers
   ========================================================================= */
export function buildMailto(to, subject, body) {
  const enc = encodeURIComponent;
  return `mailto:${to}?subject=${enc(subject || '')}&body=${enc(body || '')}`;
}

export function relativeTime(iso) {
  if (!iso) return '';
  try {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}
