// Candidate-facing self-service L1 interview.
//
// Opened from a tokenised URL (/interview/<token>). No login required — the
// token IS the credential. Mirrors the in-app InterviewRoom voice loop but
// drops all the HR-side chrome: there is just a welcome screen, the live
// conversation, and a thank-you screen.
//
// All audio happens IN THE BROWSER via the Web Speech API (TTS + STT).
// Same engine the HR-side InterviewRoom uses today, so no new API keys.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  FiMic, FiMicOff, FiPhoneOff, FiSkipForward, FiRotateCw,
  FiCheckCircle, FiAlertCircle, FiVolume2,
} from 'react-icons/fi';
import { API_BASE, INTERVIEW_LANGUAGES } from '../lib/enterprise.js';

/* ---- Voice loading — first getVoices() is empty, this awaits the list ---- */
let _voicesReady = null;
const ensureVoicesLoaded = () => {
  if (_voicesReady) return _voicesReady;
  _voicesReady = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) { resolve([]); return; }
    const have = synth.getVoices();
    if (have && have.length) { resolve(have); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(synth.getVoices() || []); };
    synth.onvoiceschanged = finish;
    let tries = 0;
    const poll = setInterval(() => {
      tries += 1;
      if ((synth.getVoices() || []).length || tries > 40) { clearInterval(poll); finish(); }
    }, 100);
  });
  return _voicesReady;
};

const splitSentences = (text) => {
  const cleaned = (text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [cleaned];
  const out = [];
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed.length <= 140) { out.push(trimmed); continue; }
    const sub = trimmed.split(/(?<=[,;:—-])\s+/);
    out.push(...sub.map(s => s.trim()).filter(Boolean));
  }
  return out;
};

const pickVoice = (langCode) => {
  const list = window.speechSynthesis?.getVoices?.() || [];
  if (!list.length) return null;
  const target = (langCode || 'en-IN').toLowerCase().replace('_', '-');
  const base = target.split('-')[0];
  const score = (v) => {
    const n = (v.name || '').toLowerCase();
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    let s = 0;
    if (l === target)            s += 300;
    else if (l.startsWith(base)) s += 200;
    else if (l.includes('-in') || /india/.test(n)) s += 40;
    if (/\bneural\b/.test(n))  s += 40;
    if (/\bnatural\b/.test(n)) s += 30;
    if (/\bonline\b/.test(n))  s += 25;
    if (/google/i.test(n))     s += 15;
    if (/female|aria|jenny|aditi|raveena|priya|kalpana/.test(n)) s += 5;
    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a))[0];
};

