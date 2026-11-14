import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Volume2,
} from 'lucide-react';
import {
  computeRms,
  float32ToPcm16Base64,
  GaplessAudioPlayer,
} from '../lib/audio';
import type {
  CalendarBlock,
  ParsedIntentLog,
  TranscriptEntry,
  VoicePersona,
} from '../shared/types';

interface VoiceAssistantPanelProps {
  voicePersona: VoicePersona;
  onChangeVoicePersona: (voice: VoicePersona) => void;
  onCalendarUpdated: (events: CalendarBlock[]) => void;
  onIntentLogged: (intent: ParsedIntentLog) => void;
  intents: ParsedIntentLog[];
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

const SAMPLE_PROMPTS = [
  'Check my availability tomorrow afternoon for a 45-minute client call.',
  'Block 45 minutes tomorrow at 11:00 AM for Jordan Lee from Horizon Bio.',
  'Book a 30-minute consultation today at 2:00 PM for Alex Rivera.',
];

export function VoiceAssistantPanel({
  voicePersona,
  onChangeVoicePersona,
  onCalendarUpdated,
  onIntentLogged,
  intents,
}: VoiceAssistantPanelProps) {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [micActive, setMicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transcript' | 'intents'>('transcript');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [speakerLevel, setSpeakerLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playerRef = useRef<GaplessAudioPlayer | null>(null);
  const isMutedRef = useRef(false);
  const pendingTextQueueRef = useRef<string[]>([]);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcripts, intents, activeTab]);

