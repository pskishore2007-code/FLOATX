'use client';
import { useState, useEffect, useRef } from 'react';
import { ArrowUp, Sparkles, Mic, MicOff, Volume2, VolumeX, Radio, CheckCircle2 } from 'lucide-react';

type Hit = {
  profile_id: string;
  float_id: string;
  cycle: number | null;
  timestamp: string;
  source: string;
  latitude: number;
  longitude: number;
  data_mode: string;
  position_qc: string;
  time_qc: string;
  matching_samples: number;
  min_depth: number;
  max_depth: number;
  focus_depth: number;
  distance?: number;
};

type Answer = {
  status: string;
  explanation: string;
  profiles?: Hit[];
  method?: string;
  last_sync?: string;
  variable?: 'temperature' | 'salinity' | 'pressure';
};

const examples = [
  'Show temperature profiles in Bay of Bengal in September 2026.',
  'Show salinity profiles in Arabian Sea.',
  'Show profiles deeper than 1000m.',
];

export function FloatChat({
  onSelect,
}: {
  onSelect: (id: string, depth: number, variable?: Answer['variable']) => boolean;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [selection, setSelection] = useState('');
  const [mode, setMode] = useState<'exact' | 'semantic' | 'answer'>('answer');

  // Voice Assist States
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setVoiceSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          setVoiceNote('Listening to your query... speak now');
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.resultIndex >= 0) {
              const res = event.results[i];
              if (res.isFinal) {
                finalTranscript += res[0].transcript;
              } else {
                interimTranscript += res[0].transcript;
              }
            }
          }
          const text = finalTranscript || interimTranscript;
          if (text) {
            setQuery(text);
          }
        };

        recognition.onerror = (e: any) => {
          console.warn('Speech recognition error:', e.error);
          setIsListening(false);
          setVoiceNote(`Voice error: ${e.error || 'Check microphone permissions'}`);
          setTimeout(() => setVoiceNote(null), 4000);
        };

        recognition.onend = () => {
          setIsListening(false);
          setVoiceNote('Speech captured. Ready to submit.');
          setTimeout(() => setVoiceNote(null), 3000);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleListening = () => {
    if (!voiceSupported) {
      alert('Speech recognition is not supported on this browser. Try Google Chrome or Microsoft Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.warn('Recognition start failed:', err);
      }
    }
  };

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Clean markdown/symbols for clean reading
    const cleanText = text
      .replace(/[#*`_~[\]()]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/ARGO/gi, 'Argo')
      .slice(0, 600);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setAnswer(null);
    setSelection('');
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode }),
        signal: AbortSignal.timeout(40000),
      });
      const data = await r.json();
      const finalAnswer: Answer = data.explanation
        ? data
        : { status: 'error', explanation: 'Unexpected data-service response. Please retry.' };
      setAnswer(finalAnswer);
    } catch {
      setAnswer({
        status: 'error',
        explanation:
          'Data service unavailable or request timed out. Retry your query; cached observations have not been changed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat" id="floatchat">
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={15} /> FLOATCHAT / MULTI-MODAL OCEAN INTELLIGENCE ENGINE
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: '11px',
            background: '#0d2836',
            color: '#79e8d4',
            padding: '2px 8px',
            borderRadius: 12,
            border: '1px solid #79e8d440',
          }}
        >
          <Radio size={12} className={isListening ? 'animate-pulse' : ''} />
          VOICE ASSIST {voiceSupported ? 'ACTIVE' : 'FALLBACK'}
        </span>
      </div>

      <h2>
        Ask the ocean
        <br />
        <em>with natural language & voice.</em>
      </h2>

      <p>
        Ask <strong>any question related to the ocean</strong>—from deep-sea trenches and ocean physics to live ARGO robotic profiling float NetCDF telemetry, depth curves, and marine climate phenomena.
      </p>

      {/* Voice feedback indicator */}
      {voiceNote && (
        <div
          style={{
            padding: '8px 12px',
            background: isListening ? '#092d3b' : '#071822',
            border: `1px solid ${isListening ? '#79e8d4' : '#274754'}`,
            borderRadius: 8,
            color: isListening ? '#79e8d4' : '#a0c4cf',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <Radio size={14} className={isListening ? 'animate-pulse' : ''} />
          <span>{voiceNote}</span>
        </div>
      )}

      <div className="variable-tabs" aria-label="FloatChat search mode">
        <button
          disabled={busy}
          aria-pressed={mode === 'answer'}
          onClick={() => {
            setMode('answer');
            setAnswer(null);
            setSelection('');
          }}
        >
          ✨ AI Ocean Assistant
        </button>
        <button
          disabled={busy}
          aria-pressed={mode === 'exact'}
          onClick={() => {
            setMode('exact');
            setAnswer(null);
            setSelection('');
          }}
        >
          Exact NetCDF Profiles
        </button>
        <button
          disabled={busy}
          aria-pressed={mode === 'semantic'}
          onClick={() => {
            setMode('semantic');
            setAnswer(null);
            setSelection('');
          }}
        >
          Semantic Discovery
        </button>
      </div>

      {mode === 'answer' && (
        <p style={{ fontSize: '13px', color: '#8fa9b6' }}>
          Ask any general oceanography question or inquire about real ARGO floats. Synthesized by Gemini AI with observational telemetry citations.
        </p>
      )}
      {mode === 'exact' && (
        <p style={{ fontSize: '13px', color: '#8fa9b6' }}>
          Filters raw NetCDF observation files strictly by region, variable (temperature, salinity, pressure), depth, and float ID.
        </p>
      )}
      {mode === 'semantic' && (
        <p style={{ fontSize: '13px', color: '#8fa9b6' }}>
          Local Vector RAG (Chroma + MiniLM) · ranks spatial and geochemical contexts. Max 600 characters.
        </p>
      )}

      {/* Query Form with Voice Assist Controls */}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label className="sr-only" htmlFor="query">
          Ask FloatChat
        </label>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            id="query"
            maxLength={2000}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isListening
                ? 'Listening... say anything about the ocean'
                : 'Ask anything: "What is the Mariana Trench?", "Explain thermocline", or "Salinity in Arabian Sea"'
            }
            style={{
              paddingRight: '44px',
              borderColor: isListening ? '#79e8d4' : undefined,
              boxShadow: isListening ? '0 0 10px #79e8d450' : undefined,
            }}
          />
          {/* Voice Input Microphone Button */}
          <button
            type="button"
            onClick={toggleListening}
            aria-label={isListening ? 'Stop listening' : 'Start voice input'}
            title={isListening ? 'Listening... click to stop' : 'Click to speak your query'}
            style={{
              position: 'absolute',
              right: 8,
              background: isListening ? '#79e8d4' : 'transparent',
              color: isListening ? '#02060d' : '#79e8d4',
              border: isListening ? 'none' : '1px solid #79e8d440',
              borderRadius: '50%',
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        </div>

        <button aria-label="Submit ocean query" disabled={busy || !query.trim()} style={{ minWidth: 44 }}>
          {busy ? '…' : <ArrowUp size={20} />}
        </button>
      </form>

      {/* Quick Prompts */}
      <div className="suggestions">
        {[
          'What is the Mariana Trench and how deep is it?',
          'Explain the thermocline and ocean layers',
          'Temperature profiles in Arabian Sea',
          'Why is the ocean salty?',
          'How do ARGO floats dive and record data?',
          'What causes marine heatwaves?',
        ].map((q) => (
          <button
            key={q}
            disabled={busy}
            onClick={() => {
              setQuery(q);
            }}
          >
            {q}
            <span>↗</span>
          </button>
        ))}
      </div>

      {/* Results and Answer Area */}
      <div
        aria-live="polite"
        className="chat-answer"
        style={{
          whiteSpace: 'pre-wrap',
          position: 'relative',
          padding: '20px',
          background: '#04131d',
          borderRadius: 12,
          border: '1px solid #163645',
          marginTop: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <span style={{ fontSize: '12px', letterSpacing: '0.8px', color: '#79e8d4', textTransform: 'uppercase' }}>
            {busy ? 'SEARCHING TELEMETRY...' : answer ? 'SYNTHESIZED INSIGHT' : 'WAITING FOR QUERY'}
          </span>

          {answer?.explanation && (
            <button
              type="button"
              onClick={() => speakText(answer.explanation)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: isSpeaking ? '#79e8d420' : '#08202d',
                color: isSpeaking ? '#79e8d4' : '#8fa9b6',
                border: '1px solid #234d5f',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title={isSpeaking ? 'Stop voice readout' : 'Listen to explanation'}
            >
              {isSpeaking ? (
                <>
                  <VolumeX size={14} /> Stop Voice
                </>
              ) : (
                <>
                  <Volume2 size={14} /> Listen to Answer
                </>
              )}
            </button>
          )}
        </div>

        {busy
          ? 'Searching cached ARGO NetCDF observations & evaluating spatio-temporal indices...'
          : answer?.explanation ||
            'Type or speak a question above, then submit. Real ARGO observation dates, QC flags, and sources accompany every result.'}

        {selection && <p style={{ color: '#79e8d4', marginTop: 10 }}>{selection}</p>}
      </div>

      {answer?.method && <p style={{ fontSize: '12px', color: '#8fa9b6', marginTop: 8 }}>{answer.method}</p>}
      {answer?.last_sync && (
        <p style={{ fontSize: '12px', color: '#688c9b' }}>Last cache sync: {answer.last_sync}</p>
      )}

      {/* Profiles Cards */}
      <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
        {answer?.profiles?.map((p) => (
          <article
            key={p.profile_id}
            style={{
              padding: 16,
              border: '1px solid #1c4556',
              borderRadius: 12,
              background: '#071b25',
              color: '#e0edf2',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong style={{ color: '#79e8d4', fontSize: '15px' }}>
                ARGO {p.float_id} · cycle {p.cycle ?? 'unknown'}
              </strong>
              <span style={{ fontSize: '11px', color: '#83e3eb', background: '#0a2a38', padding: '2px 8px', borderRadius: 4 }}>
                QC: {p.position_qc}/{p.time_qc}
              </span>
            </div>
            <p style={{ margin: '4px 0', fontSize: '13px' }}>
              {p.timestamp} · {p.latitude.toFixed(4)}° N, {p.longitude.toFixed(4)}° E
            </p>
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#9db8c4' }}>
              {p.matching_samples} {p.distance === undefined ? 'matching samples' : 'profile samples'} ·{' '}
              {p.min_depth.toFixed(1)}–{p.max_depth.toFixed(1)} m · Mode: {p.data_mode}
            </p>
            <p style={{ margin: '4px 0', fontSize: '12px', color: '#7094a3' }}>
              Profile ID: {p.profile_id}
              {p.distance !== undefined && <> · Cosine distance: {p.distance.toFixed(4)}</>}
            </p>

            <div className="chat-card-actions" style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <a
                href={p.source}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#83e3eb',
                  fontSize: '13px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'underline',
                }}
              >
                Official NetCDF Source ↗
              </a>
              <button
                className="sync-button"
                onClick={() =>
                  setSelection(
                    onSelect(p.profile_id, p.focus_depth, answer.variable)
                      ? `Opened depth charts for ${p.profile_id}.`
                      : 'This profile is not in the page snapshot. Retry the data connection, then select it again.'
                  )
                }
              >
                Inspect Depth Profile
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
