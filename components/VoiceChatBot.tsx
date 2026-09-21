'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  X,
  Bot,
  User,
  ChevronDown,
  RotateCcw,
  Compass,
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
  profiles?: any[];
}

export function VoiceChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: "👋 Welcome to FloatChat AI! I'm your voice-enabled Oceanographic & ARGO Intelligence Assistant. Ask me anything about the ocean—from deep-sea trenches, thermoclines, and currents to live ARGO profiling float telemetry and marine heatwaves.",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Web Speech Recognition
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
          setVoiceStatus('Listening... speak your query');
        };

        recognition.onresult = (event: any) => {
          let currentText = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentText += event.results[i][0].transcript;
          }
          if (currentText) {
            setQuery(currentText);
          }
        };

        recognition.onerror = (e: any) => {
          setIsListening(false);
          setVoiceStatus(null);
          console.warn('Speech recognition error:', e.error);
        };

        recognition.onend = () => {
          setIsListening(false);
          setVoiceStatus(null);
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

  // Auto scroll messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Voice synthesis: speak response text
  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    if (isSpeaking) {
      setIsSpeaking(false);
      return;
    }

    // Clean text for speech
    const clean = text
      .replace(/[#*`_~[\]()]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/ARGO/gi, 'Argo')
      .slice(0, 600);

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const toggleMic = () => {
    if (!voiceSupported) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    stopSpeaking();

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceStatus(null);
    } else {
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.warn('Recognition start failed:', err);
      }
    }
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend || query).trim();
    if (!text || loading) return;

    stopSpeaking();

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, mode: 'answer' }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();
      const replyText =
        data.explanation ||
        data.message ||
        "I analyzed the ARGO telemetry snapshot for your query, but couldn't retrieve matching observations.";

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        profiles: data.profiles?.slice(0, 3),
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (autoSpeak) {
        speakText(replyText);
      }
    } catch {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: 'Sorry, the data service timed out or is temporarily unavailable. Cached telemetry remains secure.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'What is the Mariana Trench?',
    'Explain the thermocline',
    'Arabian Sea temperature trends',
    'Why is the ocean salty?',
    'Explain marine heatwaves',
    'How do ARGO floats work?',
  ];

  return (
    <>
      {/* Floating Trigger Button in Bottom-Right */}
      <div className="voice-bot-trigger-wrap">
        {!isOpen && (
          <button
            type="button"
            className="voice-bot-fab"
            onClick={() => setIsOpen(true)}
            aria-label="Open FloatChat Voice Assistant"
          >
            <div className="fab-pulse" />
            <Sparkles size={18} className="fab-spark" />
            <span className="fab-text">FloatChat AI</span>
            <Mic size={15} className="fab-mic" />
          </button>
        )}
      </div>

      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="voice-bot-window" role="dialog" aria-labelledby="chat-title">
          {/* Header */}
          <div className="voice-bot-header">
            <div className="bot-header-info">
              <div className="bot-avatar">
                <Bot size={18} className="text-cyan" />
              </div>
              <div>
                <div className="bot-title" id="chat-title">
                  FloatChat AI Assistant
                </div>
                <div className="bot-subtitle">
                  <span className="online-dot" /> Spatio-Temporal Intelligence
                </div>
              </div>
            </div>

            <div className="bot-header-actions">
              <button
                type="button"
                className={`bot-icon-btn ${autoSpeak ? 'active' : ''}`}
                onClick={() => {
                  if (isSpeaking) stopSpeaking();
                  setAutoSpeak(!autoSpeak);
                }}
                title={autoSpeak ? 'Voice speech enabled (click to mute)' : 'Voice speech muted (click to enable)'}
              >
                {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>

              <button
                type="button"
                className="bot-icon-btn"
                onClick={() => {
                  stopSpeaking();
                  setIsOpen(false);
                }}
                title="Close Assistant"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="voice-bot-body">
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble-wrap ${m.sender}`}>
                <div className="bubble-icon">
                  {m.sender === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                </div>

                <div className="bubble-content">
                  <div className="bubble-text">{m.text}</div>

                  {/* Matching profiles preview if available */}
                  {m.profiles && m.profiles.length > 0 && (
                    <div className="bubble-profiles">
                      <div className="profiles-label">
                        <Compass size={12} /> Matching ARGO Floats:
                      </div>
                      <div className="profiles-list">
                        {m.profiles.map((p: any, idx: number) => (
                          <div key={idx} className="profile-chip">
                            <strong>Float #{p.float_id}</strong>
                            <span>{p.min_depth ?? 0}m – {p.max_depth ?? 2000}m</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bubble-footer">
                    <span className="bubble-time">{m.time}</span>
                    {m.sender === 'assistant' && (
                      <button
                        type="button"
                        className="speak-again-btn"
                        onClick={() => speakText(m.text)}
                        title="Read aloud"
                      >
                        <Volume2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-bubble-wrap assistant">
                <div className="bubble-icon">
                  <Bot size={14} />
                </div>
                <div className="bubble-content loading-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="loading-label">Synthesizing ARGO Telemetry...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions Strip */}
          <div className="voice-bot-suggestions">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className="suggestion-chip"
                onClick={() => sendMessage(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Voice Listening Status Banner */}
          {voiceStatus && (
            <div className="voice-status-banner">
              <span className="voice-pulse-ring" />
              <span>{voiceStatus}</span>
            </div>
          )}

          {/* Input Footer */}
          <form
            className="voice-bot-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <button
              type="button"
              className={`mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleMic}
              title={isListening ? 'Stop listening' : 'Speak your query'}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <input
              type="text"
              className="chat-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isListening ? 'Listening to voice...' : 'Ask FloatChat AI or tap mic...'}
              disabled={loading}
            />

            <button
              type="submit"
              className="send-btn"
              disabled={!query.trim() || loading}
              title="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
