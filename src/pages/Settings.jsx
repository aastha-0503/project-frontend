import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  FiSave, FiTrash2, FiVolume2, FiVolumeX, FiSun, FiMoon, FiMonitor,
  FiCheckCircle, FiXCircle, FiKey, FiZap, FiEye, FiEyeOff,
  FiUpload, FiFileText, FiDatabase, FiAlertTriangle,
  FiGlobe, FiPhone, FiAlertCircle, FiInfo, FiCode, FiClock,
} from 'react-icons/fi';
import { loadTheme, saveTheme, API_BASE } from '../lib/enterprise.js';

const SETTINGS_KEY = 'geeky_ai_settings';

const defaults = {
  voiceName: '',
  rate: 0.82,       // slow + warm — most natural for an Indian recruiter voice
  pitch: 0.97,
  autoListen: true,
  botVoiceEnabled: true, // master mute for the bot's voice (TTS); affects every page
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
};

const Settings = () => {
  const [settings, setSettings] = useState(loadSettings);
  const [voices, setVoices] = useState([]);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState(loadTheme);

  // ── AI Provider state ──
  const [aiConfig, setAiConfig] = useState({
    gemini: { configured: false, has_key: false },
    public_url: { value: '', is_localhost: true, assessment_base: '' },
    twilio: { configured: false, account_sid_preview: '', auth_token_preview: '', from_number: '' },
    code_runner: { piston_url: '', piston_enabled: false, languages: [] },
    invites: { ttl_seconds: 48 * 3600, ttl_hours: 48 },
  });

  // Invite TTL picker state — admin chooses how long candidate OA links stay
  // valid by default. EmailPreviewModal reads this when minting per-candidate
  // tokens, so changes here apply to every new email after Save.
  const [ttlChoice, setTtlChoice]   = useState(48 * 3600);
  const [savingTtl, setSavingTtl]   = useState(false);
  const [ttlMsg,    setTtlMsg]      = useState(null);

  useEffect(() => {
    if (aiConfig?.invites?.ttl_seconds) setTtlChoice(aiConfig.invites.ttl_seconds);
  }, [aiConfig?.invites?.ttl_seconds]);

  const TTL_OPTIONS = [
    { value:       60 * 60, label: '1 hour',       hint: 'Tight — only for synchronous interviews' },
    { value:  6 * 60 * 60, label: '6 hours',       hint: 'Same-day deadline' },
    { value: 12 * 60 * 60, label: '12 hours',      hint: 'End-of-day deadline' },
    { value: 24 * 60 * 60, label: '24 hours',      hint: 'Next-day deadline' },
    { value: 48 * 60 * 60, label: '48 hours (recommended)', hint: 'Cross-timezone friendly · default' },
    { value:  7 * 24 * 60 * 60, label: '7 days',   hint: 'Loose — for passive pipelines' },
  ];

  const saveTtl = async () => {
    setSavingTtl(true);
    setTtlMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/api/config/invite_ttl`, {
        ttl_seconds: ttlChoice, persist: true,
      });
      const d = res.data || {};
      setTtlMsg({
        ok: true,
        text: `Saved. New invite links will be valid for ${d.ttl_hours || 0} hours from when you click "Open in mail client".`,
      });
      await refreshAiConfig();
    } catch (e) {
      setTtlMsg({ ok: false, text: describeAxiosError(e) });
    } finally {
      setSavingTtl(false);
    }
  };

  // Piston URL state for the Code Runner card.
  const [pistonInput, setPistonInput] = useState('');
  const [savingPiston, setSavingPiston] = useState(false);
  const [pistonMsg, setPistonMsg] = useState(null);

  const savePistonUrl = async (urlOverride) => {
    setSavingPiston(true);
    setPistonMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/api/config/piston_url`, {
        piston_url: (urlOverride !== undefined ? urlOverride : pistonInput).trim(),
        persist: true,
      });
      const d = res.data || {};
      setPistonMsg({
        ok: true,
        text: d.piston_enabled
          ? `Saved. ${d.languages.length} languages reported by Piston.`
          : `Saved — empty URL, so coding questions use the local subprocess fallback (${d.languages.join(', ')}).`,
      });
      setPistonInput('');
      await refreshAiConfig();
    } catch (e) {
      setPistonMsg({ ok: false, text: describeAxiosError(e) });
    } finally {
      setSavingPiston(false);
    }
  };
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState(null);  // null | {ok, message?, model?}

  // ── Public URL + Twilio state ──
  // Both controls live in the same Settings page because they belong to the
  // same problem: "make the assessment link work outside localhost AND let
  // Geeky AI place real phone calls." We persist both together via the
  // backend's /api/config endpoints.
  const [publicUrlInput, setPublicUrlInput] = useState('');
  const [savingPublicUrl, setSavingPublicUrl] = useState(false);
  const [publicUrlMsg, setPublicUrlMsg]   = useState(null);

  const [twilioSid, setTwilioSid]    = useState('');
  const [twilioTok, setTwilioTok]    = useState('');
  const [twilioFrom, setTwilioFrom]  = useState('');
  const [showTok, setShowTok]        = useState(false);
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [testingTwilio, setTestingTwilio] = useState(false);
  const [twilioMsg, setTwilioMsg]    = useState(null);

  const savePublicUrl = async () => {
    setSavingPublicUrl(true);
    setPublicUrlMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/api/config/public_url`, {
        public_base_url: publicUrlInput.trim(),
        persist: true,
      });
      const d = res.data || {};
      setPublicUrlMsg({
        ok: true,
        text: `Saved. OA links will now use ${d.assessment_base || d.public_base_url}.` +
          (d.is_localhost ? ' Note: this is still a localhost URL — set a public tunnel (e.g. ngrok) for candidates on other devices to open the link.' : ''),
      });
      setPublicUrlInput('');
      await refreshAiConfig();
    } catch (e) {
      setPublicUrlMsg({ ok: false, text: describeAxiosError(e) });
    } finally {
      setSavingPublicUrl(false);
    }
  };

  const saveTwilioConfig = async () => {
    setSavingTwilio(true);
    setTwilioMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/api/config/twilio`, {
        // Only send the fields that changed — backend reads ``null`` as
        // "leave alone", but our form sends "" for untouched fields, so we
        // pass them as-is and the backend treats empty string as "clear".
        account_sid: twilioSid,
        auth_token:  twilioTok,
        from_number: twilioFrom,
        persist: true,
      });
      setTwilioMsg({ ok: true, text: res.data?.twilio_configured ? 'Twilio credentials saved.' : 'Saved — but Twilio still isn\'t fully configured.' });
      setTwilioSid(''); setTwilioTok(''); setTwilioFrom('');
      await refreshAiConfig();
    } catch (e) {
      setTwilioMsg({ ok: false, text: describeAxiosError(e) });
    } finally {
      setSavingTwilio(false);
    }
  };

  const testTwilio = async () => {
    setTestingTwilio(true);
    setTwilioMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/api/config/twilio/test`);
      const d = res.data || {};
      if (d.ok) {
        setTwilioMsg({ ok: true, text: `Twilio responded — account "${d.account_name}" · from ${d.from_number}.` });
      } else {
        setTwilioMsg({ ok: false, text: d.message || 'Twilio test failed.' });
      }
    } catch (e) {
      setTwilioMsg({ ok: false, text: describeAxiosError(e) });
    } finally {
      setTestingTwilio(false);
    }
  };

  // ── Question bank state ──
  const qbInputRef = React.useRef(null);
  const [bank, setBank] = useState({ stats: { total: 0, by_type: {}, by_level: {}, uploads: 0 }, uploads: [] });
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMsg, setBankMsg] = useState(null); // { ok, text }

  const refreshBank = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/questions/bank?limit=1`);
      setBank({
        stats:   res.data?.stats   || { total: 0, by_type: {}, by_level: {}, uploads: 0 },
        uploads: res.data?.uploads || [],
      });
    } catch {
      // Backend may be old build or unreachable — just leave state untouched.
    }
  }, []);

  useEffect(() => { refreshBank(); }, [refreshBank]);

  const handleBankUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBankBusy(true);
    setBankMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_BASE}/api/questions/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data || {};
      if (d.ok) {
        setBankMsg({ ok: true, text: `Added ${d.added} questions (${d.total} total in bank).${d.warnings?.length ? ' Some rows were skipped.' : ''}` });
        await refreshBank();
      } else {
        setBankMsg({ ok: false, text: d.message || 'Upload failed.' });
      }
    } catch (err) {
      const m = err.response?.data?.message || err.message || 'Upload failed.';
      setBankMsg({ ok: false, text: m });
    } finally {
      setBankBusy(false);
    }
  };

  const handleDeleteUpload = async (uploadId) => {
    if (!confirm('Delete every question from this upload? This can\'t be undone.')) return;
    setBankBusy(true);
    try {
      await axios.delete(`${API_BASE}/api/questions/upload/${uploadId}`);
      await refreshBank();
      setBankMsg({ ok: true, text: 'Upload removed.' });
    } catch (err) {
      setBankMsg({ ok: false, text: err.response?.data?.message || err.message });
    } finally {
      setBankBusy(false);
    }
  };

  const handleClearBank = async () => {
    if (!confirm('Clear EVERY question from the bank? This wipes all uploads.')) return;
    setBankBusy(true);
    try {
      await axios.post(`${API_BASE}/api/questions/clear`);
      await refreshBank();
      setBankMsg({ ok: true, text: 'Question bank cleared.' });
    } catch (err) {
      setBankMsg({ ok: false, text: err.response?.data?.message || err.message });
    } finally {
      setBankBusy(false);
    }
  };

  const changeTheme = (t) => {
    setTheme(t);
    saveTheme(t);
  };

  const refreshAiConfig = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/config`);
      setAiConfig(res.data || {});
    } catch (e) {
      setAiConfig({ gemini: { configured: false, has_key: false } });
    }
  }, []);

  useEffect(() => { refreshAiConfig(); }, [refreshAiConfig]);

  const describeAxiosError = (e) => {
    if (!e) return 'Unknown error.';
    if (e.response) {
      const status = e.response.status;
      const body = e.response.data || {};
      // Pull the actual endpoint that 404'd from the request config so the
      // error message tells the truth, instead of always blaming Gemini.
      const path = e.config?.url ? e.config.url.replace(/^https?:\/\/[^/]+/, '') : '';
      if (status === 404) {
        return `Backend doesn't recognise ${path || 'the endpoint we called'} (404). Restart the backend (Ctrl+C, then \`python main.py\`) so it picks up the new routes.`;
      }
      if (status === 500) {
        return `Backend error (500) on ${path || 'this endpoint'}: ${body.message || body.detail || 'see backend logs'}.`;
      }
      return `Backend returned ${status}${path ? ` on ${path}` : ''}: ${body.message || body.detail || JSON.stringify(body).slice(0, 200)}`;
    }
    if (e.request) {
      return 'Could not reach the backend. Is `python main.py` running on port 8000?';
    }
    return e.message || 'Unknown error.';
  };

  const saveGeminiKey = async () => {
    setSavingKey(true);
    setTestResult(null);
    try {
      const saveRes = await axios.post(`${API_BASE}/api/config/gemini`, {
        api_key: geminiKeyInput.trim(),
        persist: true,
      });
      if (saveRes.data?.status === 'error') {
        setTestResult({ ok: false, message: saveRes.data.message || 'Save failed.' });
        return;
      }
      setGeminiKeyInput('');
      await refreshAiConfig();
      // Auto-test after save
      const t = await axios.post(`${API_BASE}/api/config/gemini/test`);
      setTestResult(t.data);
      // If the test passed, refresh config one more time so the "connected" pill flips.
      if (t.data?.ok) await refreshAiConfig();
    } catch (e) {
      setTestResult({ ok: false, message: describeAxiosError(e) });
    } finally {
      setSavingKey(false);
    }
  };

  const clearGeminiKey = async () => {
    if (!confirm('Clear the saved Gemini API key? Question generation will fall back to Groq.')) return;
    setSavingKey(true);
    try {
      await axios.post(`${API_BASE}/api/config/gemini`, { api_key: '', persist: true });
      setGeminiKeyInput('');
      setTestResult(null);
      await refreshAiConfig();
    } catch (e) {
      setTestResult({ ok: false, message: describeAxiosError(e) });
    } finally {
      setSavingKey(false);
    }
  };

  const testGeminiKey = async () => {
    setTestingKey(true);
    setTestResult(null);
    try {
      const t = await axios.post(`${API_BASE}/api/config/gemini/test`);
      setTestResult(t.data);
    } catch (e) {
      setTestResult({ ok: false, message: describeAxiosError(e) });
    } finally {
      setTestingKey(false);
    }
  };

  useEffect(() => {
    const load = () => {
      const list = window.speechSynthesis?.getVoices?.() || [];
      setVoices(list);
    };
    load();
    window.speechSynthesis?.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load);
  }, []);

  const update = (patch) => setSettings(s => ({ ...s, ...patch }));

  const save = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const testVoice = () => {
    if (!window.speechSynthesis) return;
    if (settings.botVoiceEnabled === false) {
      alert("Bot voice is currently turned off. Toggle it on to hear the test.");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      "Hi, I'm Geeky AI, your AI recruiter. This is how I'll sound during screenings."
    );
    const v = voices.find(v => v.name === settings.voiceName);
    if (v) u.voice = v;
    u.rate = settings.rate;
    u.pitch = settings.pitch;
    window.speechSynthesis.speak(u);
  };

  const clearLocalData = async () => {
    if (!confirm("This clears all local chat history and resets the backend session. Continue?")) return;
    localStorage.removeItem('geeky_ai_chats');
    try { await axios.post('http://127.0.0.1:8000/api/reset'); } catch {}
    alert("Local data cleared. Refresh to start fresh.");
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Tune the voice and behavior of your AI recruiter.</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600 }}>Appearance</h3>
        <p className="subtitle" style={{ marginBottom: 18 }}>Switch between light and dark mode.</p>
        <div className="theme-toggle">
          <button
            className={theme === 'light' ? 'active' : ''}
            onClick={() => changeTheme('light')}
          >
            <FiSun /> Light
          </button>
          <button
            className={theme === 'dark' ? 'active' : ''}
            onClick={() => changeTheme('dark')}
          >
            <FiMoon /> Dark
          </button>
          <button
            className={theme === 'system' ? 'active' : ''}
            onClick={() => changeTheme('system')}
          >
            <FiMonitor /> System
          </button>
        </div>
      </div>

      {/* ── AI Provider ── */}
      <div className="card">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiZap color="var(--primary)" /> AI Provider
        </h3>
        <p className="subtitle" style={{ marginBottom: 18 }}>
          Gemini is used to generate the OA questions and the L1 interview questions.
          Groq is the automatic fallback when Gemini isn't configured.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className={`summary-pill ${aiConfig?.gemini?.configured ? 'invite' : 'reject'}`}
                style={{ padding: '6px 14px' }}>
            {aiConfig?.gemini?.configured ? <FiCheckCircle /> : <FiXCircle />}
            Gemini · {aiConfig?.gemini?.configured ? 'connected' : 'not configured'}
            {aiConfig?.gemini?.model && <span style={{ marginLeft: 6, fontSize: '0.74rem', opacity: 0.8 }}>({aiConfig.gemini.model})</span>}
          </span>
          <span className="summary-pill invite" style={{ padding: '6px 14px' }}>
            <FiCheckCircle /> Groq · fallback ready
          </span>
        </div>

        {aiConfig?.gemini?.has_key && (
          <div style={{
            padding: '10px 14px', background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius)', fontSize: '0.86rem',
            color: 'var(--text-muted)', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span>
              <FiKey style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Current key: <code style={{ fontSize: '0.85rem' }}>{aiConfig.gemini.key_preview || '(stored)'}</code>
            </span>
            <button className="btn-secondary" onClick={clearGeminiKey} disabled={savingKey} style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
              <FiTrash2 /> Clear
            </button>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="gem-key">
            {aiConfig?.gemini?.has_key ? 'Replace API key' : 'Gemini API key'}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="gem-key"
              type={showKey ? 'text' : 'password'}
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              style={{
                flex: 1,
                padding: '10px 12px', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '0.92rem',
                background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowKey(s => !s)}
              title={showKey ? 'Hide key' : 'Show key'}
              style={{ padding: '0 14px' }}
            >
              {showKey ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
          <span className="hint">
            Get a free key at <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>aistudio.google.com</a>.
            Stored on the backend in <code>geeky_ai_config.json</code> — never sent to the browser again.
          </span>
        </div>

        {testResult && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: '0.88rem',
            background: testResult.ok ? 'var(--success-soft)' : 'var(--danger-soft)',
            color: testResult.ok ? '#166534' : '#991b1b',
            border: `1px solid ${testResult.ok ? 'var(--success)' : 'var(--danger)'}`,
          }}>
            {testResult.ok ? (
              <>
                <FiCheckCircle /> Gemini is responding correctly
                {testResult.model ? <> (model: <code>{testResult.model}</code>)</> : null}.
                {testResult.sample && (
                  <div style={{ marginTop: 6, fontSize: '0.78rem', opacity: 0.85 }}>
                    Sample reply: <code>{JSON.stringify(testResult.sample)}</code>
                  </div>
                )}
              </>
            ) : (
              <><FiXCircle /> {testResult.message || 'Connection failed.'}</>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-primary"
            onClick={saveGeminiKey}
            disabled={!geminiKeyInput.trim() || savingKey}
          >
            <FiSave /> {savingKey ? 'Saving…' : 'Save & test'}
          </button>
          <button
            className="btn-secondary"
            onClick={testGeminiKey}
            disabled={!aiConfig?.gemini?.has_key || testingKey}
          >
            <FiZap /> {testingKey ? 'Testing…' : 'Test current key'}
          </button>
        </div>
      </div>

      {/* ── Public Backend URL (for OA links to open outside localhost) ── */}
      <div className="card">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiGlobe color="var(--primary)" /> Public backend URL
        </h3>
        <p className="subtitle" style={{ marginBottom: 18 }}>
          The address candidates use to open their assessment link. <strong>Localhost
          URLs (127.0.0.1) only work on your own machine</strong> — to send links over
          email you need a tunnel or a real public host.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className={`summary-pill ${aiConfig?.public_url?.is_localhost ? 'reject' : 'invite'}`}
                style={{ padding: '6px 14px' }}>
            {aiConfig?.public_url?.is_localhost ? <FiAlertTriangle /> : <FiCheckCircle />}
            {aiConfig?.public_url?.is_localhost ? 'Localhost only · candidates can\'t reach this' : 'Publicly reachable'}
          </span>
        </div>

        <div style={{
          padding: '10px 14px', background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius)', fontSize: '0.86rem',
          color: 'var(--text-muted)', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>
            <FiGlobe style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Currently: <code style={{ fontSize: '0.85rem' }}>{aiConfig?.public_url?.value || '(unset)'}</code>
          </span>
          {aiConfig?.public_url?.assessment_base && (
            <span style={{ fontSize: '0.8rem' }}>OA base: <code>{aiConfig.public_url.assessment_base}</code></span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="public-url">New public URL</label>
          <input
            id="public-url"
            type="text"
            value={publicUrlInput}
            onChange={(e) => setPublicUrlInput(e.target.value)}
            placeholder="https://abc-123.ngrok-free.app  or  https://hire.yourcompany.com"
            style={{
              width: '100%',
              padding: '10px 12px', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '0.92rem',
              background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
            }}
          />
          <span className="hint">
            <FiInfo style={{ verticalAlign: '-2px', marginRight: 4 }} />
            Paste any HTTPS URL that reaches this backend from the public internet, then click Save.
            Localhost won't work for candidates on other devices.
          </span>
        </div>

        {/* How-to-get-a-public-URL guide — collapsible so it doesn't dominate
            the card when the URL is already set, but expanded by default
            while localhost is the active value. */}
        <details
          open={!!aiConfig?.public_url?.is_localhost}
          style={{
            marginBottom: 14, padding: '12px 14px',
            background: 'var(--bg-subtle, #f1f5f9)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)' }}>
            How do I get a public URL?
          </summary>
          <div style={{ marginTop: 10, fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Three free options — pick whichever fits:

            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <strong style={{ color: 'var(--text-main)' }}>1 · ngrok (most reliable)</strong>
              <div style={{ marginTop: 4 }}>Quick signup at <a href="https://dashboard.ngrok.com/signup" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>dashboard.ngrok.com/signup</a>, then in a terminal:</div>
              <pre style={{
                marginTop: 6, padding: '8px 10px', background: '#0f172a', color: '#e2e8f0',
                borderRadius: 6, fontSize: '0.78rem', overflowX: 'auto', margin: 0,
              }}>
{`ngrok config add-authtoken <YOUR_TOKEN>
ngrok http 8000`}
              </pre>
              <div style={{ marginTop: 4 }}>Copy the printed <code>https://&hellip;.ngrok-free.app</code> URL.</div>
            </div>

            <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <strong style={{ color: 'var(--text-main)' }}>2 · Cloudflare Tunnel (no signup)</strong>
              <div style={{ marginTop: 4 }}>
                Download <a href="https://github.com/cloudflare/cloudflared/releases/latest" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>cloudflared</a>, then:
              </div>
              <pre style={{
                marginTop: 6, padding: '8px 10px', background: '#0f172a', color: '#e2e8f0',
                borderRadius: 6, fontSize: '0.78rem', overflowX: 'auto', margin: 0,
              }}>
{`cloudflared tunnel --url http://localhost:8000`}
              </pre>
              <div style={{ marginTop: 4 }}>Returns <code>https://&hellip;.trycloudflare.com</code>. No account needed.</div>
            </div>

            <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <strong style={{ color: 'var(--text-main)' }}>3 · localtunnel (Node.js)</strong>
              <pre style={{
                marginTop: 6, padding: '8px 10px', background: '#0f172a', color: '#e2e8f0',
                borderRadius: 6, fontSize: '0.78rem', overflowX: 'auto', margin: 0,
              }}>
{`npx localtunnel --port 8000`}
              </pre>
              <div style={{ marginTop: 4 }}>Candidates see a one-time interstitial the first visit, but no signup.</div>
            </div>

            <div style={{ marginTop: 10, fontSize: '0.78rem', opacity: 0.85 }}>
              💡 The tunnel URL changes every time you restart these tools — paste the fresh URL
              here before sending new invite emails. For production, point this at your real
              deployment hostname instead.
            </div>
          </div>
        </details>

        {publicUrlMsg && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: '0.88rem',
            background: publicUrlMsg.ok ? 'var(--success-soft, rgba(34,197,94,0.1))' : 'var(--danger-soft, rgba(239,68,68,0.1))',
            color: publicUrlMsg.ok ? '#166534' : '#991b1b',
            border: `1px solid ${publicUrlMsg.ok ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}`,
          }}>
            {publicUrlMsg.ok ? <FiCheckCircle /> : <FiAlertCircle />} {publicUrlMsg.text}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={savePublicUrl}
          disabled={!publicUrlInput.trim() || savingPublicUrl}
        >
          <FiSave /> {savingPublicUrl ? 'Saving…' : 'Save public URL'}
        </button>
      </div>

      {/* ── Invite link expiry (per-candidate OA tokens) ── */}
      <div className="card">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiClock color="var(--primary)" /> Invite link expiry
        </h3>
        <p className="subtitle" style={{ marginBottom: 18 }}>
          How long each candidate's unique OA link stays live after you send it.
          Independent of which tunnel you use — the expiry is enforced by Geeky AI
          itself, so candidates see a clean "this link has expired" page after the window.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className="summary-pill invite" style={{ padding: '6px 14px' }}>
            <FiCheckCircle /> Currently · {aiConfig?.invites?.ttl_hours || 0} hours
          </span>
          <span className="summary-pill" style={{ padding: '6px 14px', background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
            Single-use enforced (token marked spent on submit)
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="invite-ttl">Default validity window</label>
          <select
            id="invite-ttl"
            value={ttlChoice}
            onChange={(e) => setTtlChoice(Number(e.target.value))}
            style={{
              width: '100%', padding: '10px 12px', fontSize: '0.92rem',
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
              background: 'var(--bg-surface)', color: 'var(--text-main)',
              fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
            }}
          >
            {TTL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.hint}
              </option>
            ))}
          </select>
          <span className="hint">
            Applies to every new invite minted from now on. Already-sent links keep their original
            expiry — re-open the candidate's Preview Invite and re-send to refresh the window.
          </span>
        </div>

        {ttlMsg && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: '0.88rem',
            background: ttlMsg.ok ? 'var(--success-soft, rgba(34,197,94,0.1))' : 'var(--danger-soft, rgba(239,68,68,0.1))',
            color: ttlMsg.ok ? '#166534' : '#991b1b',
            border: `1px solid ${ttlMsg.ok ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}`,
          }}>
            {ttlMsg.ok ? <FiCheckCircle /> : <FiAlertCircle />} {ttlMsg.text}
          </div>
        )}

        <button className="btn-primary" onClick={saveTtl} disabled={savingTtl || ttlChoice === aiConfig?.invites?.ttl_seconds}>
          <FiSave /> {savingTtl ? 'Saving…' : 'Save link expiry'}
        </button>
      </div>

      {/* ── Twilio (real outbound phone calls) ── */}
      <div className="card">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiPhone color="var(--primary)" /> Phone calls (Twilio)
        </h3>
        <p className="subtitle" style={{ marginBottom: 18 }}>
          Paste your Twilio credentials to let Geeky AI place <strong>real outbound phone calls</strong>
          to candidates for the Level 1 interview. Without these, the interview falls back to
          browser-based voice mode (recruiter must stay on the line).
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className={`summary-pill ${aiConfig?.twilio?.configured ? 'invite' : 'reject'}`}
                style={{ padding: '6px 14px' }}>
            {aiConfig?.twilio?.configured ? <FiCheckCircle /> : <FiXCircle />}
            Twilio · {aiConfig?.twilio?.configured ? 'ready for real calls' : 'not configured'}
          </span>
          {aiConfig?.twilio?.from_number && (
            <span className="summary-pill" style={{ padding: '6px 14px', background: 'var(--bg-subtle)' }}>
              From: <code>{aiConfig.twilio.from_number}</code>
            </span>
          )}
        </div>

        <div style={{
          padding: '12px 14px', background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.35)', color: '#854d0e',
          borderRadius: 'var(--radius)', fontSize: '0.82rem',
          lineHeight: 1.55, marginBottom: 14, display: 'flex', gap: 10,
        }}>
          <FiInfo size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Twilio also needs the public URL above to be reachable</strong> — Twilio's
            servers fetch the call instructions from <code>{aiConfig?.public_url?.value || '(public URL)'}/api/interview/twiml/…</code>.
            So localhost won't work for real phone calls either.
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="twilio-sid">Account SID</label>
          <input
            id="twilio-sid"
            type="text"
            value={twilioSid}
            onChange={(e) => setTwilioSid(e.target.value)}
            placeholder={aiConfig?.twilio?.account_sid_preview || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '0.92rem',
              background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
            }}
          />
        </div>
        <div className="form-group">
          <label htmlFor="twilio-tok">Auth token</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="twilio-tok"
              type={showTok ? 'text' : 'password'}
              value={twilioTok}
              onChange={(e) => setTwilioTok(e.target.value)}
              placeholder={aiConfig?.twilio?.auth_token_preview || '••••••••••••••••••••••••••••••••'}
              style={{
                flex: 1,
                padding: '10px 12px', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '0.92rem',
                background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
              }}
            />
            <button
              type="button" className="btn-secondary"
              onClick={() => setShowTok(s => !s)}
              style={{ padding: '0 14px' }}
              title={showTok ? 'Hide token' : 'Show token'}
            >
              {showTok ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="twilio-from">From number (E.164)</label>
          <input
            id="twilio-from"
            type="tel"
            value={twilioFrom}
            onChange={(e) => setTwilioFrom(e.target.value)}
            placeholder={aiConfig?.twilio?.from_number || '+15551234567'}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '0.92rem',
              background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
            }}
          />
          <span className="hint">
            Use the full international format (e.g. <code>+15551234567</code>). This is the
            Twilio-owned number candidates will see when Geeky AI calls them.
          </span>
        </div>

        {twilioMsg && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: '0.88rem',
            background: twilioMsg.ok ? 'var(--success-soft, rgba(34,197,94,0.1))' : 'var(--danger-soft, rgba(239,68,68,0.1))',
            color: twilioMsg.ok ? '#166534' : '#991b1b',
            border: `1px solid ${twilioMsg.ok ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}`,
          }}>
            {twilioMsg.ok ? <FiCheckCircle /> : <FiAlertCircle />} {twilioMsg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={saveTwilioConfig}
            disabled={savingTwilio || (!twilioSid && !twilioTok && !twilioFrom)}
          >
            <FiSave /> {savingTwilio ? 'Saving…' : 'Save Twilio credentials'}
          </button>
          <button
            className="btn-secondary"
            onClick={testTwilio}
            disabled={testingTwilio || !aiConfig?.twilio?.configured}
          >
            <FiZap /> {testingTwilio ? 'Testing…' : 'Test connection'}
          </button>
        </div>
      </div>

      {/* ── Code Runner (Piston URL for coding-question execution) ── */}
      <div className="card">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiCode color="var(--primary)" /> Code Runner
        </h3>
        <p className="subtitle" style={{ marginBottom: 18 }}>
          When a candidate clicks "Run code" on a coding question, the snippet runs against
          its test cases. Pick one of two execution backends below.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className={`summary-pill ${aiConfig?.code_runner?.piston_enabled ? 'invite' : 'reject'}`}
                style={{ padding: '6px 14px' }}>
            {aiConfig?.code_runner?.piston_enabled ? <FiCheckCircle /> : <FiAlertTriangle />}
            {aiConfig?.code_runner?.piston_enabled
              ? `Piston · ${(aiConfig.code_runner.languages || []).length} languages`
              : 'Piston off · using local subprocess fallback'}
          </span>
          {(aiConfig?.code_runner?.languages || []).slice(0, 6).map(l => (
            <span key={l} className="summary-pill" style={{ padding: '6px 14px', background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
              {l}
            </span>
          ))}
        </div>

        <div style={{
          padding: '12px 14px', background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.35)', color: '#854d0e',
          borderRadius: 'var(--radius)', fontSize: '0.82rem',
          lineHeight: 1.55, marginBottom: 14, display: 'flex', gap: 10,
        }}>
          <FiInfo size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            The public Piston API at <code>emkc.org</code> is whitelist-only as of Feb 2026 —
            it returns 401 for new users. <strong>For multi-language support, self-host it</strong>
            (one Docker command, below). Until you do, coding questions run via local
            subprocess: Python is guaranteed, others depend on what's on PATH.
          </div>
        </div>

        <div style={{
          padding: '10px 14px', background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius)', fontSize: '0.86rem',
          color: 'var(--text-muted)', marginBottom: 14,
        }}>
          Currently: <code>{aiConfig?.code_runner?.piston_url || '(local subprocess only)'}</code>
        </div>

        <div className="form-group">
          <label htmlFor="piston-url">Piston URL (optional)</label>
          <input
            id="piston-url"
            type="text"
            value={pistonInput}
            onChange={(e) => setPistonInput(e.target.value)}
            placeholder="http://localhost:2000/api/v2  or  leave empty for local mode"
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '0.92rem',
              background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
            }}
          />
          <span className="hint">
            Self-host Piston in one line:&nbsp;
            <code style={{ background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>
              docker run -d -p 2000:2000 ghcr.io/engineer-man/piston
            </code>
            &nbsp;Then paste <code>http://localhost:2000/api/v2</code> here.
          </span>
        </div>

        {pistonMsg && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: '0.88rem',
            background: pistonMsg.ok ? 'var(--success-soft, rgba(34,197,94,0.1))' : 'var(--danger-soft, rgba(239,68,68,0.1))',
            color: pistonMsg.ok ? '#166534' : '#991b1b',
            border: `1px solid ${pistonMsg.ok ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}`,
          }}>
            {pistonMsg.ok ? <FiCheckCircle /> : <FiAlertCircle />} {pistonMsg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => savePistonUrl()} disabled={savingPiston}>
            <FiSave /> {savingPiston ? 'Saving…' : 'Save Piston URL'}
          </button>
          {aiConfig?.code_runner?.piston_url && (
            <button className="btn-secondary" onClick={() => savePistonUrl('')} disabled={savingPiston}>
              <FiTrash2 /> Use local fallback
            </button>
          )}
        </div>
      </div>

      {/* ── Question Bank (admin upload + stats) ── */}
      <div className="card">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiDatabase color="var(--primary)" /> Question Bank
        </h3>
        <p className="subtitle" style={{ marginBottom: 18 }}>
          Upload your own questions and Geeky AI can blend them into the OA assessments —
          pick the source mode from the dropdown on the Voice Screening page when you
          upload each JD.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className="summary-pill" style={{ padding: '6px 14px', background: 'var(--bg-subtle, #f1f5f9)' }}>
            <FiFileText /> {bank.stats.total} questions
          </span>
          <span className="summary-pill" style={{ padding: '6px 14px', background: 'var(--bg-subtle, #f1f5f9)' }}>
            {bank.stats.uploads} uploads
          </span>
          {Object.entries(bank.stats.by_level || {}).map(([lvl, n]) => (
            <span key={lvl} className="summary-pill" style={{ padding: '6px 14px', background: 'var(--bg-subtle, #f1f5f9)' }}>
              {lvl}: {n}
            </span>
          ))}
        </div>

        <div style={{
          padding: '14px 16px', borderRadius: 'var(--radius)', marginBottom: 14,
          background: 'var(--bg-subtle, #f1f5f9)', fontSize: '0.84rem',
          color: 'var(--text-muted)', lineHeight: 1.55,
        }}>
          <strong style={{ color: 'var(--text-main)' }}>Accepted formats:</strong>{' '}
          <code>.json</code>, <code>.csv</code>, <code>.xlsx</code>.<br />
          <strong style={{ color: 'var(--text-main)' }}>Required columns:</strong>{' '}
          <code>type</code> (mcq | msq | descriptive | coding), <code>question</code>,
          <code> options</code> (pipe-separated, e.g. <code>"a|b|c|d"</code>),
          <code> correct_index</code> (0-based, or letter like "B"),
          <code> skill</code>, <code>difficulty</code> (easy/medium/hard),
          <code> level</code> (L1/L2/L3, optional).
        </div>

        <input
          ref={qbInputRef} type="file" style={{ display: 'none' }}
          accept=".json,.csv,.xlsx"
          onChange={handleBankUpload}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={() => qbInputRef.current?.click()}
            disabled={bankBusy}
          >
            <FiUpload /> {bankBusy ? 'Uploading…' : 'Upload questions'}
          </button>
          <button
            className="btn-secondary"
            onClick={handleClearBank}
            disabled={bankBusy || bank.stats.total === 0}
            style={{ color: 'var(--danger, #ef4444)' }}
          >
            <FiTrash2 /> Clear bank
          </button>
        </div>

        {bankMsg && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '0.86rem',
            background: bankMsg.ok ? 'var(--success-soft, rgba(34,197,94,0.1))' : 'var(--danger-soft, rgba(239,68,68,0.1))',
            color: bankMsg.ok ? '#166534' : '#991b1b',
            border: `1px solid ${bankMsg.ok ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {bankMsg.ok ? <FiCheckCircle /> : <FiAlertTriangle />}
            {bankMsg.text}
          </div>
        )}

        {bank.uploads.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{
              fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)',
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
            }}>
              Recent uploads
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bank.uploads.slice().reverse().slice(0, 8).map((u) => (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                }}>
                  <FiFileText style={{ color: 'var(--text-muted)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.filename || '(unnamed)'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {u.count} questions · {new Date(u.uploaded_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => handleDeleteUpload(u.id)}
                    disabled={bankBusy}
                    title="Delete this upload"
                    aria-label="Delete this upload"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600 }}>Voice</h3>
          <p className="subtitle" style={{ marginBottom: 18 }}>Controls how Geeky AI sounds when it speaks.</p>

          {/* Master mute — applies everywhere (InterviewRoom, VoiceScreening, Settings test). */}
          <div className="form-group" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '12px 14px',
            background: settings.botVoiceEnabled ? 'var(--success-soft, rgba(34,197,94,0.08))' : 'var(--danger-soft, rgba(239,68,68,0.08))',
            border: `1px solid ${settings.botVoiceEnabled ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}`,
            borderRadius: 'var(--radius)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {settings.botVoiceEnabled ? <FiVolume2 /> : <FiVolumeX />}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  Bot voice · {settings.botVoiceEnabled ? 'on' : 'off'}
                </div>
                <div className="hint" style={{ marginTop: 2 }}>
                  {settings.botVoiceEnabled
                    ? "Geeky AI will speak its replies out loud."
                    : "Geeky AI will stay silent — text only. Useful in quiet environments."}
                </div>
              </div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, cursor: 'pointer', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={settings.botVoiceEnabled !== false}
                onChange={(e) => update({ botVoiceEnabled: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', inset: 0, cursor: 'pointer',
                background: settings.botVoiceEnabled ? 'var(--success, #22c55e)' : 'var(--border-color, #9ca3af)',
                borderRadius: 26, transition: '0.2s',
              }} />
              <span style={{
                position: 'absolute', top: 3, left: settings.botVoiceEnabled ? 25 : 3,
                width: 20, height: 20, background: '#fff', borderRadius: '50%',
                transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="voice">Voice</label>
            <select
              id="voice"
              value={settings.voiceName}
              onChange={(e) => update({ voiceName: e.target.value })}
            >
              <option value="">System default (auto-picks Indian English when available)</option>
              {(() => {
                const isIndian = (v) =>
                     /en[-_]IN/i.test(v.lang)
                  || /\bIndia(n)?\b/i.test(v.name)
                  || /heera|ravi|kalpana|prabhat|aarav|aditi|raveena|veena|chitra|hemant|prashant|priya|kabir|sneha/i.test(v.name);
                const indian = voices.filter(isIndian);
                const otherEnglish = voices.filter(v => !isIndian(v) && /^en/i.test(v.lang));
                const other = voices.filter(v => !isIndian(v) && !/^en/i.test(v.lang));
                return (
                  <>
                    {indian.length > 0 && (
                      <optgroup label="🇮🇳 Indian English (recommended)">
                        {indian.map(v => (
                          <option key={v.voiceURI} value={v.name}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherEnglish.length > 0 && (
                      <optgroup label="Other English voices">
                        {otherEnglish.map(v => (
                          <option key={v.voiceURI} value={v.name}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {other.length > 0 && (
                      <optgroup label="Other languages">
                        {other.map(v => (
                          <option key={v.voiceURI} value={v.name}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                );
              })()}
            </select>
            <span className="hint">
              For the most natural recruiter persona, pick an <strong>Indian English (en-IN)</strong> voice.
              On Windows you may need to install one from <em>Settings → Time &amp; Language → Speech → Add voices</em>.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="rate">Speaking rate · {settings.rate.toFixed(2)}×</label>
            <input
              id="rate" type="range" min="0.5" max="1.5" step="0.05"
              value={settings.rate}
              onChange={(e) => update({ rate: parseFloat(e.target.value) })}
            />
            <span className="hint">
              <strong>0.85–0.95</strong> sounds most human for interviews — slow enough for the candidate to follow, fast enough to feel natural.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="pitch">Pitch · {settings.pitch.toFixed(2)}</label>
            <input
              id="pitch" type="range" min="0.5" max="1.5" step="0.05"
              value={settings.pitch}
              onChange={(e) => update({ pitch: parseFloat(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autoListen}
                onChange={(e) => update({ autoListen: e.target.checked })}
              />
              Auto-listen after Geeky AI finishes speaking (hands-free mode)
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn-secondary" onClick={testVoice}>
              <FiVolume2 /> Test voice
            </button>
            <button className="btn-primary" onClick={save}>
              <FiSave /> {saved ? 'Saved' : 'Save settings'}
            </button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600 }}>Data</h3>
          <p className="subtitle" style={{ marginBottom: 18 }}>
            All chat history is stored locally in your browser. The screened-resume report stays on the backend.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href="http://127.0.0.1:8000/api/download_report"
              target="_blank"
              rel="noreferrer"
              className="action-btn"
              style={{ justifyContent: 'flex-start' }}
            >
              Download latest report (xlsx)
            </a>
            <button className="action-btn" style={{ justifyContent: 'flex-start', color: 'var(--danger)' }} onClick={clearLocalData}>
              <FiTrash2 /> Clear local data &amp; reset backend
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
