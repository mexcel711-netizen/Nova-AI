import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  Clock,
  Home,
  Menu,
  MessageSquarePlus,
  Settings,
  Sparkles,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
import { CharacterView } from './components/views/CharacterView';
import { HomeView } from './components/views/HomeView';
import { runDesktopApp } from './components/DesktopBridgePanel';
import { MemoryView } from './components/views/MemoryView';
import { RecentView } from './components/views/RecentView';
import { SettingsView } from './components/views/SettingsView';
import { SkillsView } from './components/views/SkillsView';
import {
  isSpeechRecognitionSupported,
  speakText,
  startBrowserRecognition,
  stopAllSpeech,
  type SpeechRecognitionHandle,
} from './lib/voiceService';
import type {
  AppConfig,
  AvatarState,
  ChatApiResponse,
  ChatMessage,
  FacialEmotion,
  MemoryRecord,
  NoteRecord,
  ProviderStatus,
  ReminderRecord,
  SessionSummary,
  SidebarPage,
  SkillActionType,
  SkillConfig,
} from './types/nova';

const DEFAULT_CLIENT_CONFIG: AppConfig = {
  assistant_name: 'NOVA',
  personality: 'friendly_professional',
  custom_prompt:
    'You are NOVA, a poised, warm Pakistani female AI assistant fluent in Urdu, Roman Urdu, and English.',
  language: 'bilingual',
  response_tone: 'casual',
  tts_voice: 'Kore',
  voice_speed: 1.0,
  voice_volume: 1.0,
  stt_model: 'base',
  wake_word: 'hey nova',
  wake_word_enabled: false,
  auto_speak: true,
  deep_thinking_mode: 'auto',
  default_model: 'gemini-4-hydrogen',
  ai_provider: 'auto',
};

const DEFAULT_PROVIDER_STATUS: ProviderStatus = {
  activeProvider: 'google-ai-studio',
  googleAiConfigured: false,
  cloudflareConfigured: false,
  cloudflareBindingActive: false,
};

const NAV_ITEMS: Array<{ id: SidebarPage; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'memory', label: 'Memory', icon: BrainCircuit },
  { id: 'skills', label: 'Skills', icon: Wrench },
  { id: 'character', label: 'Character', icon: UserCog },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function createGreetingMessage(sessionId: string, assistantName: string): ChatMessage {
  return {
    id: `greeting-${sessionId}`,
    sessionId,
    role: 'assistant',
    content: `السلام علیکم! میں ${assistantName} ہوں، آپ کی مدد کے لیے تیار ہوں۔`,
    emotion: 'happy',
    language: 'ur',
    timestamp: new Date().toISOString(),
  };
}