  const stopMicrophone = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current && inputCtxRef.current.state !== 'closed') {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    setMicActive(false);
    setMicLevel(0);
  }, []);

  const disconnectSession = useCallback(() => {
    stopMicrophone();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (playerRef.current) {
      void playerRef.current.close();
      playerRef.current = null;
    }
    pendingTextQueueRef.current = [];
    setStatus('idle');
    setSpeakerLevel(0);
  }, [stopMicrophone]);

  useEffect(() => {
    return () => {
      disconnectSession();
    };
  }, [disconnectSession]);

  const appendTranscriptChunk = useCallback(
    (role: 'user' | 'assistant', chunk: string) => {
      const cleaned = chunk;
      if (!cleaned) return;
      const nowLabel = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            text: last.text + cleaned,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role,
            text: cleaned.trimStart(),
            timestamp: nowLabel,
          },
        ];
      });
    },
    []
  );

  const startMicrophoneCapture = useCallback(async () => {
    if (micActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputCtxRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (event) => {
        if (isMutedRef.current) {
          setMicLevel(0);
          return;
        }
        const channel = event.inputBuffer.getChannelData(0);
        setMicLevel(computeRms(channel));

        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          const base64 = float32ToPcm16Base64(channel);
          ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      };

      setMicActive(true);
      setIsMuted(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Microphone unavailable: ${err.message}. You can still send typed requests below.`
          : 'Microphone permission denied. You can still send typed requests below.'
      );
    }
  }, [micActive]);

  const openSession = useCallback(
    async (withMic: boolean) => {
      if (status === 'connecting' || status === 'connected') return;

      setErrorMessage(null);
      setStatus('connecting');

      playerRef.current = new GaplessAudioPlayer((level) => {
        setSpeakerLevel(level);
      });

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const wsUrl = `${protocol}//${window.location.host}/api/live?voice=${encodeURIComponent(
        voicePersona
      )}&tz=${encodeURIComponent(tz)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let msg: {
          type?: string;
          data?: string;
          text?: string;
          message?: string;
          intent?: ParsedIntentLog;
          events?: CalendarBlock[];
        };
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          setStatus('connected');
          if (pendingTextQueueRef.current.length > 0) {
            const queued = [...pendingTextQueueRef.current];
            pendingTextQueueRef.current = [];
            for (const qText of queued) {
              ws.send(JSON.stringify({ type: 'text', text: qText }));
            }
          }
          if (withMic) {
            void startMicrophoneCapture();
          }
        } else if (msg.type === 'audio' && msg.data) {
          playerRef.current?.enqueue(msg.data);
        } else if (msg.type === 'interrupted') {
          playerRef.current?.interrupt();
        } else if (msg.type === 'inputTranscript' && msg.text) {
          appendTranscriptChunk('user', msg.text);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          appendTranscriptChunk('assistant', msg.text);
        } else if (msg.type === 'intentParsed' && msg.intent) {
          onIntentLogged(msg.intent);
        } else if (msg.type === 'calendarUpdated' && msg.events) {
          onCalendarUpdated(msg.events);
        } else if (msg.type === 'error') {
          setErrorMessage(msg.message || 'Gemini Live error occurred.');
          setStatus('error');
        } else if (msg.type === 'closed') {
          stopMicrophone();
          setStatus('idle');
        }
      };

      ws.onerror = () => {
        setErrorMessage('WebSocket connection to Gemini Live failed.');
        setStatus('error');
        stopMicrophone();
      };

      ws.onclose = () => {
        stopMicrophone();
        setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      };
    },
    [
      appendTranscriptChunk,
      onCalendarUpdated,
      onIntentLogged,
      startMicrophoneCapture,
      status,
      stopMicrophone,
      voicePersona,
    ]
  );

  const sendTextCommand = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      const nowLabel = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      setTranscripts((prev) => [
        ...prev,
        {
          id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'user',
          text: trimmed,
          timestamp: nowLabel,
        },
      ]);
      setTextInput('');

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && status === 'connected') {
        ws.send(JSON.stringify({ type: 'text', text: trimmed }));
      } else {
        pendingTextQueueRef.current.push(trimmed);
        await openSession(false);
      }
    },
    [openSession, status]
  );

  const combinedLevel = Math.max(micLevel, speakerLevel);
  const barHeights = [0.45, 0.75, 1, 0.65, 0.9, 0.55, 0.8, 0.4];

  return (
    <aside className="flex flex-col h-full bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
      {/* Header & Voice Deck */}
      <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Gemini Live Assistant
            </h2>
            <p className="text-xs text-[#64748B]">
              {status === 'connected'
                ? micActive
                  ? isMuted
                    ? 'Connected · Mic muted'
                    : 'Listening & speaking live'
                  : 'Connected · Text & voice output'
                : status === 'connecting'
                ? 'Opening Gemini Live session...'
                : 'Ready to parse client scheduling intents'}
            </p>
          </div>

          <select
            value={voicePersona}
            disabled={status === 'connected' || status === 'connecting'}
            onChange={(e) => onChangeVoicePersona(e.target.value as VoicePersona)}
            aria-label="Voice persona"
            className="px-2 py-1 text-xs font-medium bg-white border border-[#E2E8F0] rounded text-[#334155] disabled:opacity-60 cursor-pointer"
          >
            {(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as VoicePersona[]).map(
              (v) => (
                <option key={v} value={v}>
                  Voice: {v}
                </option>
              )
            )}
          </select>
        </div>

        {/* Waveform + Session Controls */}
        <div className="mt-3 flex items-center justify-between gap-3 p-3 bg-white border border-[#E2E8F0] rounded-md">
          <div className="flex items-center gap-1 h-7" aria-hidden="true">
            {barHeights.map((multiplier, idx) => {
              const active = status === 'connected';
              const heightPct = active
                ? Math.max(18, Math.min(100, 18 + combinedLevel * 82 * multiplier))
                : 18;
              return (
                <span
                  key={idx}
                  style={{ height: `${heightPct}%` }}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    speakerLevel > 0.05
                      ? 'bg-[#16A34A]'
                      : micActive && !isMuted
                      ? 'bg-[#2563EB]'
                      : 'bg-[#CBD5E1]'
                  }`}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {status === 'connected' ? (
              <>
                {micActive ? (
                  <button
                    type="button"
                    onClick={() => setIsMuted((m) => !m)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isMuted
                        ? 'border-[#D97706]/40 bg-[#FFFBEB] text-[#92400E]'
                        : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    {isMuted ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                    <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startMicrophoneCapture()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Enable Mic</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={disconnectSession}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>End</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={status === 'connecting'}
                onClick={() => void openSession(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>
                  {status === 'connecting' ? 'Connecting...' : 'Start Voice Session'}
                </span>
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="mt-2.5 px-3 py-2 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-1 p-0.5 bg-[#F1F5F9] rounded-md">
          <button
            type="button"
            onClick={() => setActiveTab('transcript')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'transcript'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Transcript
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('intents')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'intents'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Intent Pipeline ({intents.length})
          </button>
        </div>

        {speakerLevel > 0.05 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#16A34A]">
            <Volume2 className="w-3.5 h-3.5" />
            <span>Speaking</span>
          </span>
        )}
      </div>

      {/* Scrollable Feed */}
      <div ref={transcriptScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'transcript' ? (
          transcripts.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-xs text-[#64748B] leading-relaxed">
                Start a voice session or pick a sample client request below to see Gemini Live parse booking intents and update your calendar in real time.
              </p>
              <div className="space-y-1.5">
                {SAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendTextCommand(prompt)}
                    className="w-full text-left px-3 py-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:border-[#BFDBFE] text-xs text-[#334155] transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            transcripts.map((entry) => (
              <div
                key={entry.id}
                className={`p-3 rounded-md border text-xs leading-relaxed ${
                  entry.role === 'user'
                    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A]'
                    : 'bg-[#EFF6FF]/60 border-[#BFDBFE] text-[#0F172A]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1 text-[11px] text-[#64748B]">
                  <span className="font-semibold text-[#334155]">
                    {entry.role === 'user' ? 'Client / You' : 'Cadence'}
                  </span>
                  <span className="font-mono tabular-nums">{entry.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap">{entry.text}</p>
              </div>
            ))
          )
        ) : intents.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#64748B]">
            Parsed tool calls (`checkAvailability`, `blockCalendarSlot`, `rescheduleCalendarBlock`) will appear here with extracted parameters and conflict status.
          </div>
        ) : (
          intents.map((intent) => (
            <div
              key={intent.id}
              className="p-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-[#0F172A]">
                  {intent.toolName}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                    intent.status === 'success'
                      ? 'text-[#16A34A]'
                      : intent.status === 'conflict'
                      ? 'text-[#D97706]'
                      : 'text-[#DC2626]'
                  }`}
                >
                  {intent.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {intent.status === 'success'
                      ? 'Applied'
                      : intent.status === 'conflict'
                      ? 'Conflict'
                      : 'Not Found'}
                  </span>
                </span>
              </div>
              <p className="text-xs text-[#334155]">{intent.summary}</p>
              <pre className="p-2 rounded bg-white border border-[#E2E8F0] font-mono text-[11px] text-[#475569] overflow-x-auto">
                {JSON.stringify(intent.args, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>

      {/* Text Fallback Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendTextCommand(textInput);
        }}
        className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2"
      >
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Type a client scheduling request..."
          className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-md text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#2563EB]"
        />
        <button
          type="submit"
          disabled={!textInput.trim()}
          aria-label="Send request"
          className="p-2 rounded-md bg-[#0F172A] text-white hover:bg-[#1E293B] disabled:opacity-40 transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </aside>
  );
}
