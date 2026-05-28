import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  FiPhone, FiPhoneOff, FiMic, FiMicOff, FiVolume2, FiX, FiSkipForward,
  FiRotateCw, FiSave, FiCheckCircle
} from 'react-icons/fi';
import {
  API_BASE, getActiveJobId,
  INTERVIEW_LANGUAGES, loadInterviewLang, saveInterviewLang,
} from '../lib/enterprise.js';

const SETTINGS_KEY = 'geeky_ai_settings';
const loadVoiceSettings = () => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
};

/* =========================================================================
   Step 1 — Phone confirmation modal
   ========================================================================= */
export const PhoneConfirmModal = ({ candidate, onClose, onConfirm }) => {
  const [phone, setPhone] = useState(candidate?.Phone || '');
  const [error, setError] = useState('');
  const [twilioReady, setTwilioReady] = useState(false);
  const [fromNumber, setFromNumber] = useState('');
  const [language, setLanguage] = useState(loadInterviewLang());

  useEffect(() => {
    setPhone(candidate?.Phone || '');
    setError('');
  }, [candidate]);

  useEffect(() => {
    let alive = true;
    axios.get(`${API_BASE}/api/interview/config`)
      .then(r => {
        if (!alive) return;
        setTwilioReady(!!r.data.twilio_configured);
        setFromNumber(r.data.from_number || '');
      })
      .catch(() => { if (alive) setTwilioReady(false); });
    return () => { alive = false; };
  }, [candidate]);

  if (!candidate) return null;

  const isValid = (p) => {
    const digits = (p || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
  };

  const handleConfirm = (mode) => {
    if (!isValid(phone)) {
      setError('Please enter a valid phone number (10–13 digits).');
      return;
    }
    saveInterviewLang(language);
    onConfirm(phone.trim(), mode, language);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2>
            <FiPhone color="var(--success)" />
            Start L1 Interview Call
          </h2>
          <button className="icon-btn" onClick={onClose}><FiX /></button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label>Candidate</label>
            <div className="value" style={{ fontWeight: 600 }}>{candidate.Candidate_Name}</div>
          </div>
          {candidate.Email && (
            <div className="modal-field">
              <label>Email</label>
              <div className="value">{candidate.Email}</div>
            </div>
          )}
          <div className="modal-field">
            <label>Phone number {candidate.Phone ? '(extracted from resume — verify)' : '(not found in resume)'}</label>
            <input
              type="tel"
              className={`name-input ${error ? 'error' : ''}`}
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(''); }}
              placeholder="e.g. +91 98765 43210"
              style={{
                width: '100%', padding: '11px 14px',
                border: `1px solid ${error ? 'var(--danger)' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius)',
                fontSize: '1rem', fontFamily: 'inherit',
                background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
              }}
            />
            <div style={{ fontSize: '0.78rem', color: error ? 'var(--danger)' : 'var(--text-muted)', marginTop: 6 }}>
              {error || 'Edit the number if needed. Geeky AI will use this to identify the call.'}
            </div>
          </div>

          <div className="modal-field">
            <label>Interview language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                width: '100%', padding: '11px 14px',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
                fontSize: '1rem', fontFamily: 'inherit',
                background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none',
              }}
            >
              {INTERVIEW_LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>
                  {l.native} — {l.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
              Geeky AI will ask the questions and listen in this language. Works in browser
              mode (Chrome/Edge). The candidate's spoken language pack must be installed on
              this device for the most natural voice.
            </div>
          </div>

          {twilioReady ? (
            <div className="assessment-callout" style={{ marginTop: 8, background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,182,212,0.05))', borderColor: 'rgba(16,185,129,0.3)' }}>
              <div className="ico" style={{ background: 'var(--success)' }}><FiPhone size={14} /></div>
              <div style={{ flex: 1, fontSize: '0.84rem' }}>
                <strong>Real outbound phone call enabled (Twilio).</strong> Geeky AI will dial the candidate from {fromNumber || 'your configured Twilio number'} and conduct the interview entirely on the phone — no browser needed on their end.
              </div>
            </div>
          ) : (
            <div className="assessment-callout" style={{ marginTop: 8 }}>
              <div className="ico"><FiVolume2 size={14} /></div>
              <div style={{ flex: 1, fontSize: '0.84rem' }}>
                <strong>Browser-based voice interview.</strong> Geeky AI will speak the questions through your speakers and capture the candidate's answers via your microphone. For a real outbound phone call, set the Twilio env vars on the backend.
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          {twilioReady ? (
            <>
              <button className="btn-secondary" onClick={() => handleConfirm('browser')} title="Use browser mode anyway">
                Use browser
              </button>
              <button className="btn-call" onClick={() => handleConfirm('phone')}>
                <FiPhone /> Place real call
              </button>
            </>
          ) : (
            <button className="btn-call" onClick={() => handleConfirm('browser')}>
              <FiPhone /> Start Interview
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Step 2 — Interview Room (TTS + STT loop)
   ========================================================================= */
export const InterviewRoom = ({ candidate, phone, language = 'en-IN', onClose, onSaved }) => {
  const [prep, setPrep] = useState(null);      // { interview_id, questions, intro, outro, role_title }
  const [stage, setStage] = useState('loading'); // loading | intro | asking | listening | between | done | saving
  const [qIndex, setQIndex] = useState(-1);
  const [transcript, setTranscript] = useState([]);
  const [interim, setInterim] = useState('');
  const [final, setFinal] = useState('');
  const [error, setError] = useState('');
  const [voiceWarning, setVoiceWarning] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const langRef = useRef(language || 'en-IN');
  const startedAtRef = useRef(new Date().toISOString());
  const recognitionRef = useRef(null);
  const voiceSettings = useRef(loadVoiceSettings());
  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  /* ---------- TTS ---------- */
  const pickedVoiceRef = useRef(null);

  /* Pick the most natural installed voice FOR THE SELECTED LANGUAGE. A voice
     whose lang exactly matches (e.g. ta-IN for Tamil) is strongly preferred;
     we fall back to the same base language (ta-*), then to any Indian voice,
     and finally to the system default — flagging a warning if nothing in the
     target language is installed so the recruiter knows to add the OS
     language pack for the best result. */
  const pickVoice = (langCode) => {
    const list = window.speechSynthesis?.getVoices?.() || [];
    if (!list.length) return null;

    const target = (langCode || langRef.current || 'en-IN').toLowerCase().replace('_', '-');
    const base   = target.split('-')[0];                 // 'ta' from 'ta-IN'

    // Honor an explicit voice choice from Settings only when it matches the
    // chosen language (otherwise we'd read Tamil text with an English voice).
    const preferred = voiceSettings.current?.voiceName;
    if (preferred) {
      const m = list.find(v => v.name === preferred && (v.lang || '').toLowerCase().startsWith(base));
      if (m) return m;
    }

    const score = (v) => {
      const n = (v.name || '').toLowerCase();
      const l = (v.lang || '').toLowerCase().replace('_', '-');
      let s = 0;
      if (l === target)            s += 300;   // exact e.g. ta-IN
      else if (l.startsWith(base)) s += 200;   // same language, other region
      else if (l.includes('-in') || /india/.test(n)) s += 40;  // any Indian voice as last resort
      // Quality bumps — neural/online variants sound dramatically more human.
      if (/\bneural\b/.test(n))  s += 40;
      if (/\bnatural\b/.test(n)) s += 30;
      if (/\bonline\b/.test(n))  s += 25;
      if (/google/i.test(n))     s += 15;
      // Prefer a warm female interviewer persona when several tie.
      if (/female|heera|aditi|raveena|veena|chitra|priya|kalpana|swara|sapna|aria|jenny/.test(n)) s += 5;
      return s;
    };

    const sorted = [...list].sort((a, b) => score(b) - score(a));
    const chosen = sorted[0];
    const matchesLang = chosen && (chosen.lang || '').toLowerCase().replace('_', '-').startsWith(base);

    if (chosen && pickedVoiceRef.current?.name !== chosen.name) {
      console.log(`[Geeky AI Interview] lang=${target} → voice: ${chosen.name} (${chosen.lang})${matchesLang ? ' ✓' : ' (no exact match)'}`);
      pickedVoiceRef.current = chosen;
    }

    if (!matchesLang && base !== 'en') {
      setVoiceWarning(
        `No ${target} voice is installed on this device, so the questions may be read with a non-native ` +
        `voice. For natural pronunciation, install the language pack (Windows: Settings → Time & Language → ` +
        `Language → Add a language → include "Text-to-speech") and reopen the interview.`
      );
    } else {
      setVoiceWarning('');
    }

    return chosen;
  };

  /* Split a paragraph into sentence-sized chunks so the voicebot doesn't
     spew one breathless run-on. Keeps trailing punctuation. */
  const splitSentences = (text) => {
    const cleaned = (text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')   // emojis
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return [];
    // Greedy split on sentence terminators but keep them attached.
    const parts = cleaned.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [cleaned];
    // Further break very long fragments on commas / dashes / semicolons so the
    // pacing feels human, not robotic.
    const out = [];
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.length <= 140) { out.push(trimmed); continue; }
      const sub = trimmed.split(/(?<=[,;:—-])\s+/);
      out.push(...sub.map(s => s.trim()).filter(Boolean));
    }
    return out;
  };

  /* Speak naturally: slow rate, longer breathing pauses between sentences,
     one chunk at a time so the browser's queue doesn't truncate long text.
     Respects both the local mute button AND the global Settings toggle. */
  const speak = useCallback((text) => new Promise((resolve) => {
    if (!text || !window.speechSynthesis) { resolve(); return; }
    try { window.speechSynthesis.cancel(); } catch {}
    if (isMuted) { resolve(); return; }
    // Re-read settings on every call so the master mute toggled on the
    // Settings page silences an in-progress interview without a refresh.
    voiceSettings.current = { ...voiceSettings.current, ...loadVoiceSettings() };
    // Honor the global "bot voice" off-switch from Settings.
    if (voiceSettings.current?.botVoiceEnabled === false) { resolve(); return; }

    const chunks = splitSentences(text);
    if (chunks.length === 0) { resolve(); return; }

    const langCode = langRef.current || 'en-IN';
    const voice = pickVoice(langCode);
    // Interview speech is intentionally slower than chat — feels thoughtful,
    // not robotic. A slightly lower pitch (0.97) gives a warmer, more
    // conversational tone.
    const baseRate  = Number(voiceSettings.current?.rate)  || 0.82;
    const basePitch = Number(voiceSettings.current?.pitch) || 0.97;
    // Pause length between sentences — 280ms approximates a natural breath.
    const pauseMs = 280;

    let idx = 0;
    const speakNext = () => {
      if (idx >= chunks.length) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(chunks[idx]);
      if (voice) u.voice = voice;
      // Always set the BCP-47 lang so engines without a dedicated voice still
      // apply the correct phoneme set / accent for the chosen language.
      u.lang = (voice && voice.lang) ? voice.lang : langCode;
      // Tiny per-sentence jitter (±4% rate, ±2% pitch) so the cadence isn't
      // metronomic — a subtle but effective "sounds human" cue.
      u.rate   = +(baseRate  * (0.96 + Math.random() * 0.08)).toFixed(3);
      u.pitch  = +(basePitch * (0.98 + Math.random() * 0.04)).toFixed(3);
      u.volume = 1.0;
      u.onend = () => {
        idx += 1;
        // Pause a bit longer at hard punctuation (.!?) than at commas, with a
        // little randomness so the breaths feel natural rather than clockwork.
        const endsHard = /[.!?]\s*$/.test(chunks[idx - 1] || '');
        const jitter = 0.85 + Math.random() * 0.4;
        setTimeout(speakNext, Math.round((endsHard ? pauseMs : pauseMs * 0.55) * jitter));
      };
      u.onerror = () => {
        idx += 1;
        setTimeout(speakNext, 80);
      };
      try { window.speechSynthesis.speak(u); }
      catch { idx += 1; setTimeout(speakNext, 80); }
    };
    speakNext();
  }), [isMuted]);

  /* ---------- STT ---------- */
  const getRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    if (recognitionRef.current) return recognitionRef.current;
    const rec = new SR();
    // Recognise speech in the interview language so an answer in, say, Telugu
    // is transcribed correctly instead of being mangled as English.
    rec.lang = langRef.current || 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;
    return rec;
  }, []);

  const startListening = useCallback(() => {
    const rec = getRecognition();
    if (!rec) {
      setError("Browser speech recognition isn't supported. Use Chrome or Edge.");
      return;
    }
    setInterim('');
    setFinal('');
    rec.onresult = (event) => {
      let it = '';
      let fin = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) fin += t + ' ';
        else it += t;
      }
      if (fin) setFinal(prev => (prev + ' ' + fin).trim());
      setInterim(it);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        setError('Microphone access denied. Please allow it in your browser settings.');
      }
    };
    rec.onend = () => {
      // If we're still in the listening stage, restart (continuous mode in some
      // browsers stops automatically after silence).
      if (stageRef.current === 'listening') {
        try { rec.start(); } catch {}
      }
    };
    try { rec.start(); } catch {}
  }, [getRecognition]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  /* ---------- Cleanup on unmount ---------- */
  useEffect(() => {
    return () => {
      try { window.speechSynthesis?.cancel(); } catch {}
      try { recognitionRef.current?.abort?.(); } catch {}
    };
  }, []);

  /* ---------- Prep questions on mount ---------- */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await axios.post(`${API_BASE}/api/interview/prepare`, {
          session_id: getActiveJobId(),
          candidate_name: candidate.Candidate_Name,
          phone,
          file_name: candidate.File_Name || '',
          language: langRef.current,
        });
        if (cancelled) return;
        // Trust the language the backend actually localised into.
        if (res.data?.language) langRef.current = res.data.language;
        setPrep(res.data);
        // Seed transcript with empty answers.
        setTranscript(res.data.questions.map(q => ({
          category: q.category,
          skill: q.skill || null,
          question: q.question,
          answer: '',
        })));
        // Start with the intro.
        setStage('intro');
        await speak(res.data.intro);
        if (cancelled) return;
        // Move to the first question.
        setQIndex(0);
        setStage('asking');
        await speak(res.data.questions[0].question);
        if (cancelled) return;
        setStage('listening');
        startListening();
      } catch (e) {
        // Surface the real reason — most often the backend hasn't been
        // restarted with the new /api/interview/* endpoints yet.
        const detail =
          e?.response?.status === 404
            ? 'The /api/interview/prepare endpoint returned 404. Restart the backend (python main.py) to pick up the new routes.'
            : e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Unknown error.';
        setError(detail);
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Move to next question ---------- */
  const captureAnswer = () => {
    const answerText = (final + ' ' + interim).trim();
    setTranscript(prev => prev.map((t, i) => i === qIndex ? { ...t, answer: answerText } : t));
    setFinal('');
    setInterim('');
  };

  const nextQuestion = async () => {
    stopListening();
    captureAnswer();

    if (!prep) return;
    const next = qIndex + 1;
    if (next >= prep.questions.length) {
      // End of interview
      setStage('between');
      await speak(prep.outro);
      setStage('done');
      return;
    }
    setQIndex(next);
    setStage('asking');
    await speak(prep.questions[next].question);
    setStage('listening');
    startListening();
  };

  const repeatQuestion = async () => {
    if (!prep) return;
    const q = prep.questions[qIndex];
    if (!q) return;
    stopListening();
    setStage('asking');
    await speak(q.question);
    setStage('listening');
    startListening();
  };

  const endInterview = async () => {
    stopListening();
    try { window.speechSynthesis?.cancel(); } catch {}
    captureAnswer();
    setStage('done');
  };

  /* ---------- Save transcript ---------- */
  const saveInterview = async () => {
    setStage('saving');
    try {
      // Make sure the current question's answer is captured first.
      const liveTranscript = transcript.map((t, i) => {
        if (i === qIndex) {
          return { ...t, answer: (final + ' ' + interim).trim() || t.answer };
        }
        return t;
      });
      await axios.post(`${API_BASE}/api/interview/save`, {
        session_id: getActiveJobId(),
        interview_id: prep?.interview_id || '',
        candidate_name: candidate.Candidate_Name,
        phone,
        file_name: candidate.File_Name || '',
        role_title: prep?.role_title || '',
        transcript: liveTranscript,
        started_at: startedAtRef.current,
        ended_at: new Date().toISOString(),
      });
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setError('Failed to save the interview. Please try again.');
      setStage('done');
    }
  };

  if (!prep && error) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-header">
            <h2>Interview unavailable</h2>
            <button className="icon-btn" onClick={onClose}><FiX /></button>
          </div>
          <div className="modal-body"><p style={{ color: 'var(--text-muted)' }}>{error}</p></div>
          <div className="modal-footer">
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = prep && qIndex >= 0 ? prep.questions[qIndex] : null;
  const totalQ = prep ? prep.questions.length : 0;
  const progressPct = totalQ > 0 ? Math.round(((qIndex + 1) / totalQ) * 100) : 0;

  return (
    <div className="modal-backdrop" onClick={() => {}}>
      <div className="interview-room" onClick={(e) => e.stopPropagation()}>
        <div className="interview-header">
          <div className="agent-info">
            <div className="agent-avatar">G</div>
            <div className="interview-meta">
              <strong>{candidate.Candidate_Name}</strong>
              <span>
                {phone}{prep?.role_title ? ` · ${prep.role_title}` : ''}
                {(() => {
                  const l = INTERVIEW_LANGUAGES.find(x => x.code === (prep?.language || language));
                  return l ? ` · ${l.native}` : '';
                })()}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#a5b4fc', fontSize: '0.85rem' }}>
              <span className="call-status-dot" />
              {stage === 'done' ? 'Call ended' :
               stage === 'saving' ? 'Saving…' :
               stage === 'loading' ? 'Connecting…' :
               'Live'}
            </span>
            <button
              className="icon-btn"
              style={{ color: 'white' }}
              onClick={() => setIsMuted(m => !m)}
              title={isMuted ? 'Unmute bot' : 'Mute bot'}
            >
              {isMuted ? <FiMicOff /> : <FiVolume2 />}
            </button>
          </div>
        </div>

        <div className="interview-body">
          {/* Left: question */}
          <div className="interview-question-pane">
            <div className="interview-progress">
              <span>{qIndex < 0 ? 'Intro' : `Question ${qIndex + 1} of ${totalQ}`}</span>
              <div className="interview-progress-bar"><div style={{ width: `${qIndex < 0 ? 0 : progressPct}%` }} /></div>
              <span>{qIndex < 0 ? '—' : `${progressPct}%`}</span>
            </div>

            <div className="interview-question-card">
              {currentQ ? (
                <>
                  <div className="interview-category-tag">
                    {currentQ.category}{currentQ.skill ? ` · ${currentQ.skill}` : ''}
                  </div>
                  <div className="interview-question-text">{currentQ.question}</div>
                </>
              ) : stage === 'done' ? (
                <>
                  <div className="interview-category-tag" style={{ background: 'var(--success-soft)', color: '#166534' }}>
                    Interview complete
                  </div>
                  <div className="interview-question-text">
                    Interview ended. Review the transcript on the right, then save it to the candidate's record.
                  </div>
                </>
              ) : (
                <div className="interview-question-text" style={{ color: 'var(--text-muted)' }}>
                  Geeky AI is greeting the candidate…
                </div>
              )}
            </div>

            <div className={`interview-bot-state ${
              stage === 'asking' || stage === 'intro' || stage === 'between' ? 'speaking' :
              stage === 'listening' ? 'listening' : 'idle'
            }`}>
              {stage === 'asking' || stage === 'intro' || stage === 'between' ? <>🔊 Geeky AI is speaking…</> :
               stage === 'listening' ? <>🎤 Listening to {candidate.Candidate_Name.split(' ')[0]}…</> :
               stage === 'saving' ? <>💾 Saving the interview…</> :
               stage === 'done' ? <>✅ Call ended — review and save when ready</> :
               <>Setting things up…</>}
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', color: '#991b1b', borderRadius: 'var(--radius)', fontSize: '0.86rem' }}>
                {error}
              </div>
            )}

            {voiceWarning && !error && (
              <div style={{ padding: '10px 14px', background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.35)', color: '#854d0e', borderRadius: 'var(--radius)', fontSize: '0.82rem' }}>
                ⚠️ {voiceWarning}
              </div>
            )}

            <div className="interview-controls">
              {stage === 'listening' && (
                <button className="btn-primary" onClick={nextQuestion}>
                  <FiSkipForward /> Next Question
                </button>
              )}
              {(stage === 'listening' || stage === 'asking') && (
                <button className="btn-secondary" onClick={repeatQuestion}>
                  <FiRotateCw /> Repeat
                </button>
              )}
              {stage === 'done' ? (
                <>
                  <button className="btn-primary" onClick={saveInterview}>
                    <FiSave /> Save transcript
                  </button>
                  <button className="btn-secondary" onClick={onClose}>Cancel</button>
                </>
              ) : stage !== 'saving' && stage !== 'loading' ? (
                <button className="btn-end-call" onClick={endInterview}>
                  <FiPhoneOff /> End Interview
                </button>
              ) : null}
            </div>
          </div>

          {/* Right: live transcript */}
          <div className="interview-transcript-pane">
            <h4>Live transcript</h4>
            {stage === 'listening' && (
              <div className="interim-area">
                {final || interim ? (
                  <>
                    <span style={{ color: 'var(--text-main)' }}>{final}</span>{' '}
                    <span style={{ color: 'var(--text-muted)' }}>{interim}</span>
                  </>
                ) : (
                  <span className="interim-placeholder">Capturing the candidate's response…</span>
                )}
              </div>
            )}
            <div className="transcript-list">
              {transcript.map((t, i) => (
                <div
                  key={i}
                  className="transcript-entry"
                  style={{
                    borderLeft: i === qIndex && stage !== 'done' ? '3px solid var(--primary)' : '3px solid transparent',
                  }}
                >
                  <div className="transcript-q">
                    Q{i + 1} · {t.category}{t.skill ? ` · ${t.skill}` : ''}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: 6, fontWeight: 500 }}>
                    {t.question}
                  </div>
                  {t.answer ? (
                    <div className="transcript-a">{t.answer}</div>
                  ) : (
                    <div className="transcript-a empty">Not answered yet.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Live phone-call monitor (Twilio mode)
   ========================================================================= */
export const PhoneCallRoom = ({ candidate, phone, onClose, onSaved }) => {
  const [prep, setPrep] = useState(null);
  const [callStatus, setCallStatus] = useState('preparing'); // preparing | dialing | ringing | in-progress | completed | failed
  const [transcript, setTranscript] = useState([]);
  const [answered, setAnswered] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [callSid, setCallSid] = useState('');
  const interviewIdRef = useRef('');

  /* Prepare → place call. */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const prepRes = await axios.post(`${API_BASE}/api/interview/prepare`, {
          session_id: getActiveJobId(),
          candidate_name: candidate.Candidate_Name,
          phone,
          file_name: candidate.File_Name || '',
        });
        if (cancelled) return;
        setPrep(prepRes.data);
        interviewIdRef.current = prepRes.data.interview_id;

        setCallStatus('dialing');
        const callRes = await axios.post(`${API_BASE}/api/interview/place_call`, {
          session_id: getActiveJobId(),
          interview_id: prepRes.data.interview_id,
          candidate_name: candidate.Candidate_Name,
          phone,
          file_name: candidate.File_Name || '',
          role_title: prepRes.data.role_title || '',
          questions: prepRes.data.questions,
          intro: prepRes.data.intro,
          outro: prepRes.data.outro,
        });
        if (cancelled) return;
        if (callRes.data.status === 'ok') {
          setCallSid(callRes.data.call_sid || '');
        } else {
          throw new Error(callRes.data.detail || 'Could not place call.');
        }
      } catch (e) {
        const detail = e?.response?.data?.detail || e?.message || 'Failed to place the call.';
        setError(detail);
        setCallStatus('failed');
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Poll call status & transcript while in flight. */
  useEffect(() => {
    if (!interviewIdRef.current) return;
    let timer = null;
    const tick = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/interview/call_status/${interviewIdRef.current}`);
        setCallStatus(res.data.status || 'unknown');
        setTranscript(res.data.transcript || []);
        setAnswered(res.data.answered || 0);
        setTotal(res.data.total || 0);
        if (res.data.ended) {
          clearInterval(timer);
          onSaved && onSaved();
        }
      } catch {}
    };
    timer = setInterval(tick, 3000);
    tick();
    return () => clearInterval(timer);
  }, [callSid, onSaved]);

  const statusLabel = {
    preparing: 'Preparing questions…',
    dialing: 'Dialing…',
    queued: 'Queued',
    initiated: 'Connecting…',
    ringing: 'Ringing',
    'in-progress': 'Call in progress',
    answered: 'Connected',
    completed: 'Call ended',
    failed: 'Call failed',
    busy: 'Candidate was busy',
    'no-answer': 'No answer',
    canceled: 'Call cancelled',
  }[callStatus] || callStatus || 'Unknown';

  return (
    <div className="modal-backdrop" onClick={() => {}}>
      <div className="interview-room" onClick={(e) => e.stopPropagation()}>
        <div className="interview-header">
          <div className="agent-info">
            <div className="agent-avatar">G</div>
            <div className="interview-meta">
              <strong>{candidate.Candidate_Name}</strong>
              <span>{phone}{prep?.role_title ? ` · ${prep.role_title}` : ''}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#a5b4fc', fontSize: '0.85rem' }}>
              <span className="call-status-dot" /> {statusLabel}
            </span>
            <button className="icon-btn" style={{ color: 'white' }} onClick={onClose} title="Close monitor">
              <FiX />
            </button>
          </div>
        </div>

        <div className="interview-body">
          <div className="interview-question-pane">
            <div className="interview-progress">
              <span>Real phone call · Twilio</span>
              <div className="interview-progress-bar">
                <div style={{ width: `${total ? Math.round((answered / total) * 100) : 0}%` }} />
              </div>
              <span>{answered}/{total}</span>
            </div>

            <div className="interview-question-card">
              <div className="interview-category-tag">
                {callStatus === 'failed' ? 'Error' : 'Live call'}
              </div>
              <div className="interview-question-text">
                {error ? error :
                 callStatus === 'completed' ? 'The interview call has ended. The transcript is saved automatically.' :
                 callStatus === 'in-progress' || callStatus === 'answered' ? 'The candidate is answering questions over the phone. Watch the transcript fill in on the right →' :
                 callStatus === 'ringing' ? `Calling ${phone}…` :
                 callStatus === 'dialing' || callStatus === 'initiated' || callStatus === 'queued' ? 'Placing the call now…' :
                 'Setting up the call…'}
              </div>
            </div>

            <div className={`interview-bot-state ${
              callStatus === 'completed' ? 'idle' :
              callStatus === 'failed' ? 'listening' :
              'speaking'
            }`}>
              {callStatus === 'completed' ? '✅ Call ended — transcript saved automatically' :
               callStatus === 'failed' ? '⚠️ Could not complete the call' :
               '📞 Geeky AI is on the call with the candidate'}
            </div>

            <div className="interview-controls">
              <button className="btn-secondary" onClick={onClose}>
                Close monitor
              </button>
            </div>
          </div>

          <div className="interview-transcript-pane">
            <h4>Live transcript</h4>
            <div className="transcript-list">
              {transcript.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '20px 0' }}>
                  Transcript will appear here as the candidate answers each question.
                </div>
              ) : transcript.map((t, i) => (
                <div key={i} className="transcript-entry" style={{
                  borderLeft: t.answer ? '3px solid var(--success)' : '3px solid var(--border-color)',
                }}>
                  <div className="transcript-q">
                    Q{i + 1} · {t.category}{t.skill ? ` · ${t.skill}` : ''}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: 6, fontWeight: 500 }}>
                    {t.question}
                  </div>
                  {t.answer ? (
                    <div className="transcript-a">{t.answer}</div>
                  ) : (
                    <div className="transcript-a empty">Awaiting answer…</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewRoom;