export default function App() {
  const [activePage, setActivePage] = useState<SidebarPage>('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [config, setConfig] = useState<AppConfig>(DEFAULT_CLIENT_CONFIG);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(DEFAULT_PROVIDER_STATUS);
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const [sessionId, setSessionId] = useState<string>(() => `session-${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createGreetingMessage(`session-${Date.now()}`, 'NOVA'),
  ]);

  const [inputValue, setInputValue] = useState('');
  const [forceThinking, setForceThinking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [avatarEmotion, setAvatarEmotion] = useState<FacialEmotion>('calm');
  const [micLevel, setMicLevel] = useState(0);
  const [lipOpenness, setLipOpenness] = useState(0);
  const [lipWidth, setLipWidth] = useState(0);

  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [launchedUrl, setLaunchedUrl] = useState<string | null>(null);
  const [clockText, setClockText] = useState<string>(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );

  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null);
  const wakeRecRef = useRef<SpeechRecognitionHandle | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRafRef = useRef<number>(0);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = (await res.json()) as {
        config: AppConfig;
        skills: SkillConfig[];
        memories: MemoryRecord[];
        notes: NoteRecord[];
        reminders: ReminderRecord[];
        sessions: SessionSummary[];
        providerStatus?: ProviderStatus;
      };
      setConfig(data.config);
      if (data.providerStatus) setProviderStatus(data.providerStatus);
      setSkills(data.skills);
      setMemories(data.memories);
      setNotes(data.notes);
      setReminders(data.reminders);
      setSessions(data.sessions);
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id.startsWith('greeting-')) {
          return [createGreetingMessage(prev[0].sessionId, data.config.assistant_name)];
        }
        return prev;
      });
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const id = setInterval(() => {
      setClockText(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      );
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const stopMicMeter = useCallback(() => {
    if (micRafRef.current) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = 0;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    stopMicMeter();
    setAvatarState((cur) => (cur === 'listening' ? 'idle' : cur));
  }, [stopMicMeter]);

  const handleTerminate = useCallback(() => {
    stopAllSpeech();
    setLipOpenness(0);
    setLipWidth(0);
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    stopListening();
    setIsSending(false);
    setAvatarState('idle');
  }, [stopListening]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleTerminate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTerminate]);

  const speakWithLipSync = useCallback(
    async (text: string, language: 'en' | 'ur', emotion: FacialEmotion) => {
      setAvatarEmotion(emotion);
      await speakText({
        text,
        voiceName: config.tts_voice,
        language,
        emotion,
        voiceSpeed: config.voice_speed,
        voiceVolume: config.voice_volume,
        onStart: () => setAvatarState('speaking'),
        onLipSync: (open, width) => {
          setLipOpenness(open);
          setLipWidth(width);
        },
        onEnd: () => {
          setLipOpenness(0);
          setLipWidth(0);
          setAvatarState('idle');
        },
      });
    },
    [config.tts_voice, config.voice_speed, config.voice_volume]
  );

  const handleSendMessage = useCallback(
    async (explicitText?: string) => {
      const text = (explicitText ?? inputValue).trim();
      if (!text || isSending) return;

      stopAllSpeech();
      setLipOpenness(0);
      setLipWidth(0);
      setErrorBanner(null);
      setWarningBanner(null);
      setLaunchedUrl(null);
      if (!explicitText) setInputValue('');

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sessionId,
        role: 'user',
        content: text,
        language: 'en',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);
      setAvatarState('thinking');

      const controller = new AbortController();
      chatAbortRef.current = controller;

      try {
        const desktopMatch = text.match(/^(?:please\\s+)?(?:(?:open|launch)\\s+)?(?:google\\s+)?(chrome|edge|notepad|calculator)(?:\\s+(?:kholo|open(?:\\s+karo)?|launch(?:\\s+karo)?))?$/i);
        if (desktopMatch) {
          const app = desktopMatch[1].toLowerCase();
          await runDesktopApp(app);
          const reply = `${app[0].toUpperCase() + app.slice(1)} launch kar diya hai.`;
          const assistantMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            sessionId,
            role: 'assistant',
            content: reply,
            emotion: 'happy',
            language: 'ur',
            timestamp: new Date().toISOString(),
            modelUsed: 'desktop-companion',
            providerUsed: 'local-desktop',
            thinkingUsed: false,
            skillExecuted: 'desktop_launch',
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setIsSending(false);
          chatAbortRef.current = null;
          setAvatarEmotion('happy');
          if (config.auto_speak) await speakWithLipSync(reply, 'ur', 'happy');
          else setAvatarState('idle');
          return;
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            sessionId,
            forceThinking,
            history: messages.slice(-8),
          }),
          signal: controller.signal,
        });

        const data = (await res.json()) as ChatApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Assistant request failed.');
        }

        if (data.warning) {
          setWarningBanner(data.warning);
        }

        if (data.sideEffect?.type === 'open_url' && data.sideEffect.url) {
          setLaunchedUrl(data.sideEffect.url);
        }

        const replyEmotion: FacialEmotion = data.emotion || 'calm';
        setAvatarEmotion(replyEmotion);

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          sessionId,
          role: 'assistant',
          content: data.reply,
          emotion: replyEmotion,
          language: data.language,
          timestamp: new Date().toISOString(),
          modelUsed: data.modelUsed,
          providerUsed: data.providerUsed,
          thinkingUsed: data.thinkingUsed,
          skillExecuted: data.skillExecuted,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsSending(false);
        chatAbortRef.current = null;

        void fetchState();

        if (config.auto_speak) {
          await speakWithLipSync(data.reply, data.language, replyEmotion);
        } else {
          setAvatarState('idle');
        }
      } catch (err) {
        if (controller.signal.aborted) {
          setAvatarState('idle');
          return;
        }
        const message = err instanceof Error ? err.message : 'Unable to reach NOVA backend.';
        setErrorBanner(message);
        setAvatarEmotion('sad');
        setAvatarState('error');
      } finally {
        setIsSending(false);
        chatAbortRef.current = null;
      }
    },
    [
      inputValue,
      isSending,
      sessionId,
      forceThinking,
      messages,
      config.auto_speak,
      fetchState,
      speakWithLipSync,
    ]
  );

  const startMicMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        let total = 0;
        for (let i = 0; i < data.length; i++) total += data[i];
        const norm = Math.min(1, total / data.length / 110);
        setMicLevel(norm);
        micRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setMicLevel(0.45);
    }
  }, []);

  const handleToggleListening = useCallback(() => {
    if (avatarState === 'listening') {
      stopListening();
      return;
    }

    stopAllSpeech();
    setLipOpenness(0);
    setLipWidth(0);
    setErrorBanner(null);

    if (!isSpeechRecognitionSupported()) {
      setErrorBanner(
        'Live SpeechRecognition is unavailable in this browser. Type your command below or use Chrome/Edge for voice capture.'
      );
      setAvatarState('error');
      return;
    }

    setAvatarState('listening');
    void startMicMeter();

    let latestTranscript = '';
    let sentFinal = false;
    const handle = startBrowserRecognition({
      lang: config.language === 'ur' ? 'ur-PK' : 'en-US',
      continuous: false,
      onTranscript: (transcript, isFinal) => {
        latestTranscript = transcript;
        setInputValue(transcript);
        if (isFinal && transcript.trim() && !sentFinal) {
          sentFinal = true;
          stopListening();
          void handleSendMessage(transcript.trim());
        }
      },
      onError: (err) => {
        stopListening();
        if (err !== 'no-speech' && err !== 'aborted') {
          setErrorBanner(`Microphone / speech error: ${err}`);
          setAvatarState('error');
        }
      },
      onEnd: () => {
        stopMicMeter();
        recognitionRef.current = null;
        if (latestTranscript.trim() && !sentFinal) {
          sentFinal = true;
          void handleSendMessage(latestTranscript.trim());
        } else {
          setAvatarState((cur) => (cur === 'listening' ? 'idle' : cur));
        }
      },
    });
    recognitionRef.current = handle;
  }, [
    avatarState,
    config.language,
    handleSendMessage,
    startMicMeter,
    stopListening,
    stopMicMeter,
  ]);

  useEffect(() => {
    if (!wakeWordActive) {
      if (wakeRecRef.current) {
        wakeRecRef.current.stop();
        wakeRecRef.current = null;
      }
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setErrorBanner('Wake word listener requires browser SpeechRecognition support.');
      setWakeWordActive(false);
      return;
    }

    const wakePhrase = config.wake_word.toLowerCase();
    const handle = startBrowserRecognition({
      lang: 'en-US',
      continuous: true,
      onTranscript: (transcript) => {
        const lower = transcript.toLowerCase();
        if (lower.includes(wakePhrase)) {
          wakeRecRef.current?.stop();
          wakeRecRef.current = null;
          setWakeWordActive(false);
          handleToggleListening();
        }
      },
      onError: () => {
        setWakeWordActive(false);
      },
      onEnd: () => {
        wakeRecRef.current = null;
      },
    });
    wakeRecRef.current = handle;

    return () => {
      handle?.stop();
    };
  }, [wakeWordActive, config.wake_word, handleToggleListening]);

  const handleNewSession = () => {
    handleTerminate();
    const nextId = `session-${Date.now()}`;
    setSessionId(nextId);
    setMessages([createGreetingMessage(nextId, config.assistant_name)]);
    setAvatarEmotion('calm');
    setLaunchedUrl(null);
    setErrorBanner(null);
    setWarningBanner(null);
    setActivePage('home');
  };

  const handleSaveConfig = async (partial: Partial<AppConfig>) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        config: AppConfig;
        providerStatus?: ProviderStatus;
      };
      setConfig(data.config);
      if (data.providerStatus) setProviderStatus(data.providerStatus);
    }
  };

  const currentNavLabel =
    NAV_ITEMS.find((item) => item.id === activePage)?.label ?? 'Home';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0F] text-slate-100">
      {/* Top Bar — Strict 3-Zone Contract */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-8 border-b border-slate-800/80 bg-[#0D1117] px-5">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="font-display text-lg font-bold tracking-wide text-white whitespace-nowrap shrink-0">
            {config.assistant_name} AI
          </span>
        </div>

        <div className="hidden items-center gap-4 text-xs text-slate-400 sm:flex whitespace-nowrap shrink-0">
          <span className="font-medium text-slate-200">{currentNavLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-400">{clockText}</span>
          {launchedUrl && (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={launchedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-cyan-400 underline underline-offset-4 hover:text-cyan-300"
              >
                Open launched link
              </a>
            </>
          )}
        </div>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleNewSession}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-3.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-white whitespace-nowrap shrink-0"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 text-cyan-400" />
            <span>New Session</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar Navigation */}
        <aside
          aria-label="Primary navigation"
          className={`${
            mobileNavOpen ? 'absolute inset-y-0 left-0 z-40 flex' : 'hidden'
          } w-56 shrink-0 flex-col justify-between border-r border-slate-800/80 bg-[#0D1117] p-3 md:static md:flex`}
        >
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActivePage(item.id);
                    setMobileNavOpen(false);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-800/80 pt-3 px-2 text-xs text-slate-500 tabular-nums">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>{memories.length} memories</span>
            </div>
            <p className="mt-1">
              {skills.filter((s) => s.is_enabled).length} skills active
            </p>
          </div>
        </aside>

        {/* Active View Viewport */}
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[#0A0A0F]">
          {activePage === 'home' && (
            <HomeView
              config={config}
              providerStatus={providerStatus}
              avatarState={avatarState}
              avatarEmotion={avatarEmotion}
              micLevel={micLevel}
              lipOpenness={lipOpenness}
              lipWidth={lipWidth}
              messages={messages}
              inputValue={inputValue}
              forceThinking={forceThinking}
              isSending={isSending}
              wakeWordActive={wakeWordActive}
              autoSpeak={config.auto_speak}
              errorBanner={errorBanner}
              warningBanner={warningBanner}
              onInputChange={setInputValue}
              onSelectEmotion={setAvatarEmotion}
              onSendMessage={handleSendMessage}
              onToggleForceThinking={() => setForceThinking((v) => !v)}
              onToggleListening={handleToggleListening}
              onToggleWakeWord={() => setWakeWordActive((v) => !v)}
              onToggleAutoSpeak={() => handleSaveConfig({ auto_speak: !config.auto_speak })}
              onTerminate={handleTerminate}
              onReplayMessage={(msg) =>
                void speakWithLipSync(msg.content, msg.language, msg.emotion || 'calm')
              }
              onDismissError={() => {
                setErrorBanner(null);
                setAvatarState('idle');
                setAvatarEmotion('calm');
              }}
            />
          )}

          {activePage === 'memory' && (
            <MemoryView
              memories={memories}
              notes={notes}
              reminders={reminders}
              onAddMemory={async (input) => {
                const res = await fetch('/api/memories', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(input),
                });
                if (res.ok) {
                  const data = (await res.json()) as { memories: MemoryRecord[] };
                  setMemories(data.memories);
                }
              }}
              onDeleteMemory={async (id) => {
                const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
                if (res.ok) {
                  const data = (await res.json()) as { memories: MemoryRecord[] };
                  setMemories(data.memories);
                }
              }}
              onClearAllMemories={async () => {
                const res = await fetch('/api/memories', { method: 'DELETE' });
                if (res.ok) {
                  setMemories([]);
                }
              }}
              onAddNote={async (title, content) => {
                const res = await fetch('/api/notes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, content }),
                });
                if (res.ok) {
                  const data = (await res.json()) as { notes: NoteRecord[] };
                  setNotes(data.notes);
                }
              }}
              onDeleteNote={async (id) => {
                const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
                if (res.ok) {
                  const data = (await res.json()) as { notes: NoteRecord[] };
                  setNotes(data.notes);
                }
              }}
              onAddReminder={async (title, remind_at) => {
                const res = await fetch('/api/reminders', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, remind_at }),
                });
                if (res.ok) {
                  const data = (await res.json()) as { reminders: ReminderRecord[] };
                  setReminders(data.reminders);
                }
              }}
              onToggleReminder={async (id, is_done) => {
                const res = await fetch(`/api/reminders/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ is_done }),
                });
                if (res.ok) {
                  const data = (await res.json()) as { reminders: ReminderRecord[] };
                  setReminders(data.reminders);
                }
              }}
              onDeleteReminder={async (id) => {
                const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
                if (res.ok) {
                  const data = (await res.json()) as { reminders: ReminderRecord[] };
                  setReminders(data.reminders);
                }
              }}
            />
          )}

          {activePage === 'skills' && (
            <SkillsView
              skills={skills}
              onToggleSkill={async (id, is_enabled) => {
                const res = await fetch(`/api/skills/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ is_enabled }),
                });
                if (res.ok) {
                  setSkills((prev) =>
                    prev.map((s) => (s.id === id ? { ...s, is_enabled } : s))
                  );
                }
              }}
              onCreateSkill={async (input: {
                display_name: string;
                description: string;
                trigger_phrases: string[];
                action_type: SkillActionType;
                action_value: string;
              }) => {
                const res = await fetch('/api/skills', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(input),
                });
                if (res.ok) {
                  const data = (await res.json()) as { skills: SkillConfig[] };
                  setSkills(data.skills);
                }
              }}
              onDeleteSkill={async (id) => {
                const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
                if (res.ok) {
                  const data = (await res.json()) as { skills: SkillConfig[] };
                  setSkills(data.skills);
                }
              }}
              onTestSkill={(phrase) => {
                setActivePage('home');
                void handleSendMessage(phrase);
              }}
            />
          )}

          {activePage === 'character' && (
            <CharacterView config={config} onSaveConfig={handleSaveConfig} />
          )}

          {activePage === 'recent' && (
            <RecentView
              sessions={sessions}
              activeSessionId={sessionId}
              onResumeSession={async (id) => {
                const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
                if (res.ok) {
                  const data = (await res.json()) as { messages: ChatMessage[] };
                  setSessionId(id);
                  setMessages(
                    data.messages.length > 0
                      ? data.messages
                      : [createGreetingMessage(id, config.assistant_name)]
                  );
                  setActivePage('home');
                }
              }}
              onDeleteSession={async (id) => {
                const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
                  method: 'DELETE',
                });
                if (res.ok) {
                  const data = (await res.json()) as { sessions: SessionSummary[] };
                  setSessions(data.sessions);
                }
              }}
            />
          )}

          {activePage === 'settings' && (
            <SettingsView
              config={config}
              providerStatus={providerStatus}
              memoryCount={memories.length}
              onSaveConfig={handleSaveConfig}
              onClearAllMemories={async () => {
                const res = await fetch('/api/memories', { method: 'DELETE' });
                if (res.ok) {
                  setMemories([]);
                }
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