const CandidateInterview = () => {
  const { token } = useParams();

  const [phase, setPhase]   = useState('loading');   // loading | welcome | interview | done | saving | error
  const [errorMsg, setErrorMsg] = useState('');
  const [prep, setPrep]     = useState(null);        // { questions, intro, outro, role_title, language, candidate_name }
  const [stage, setStage]   = useState('idle');      // intro | asking | listening | between | done
  const [qIndex, setQIndex] = useState(-1);
  const [transcript, setTranscript] = useState([]);
  const [interim, setInterim] = useState('');
  const [final, setFinal]     = useState('');
  const [muted, setMuted]     = useState(false);

  const startedAtRef = useRef(null);
  const recognitionRef = useRef(null);
  const stageRef = useRef(stage);
  const langRef  = useRef('en-IN');
  useEffect(() => { stageRef.current = stage; }, [stage]);

  /* ─── Load the interview payload from the token ─── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/interview/by_token/${encodeURIComponent(token)}`);
        if (!alive) return;
        const d = res.data || {};
        setPrep(d);
        langRef.current = d.language || 'en-IN';
        setTranscript((d.questions || []).map(q => ({
          category: q.category, skill: q.skill || null,
          question: q.question, answer: '',
        })));
        setPhase('welcome');
      } catch (e) {
        if (!alive) return;
        setErrorMsg(e?.response?.data?.message || 'Could not load the interview. The link may have expired.');
        setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [token]);

  /* ─── TTS ─── */
  const speak = useCallback((text) => new Promise(async (resolve) => {
    if (!text || !window.speechSynthesis) { resolve(); return; }
    await ensureVoicesLoaded();
    try { window.speechSynthesis.cancel(); } catch {}
    if (muted) { resolve(); return; }
    const chunks = splitSentences(text);
    if (chunks.length === 0) { resolve(); return; }
    const langCode = langRef.current || 'en-IN';
    const voice = pickVoice(langCode);
    const baseRate  = 0.84;
    const basePitch = 0.97;
    const pauseMs   = 280;
    let idx = 0;
    const next = () => {
      if (idx >= chunks.length) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(chunks[idx]);
      if (voice) u.voice = voice;
      u.lang   = (voice && voice.lang) ? voice.lang : langCode;
      u.rate   = +(baseRate  * (0.96 + Math.random() * 0.08)).toFixed(3);
      u.pitch  = +(basePitch * (0.98 + Math.random() * 0.04)).toFixed(3);
      u.volume = 1.0;
      u.onend = () => {
        idx += 1;
        const endsHard = /[.!?]\s*$/.test(chunks[idx - 1] || '');
        const jitter = 0.85 + Math.random() * 0.4;
        setTimeout(next, Math.round((endsHard ? pauseMs : pauseMs * 0.55) * jitter));
      };
      u.onerror = () => { idx += 1; setTimeout(next, 80); };
      try { window.speechSynthesis.speak(u); } catch { idx += 1; setTimeout(next, 80); }
    };
    next();
  }), [muted]);

  /* ─── STT ─── */
  const getRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    if (recognitionRef.current) return recognitionRef.current;
    const rec = new SR();
    rec.lang = langRef.current || 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;
    return rec;
  }, []);

  const startListening = useCallback(() => {
    const rec = getRecognition();
    if (!rec) { setErrorMsg("Your browser doesn't support speech recognition. Use Chrome or Edge."); return; }
    setInterim(''); setFinal('');
    rec.onresult = (event) => {
      let it = '', fin = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) fin += t + ' ';
        else it += t;
      }
      if (fin) setFinal(prev => (prev + ' ' + fin).trim());
      setInterim(it);
    };
    rec.onend = () => {
      if (stageRef.current === 'listening') {
        try { rec.start(); } catch {}
      }
    };
    try { rec.start(); } catch {}
  }, [getRecognition]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  /* ─── Interview lifecycle ─── */
  const startInterview = async () => {
    setPhase('interview');
    startedAtRef.current = new Date().toISOString();
    setStage('intro');
    await speak(prep.intro);
    setQIndex(0);
    setStage('asking');
    await speak(prep.questions[0].question);
    setStage('listening');
    startListening();
  };

  const captureAnswer = () => {
    const ans = (final + ' ' + interim).trim();
    setTranscript(prev => prev.map((t, i) => i === qIndex ? { ...t, answer: ans } : t));
    setFinal(''); setInterim('');
  };

  const nextQuestion = async () => {
    stopListening();
    captureAnswer();
    const next = qIndex + 1;
    if (next >= prep.questions.length) {
      setStage('between');
      await speak(prep.outro);
      setStage('done');
      // Auto-save and switch to done screen.
      await finalizeAndSave({ overrideLastAnswer: (final + ' ' + interim).trim() });
      return;
    }
    setQIndex(next);
    setStage('asking');
    await speak(prep.questions[next].question);
    setStage('listening');
    startListening();
  };

  const repeatQuestion = async () => {
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
    await finalizeAndSave({ overrideLastAnswer: (final + ' ' + interim).trim() });
  };

  const finalizeAndSave = async ({ overrideLastAnswer = '' } = {}) => {
    setPhase('saving');
    try {
      const final_transcript = transcript.map((t, i) => {
        if (i === qIndex && overrideLastAnswer) {
          return { ...t, answer: t.answer || overrideLastAnswer };
        }
        return t;
      });
      await axios.post(`${API_BASE}/api/interview/save_by_token/${encodeURIComponent(token)}`, {
        transcript: final_transcript,
        started_at: startedAtRef.current,
        ended_at:   new Date().toISOString(),
      });
      setPhase('done');
    } catch (e) {
      setErrorMsg(e?.response?.data?.message || 'Could not save the interview. Please contact your recruiter.');
      setPhase('error');
    }
  };

  /* ─── Cleanup ─── */
  useEffect(() => {
    return () => {
      try { window.speechSynthesis?.cancel(); } catch {}
      try { recognitionRef.current?.abort?.(); } catch {}
    };
  }, []);

  /* ─── Render ─── */
  if (phase === 'loading') return <Centered>Loading your interview…</Centered>;

  if (phase === 'error') {
    return (
      <Centered>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>
            <FiAlertCircle />
          </div>
          <h1 style={{ marginBottom: 10, fontSize: '1.4rem' }}>We couldn't load this interview</h1>
          <p style={{ color: '#475569', lineHeight: 1.55 }}>{errorMsg}</p>
        </div>
      </Centered>
    );
  }

  if (phase === 'done') {
    return (
      <Centered>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 28 }}>
            <FiCheckCircle />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Thank you, {prep?.candidate_name || 'and well done'}!</h1>
          <p style={{ color: '#475569', lineHeight: 1.6 }}>
            Your responses have been recorded. Our recruitment team will review them and get back to you within two business days. You can close this tab now.
          </p>
        </div>
      </Centered>
    );
  }

  if (phase === 'welcome') return <WelcomeScreen prep={prep} onStart={startInterview} />;

  if (phase === 'saving') return <Centered>Saving your interview…</Centered>;

  // Active interview UI
  const currentQ = prep && qIndex >= 0 ? prep.questions[qIndex] : null;
  const totalQ   = prep ? prep.questions.length : 0;
  const progressPct = totalQ ? Math.round(((qIndex + 1) / totalQ) * 100) : 0;
  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fb', padding: '24px 16px', boxSizing: 'border-box' }}>
      <div style={{
        maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 16,
        boxShadow: '0 18px 50px rgba(15,23,42,0.10)', overflow: 'hidden',
        border: '1px solid #e2e8f0',
      }}>
        <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#4f46e5,#06b6d4)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>L1 Interview</div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 2 }}>{prep.role_title}</div>
          </div>
          <button
            onClick={() => setMuted(m => !m)}
            title={muted ? 'Unmute interviewer' : 'Mute interviewer'}
            style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {muted ? <FiMicOff /> : <FiVolume2 />}
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>
            <span>{qIndex < 0 ? 'Intro' : `Question ${qIndex + 1} of ${totalQ}`}</span>
            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${qIndex < 0 ? 0 : progressPct}%`, height: '100%', background: 'linear-gradient(90deg,#4f46e5,#06b6d4)', transition: 'width 0.3s' }} />
            </div>
            <span>{qIndex < 0 ? '—' : `${progressPct}%`}</span>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, marginBottom: 14 }}>
            {currentQ ? (
              <>
                <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#eef2ff', color: '#4f46e5', fontSize: '0.72rem', fontWeight: 600, marginBottom: 8 }}>
                  {currentQ.category}{currentQ.skill ? ` · ${currentQ.skill}` : ''}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.5, color: '#0f172a' }}>
                  {currentQ.question}
                </div>
              </>
            ) : (
              <div style={{ color: '#64748b' }}>Your interviewer is greeting you…</div>
            )}
          </div>

          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background:
              stage === 'asking' || stage === 'intro' || stage === 'between' ? 'rgba(79,70,229,0.10)' :
              stage === 'listening' ? 'rgba(16,185,129,0.10)' : '#f1f5f9',
            color:
              stage === 'asking' || stage === 'intro' || stage === 'between' ? '#4f46e5' :
              stage === 'listening' ? '#059669' : '#475569',
            fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {stage === 'asking' || stage === 'intro' || stage === 'between' ? <><FiVolume2 /> Interviewer is speaking…</> :
             stage === 'listening' ? <><FiMic /> Listening — speak naturally</> :
             'Setting things up…'}
          </div>

          {stage === 'listening' && (
            <div style={{
              marginTop: 12, padding: 14, borderRadius: 10,
              border: '1px dashed #cbd5e1', background: '#fafbfc',
              minHeight: 60, fontSize: '0.92rem',
            }}>
              {final || interim ? (
                <>
                  <span style={{ color: '#0f172a' }}>{final}</span>{' '}
                  <span style={{ color: '#94a3b8' }}>{interim}</span>
                </>
              ) : (
                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Capturing your response…</span>
              )}
            </div>
          )}

          {errorMsg && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: '0.88rem' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {stage === 'listening' && (
              <button onClick={nextQuestion} style={primaryBtn}>
                <FiSkipForward /> Next question
              </button>
            )}
            {(stage === 'listening' || stage === 'asking') && (
              <button onClick={repeatQuestion} style={secondaryBtn}>
                <FiRotateCw /> Repeat question
              </button>
            )}
            <button onClick={endInterview} style={endBtn}>
              <FiPhoneOff /> End interview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const WelcomeScreen = ({ prep, onStart }) => {
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState('');
  const langLabel = INTERVIEW_LANGUAGES.find(l => l.code === (prep?.language || 'en-IN'))?.native || '';

  const requestMic = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We don't need to hold the stream — Web Speech API opens its own —
      // we just needed the user's permission gesture.
      stream.getTracks().forEach(t => t.stop());
      setMicReady(true);
    } catch (e) {
      setMicError('Microphone access was denied. Please allow it in your browser and try again.');
    }
  };

  return (
    <Centered>
      <div style={{ maxWidth: 540, width: '100%' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 32px', boxShadow: '0 18px 50px rgba(15,23,42,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#4f46e5,#06b6d4)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.4rem' }}>S</div>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>SmartStaff · AI Interview</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a', marginTop: 2 }}>{prep.role_title}</div>
            </div>
          </div>

          <h1 style={{ fontSize: '1.5rem', margin: '4px 0 8px', color: '#0f172a' }}>
            Hi {prep.candidate_name || 'there'} 👋
          </h1>
          <p style={{ color: '#475569', lineHeight: 1.6 }}>
            This is a short voice interview conducted by SmartStaff's AI interviewer.
            You'll be asked <strong>{prep.questions.length}</strong> questions — answer each one out loud as you would in a regular phone interview.
            {langLabel && <> The interview will be in <strong>{langLabel}</strong>.</>}
          </p>

          <ul style={{ marginTop: 14, marginBottom: 14, paddingLeft: 18, color: '#475569', lineHeight: 1.8, fontSize: '0.92rem' }}>
            <li>Use <strong>Chrome or Edge</strong> for the best experience.</li>
            <li>Find a quiet space and check your microphone before starting.</li>
            <li>Speak naturally — pauses are fine. When you're done with an answer, click <strong>Next question</strong>.</li>
            <li>If a question wasn't clear, click <strong>Repeat question</strong>.</li>
          </ul>

          {!micReady ? (
            <button onClick={requestMic} style={{ ...primaryBtn, width: '100%', padding: '14px 18px', fontSize: '0.95rem' }}>
              <FiMic /> Test microphone access
            </button>
          ) : (
            <button onClick={onStart} style={{ ...primaryBtn, width: '100%', padding: '14px 18px', fontSize: '0.95rem' }}>
              <FiVolume2 /> Start interview
            </button>
          )}

          {micError && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: '0.86rem' }}>
              {micError}
            </div>
          )}
          {micReady && !micError && (
            <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FiCheckCircle /> Microphone ready.
            </div>
          )}
        </div>
      </div>
    </Centered>
  );
};

const Centered = ({ children }) => (
  <div style={{
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f6f8fb', padding: 24, fontFamily: 'inherit',
  }}>
    {children}
  </div>
);

const primaryBtn = {
  background: 'linear-gradient(135deg,#4f46e5,#06b6d4)', color: '#fff', border: 'none',
  borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem',
  fontFamily: 'inherit',
};
const secondaryBtn = {
  background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1',
  borderRadius: 10, padding: '10px 16px', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem',
  fontFamily: 'inherit',
};
const endBtn = {
  background: '#fff', color: '#991b1b', border: '1px solid #fecaca',
  borderRadius: 10, padding: '10px 16px', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem',
  marginLeft: 'auto', fontFamily: 'inherit',
};

export default CandidateInterview;
