import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Circle,
  Mic,
  MicOff,
  Plus,
  Radio,
  Send,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AppConfig,
  AvatarState,
  ChatMessage,
  FacialEmotion,
  MemoryRecord,
  NoteRecord,
  ProviderStatus,
  ReminderRecord,
  SidebarPage,
  SkillConfig,
} from '../../types/nova';
import { HolographicAvatar } from '../HolographicAvatar';
import { DesktopBridgePanel } from '../DesktopBridgePanel';

interface HomeViewProps {
  config: AppConfig;
  providerStatus: ProviderStatus;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  skills: SkillConfig[];
  avatarState: AvatarState;
  avatarEmotion: FacialEmotion;
  micLevel: number;
  lipOpenness: number;
  lipWidth: number;
  messages: ChatMessage[];
  inputValue: string;
  forceThinking: boolean;
  isSending: boolean;
  wakeWordActive: boolean;
  autoSpeak: boolean;
  errorBanner: string | null;
  warningBanner: string | null;
  onNavigate: (page: SidebarPage) => void;
  onInputChange: (val: string) => void;
  onSelectEmotion: (emotion: FacialEmotion) => void;
  onSendMessage: (text?: string) => void;
  onToggleForceThinking: () => void;
  onToggleListening: () => void;
  onToggleWakeWord: () => void;
  onToggleAutoSpeak: () => void;
  onTerminate: () => void;
  onReplayMessage: (msg: ChatMessage) => void;
  onDismissError: () => void;
  onSaveConfig: (partial: Partial<AppConfig>) => Promise<void>;
  onToggleSkill: (id: number, isEnabled: boolean) => Promise<void>;
  onAddNote: (title: string, content: string) => Promise<void>;
  onDeleteNote: (id: number) => Promise<void>;
  onAddReminder: (title: string, remindAt: string) => Promise<void>;
  onToggleReminder: (id: number, isDone: boolean) => Promise<void>;
  onDeleteReminder: (id: number) => Promise<void>;
}

type CenterHubTab = 'visual' | 'skills' | 'voice';
type RightPanelTab = 'chat' | 'notes' | 'reminders';

const QUICK_VISUAL_PROMPTS = [
  { label: 'Test Urdu Voice (وقت اور سلام)', text: 'وقت کیا ہے؟' },
  { label: 'Explain how a black hole bends light', text: 'Show and explain simply how a black hole bends light.' },
  { label: 'Create a quick bilingual note', text: 'create note: Prepare NOVA AI deployment checklist' },
  {
    label: 'Deep Thinking architecture blueprint',
    text: 'Design a resilient event-driven architecture for an offline-first voice assistant and explain trade-offs step by step.',
  },
];

const EMOTION_OPTIONS: Array<{ id: FacialEmotion; label: string }> = [
  { id: 'calm', label: 'Calm' },
  { id: 'happy', label: 'Happy' },
  { id: 'sad', label: 'Sad' },
  { id: 'surprised', label: 'Surprised' },
];

// Clean cybernetic dot-matrix coordinate clusters for global edge node visualization
const RADAR_CLUSTERS: Array<{ x: number; y: number; tone: 'cyan' | 'emerald' | 'amber'; label: string }> = [
  { x: 46, y: 42, tone: 'cyan', label: 'US-West' },
  { x: 74, y: 48, tone: 'cyan', label: 'US-East' },
  { x: 132, y: 38, tone: 'emerald', label: 'EU-Central' },
  { x: 174, y: 54, tone: 'amber', label: 'PK-South' },
  { x: 204, y: 60, tone: 'cyan', label: 'Asia-East' },
  { x: 224, y: 92, tone: 'emerald', label: 'AP-South' },
];

const MAP_GRID_DOTS: Array<[number, number]> = [
  [36, 36], [46, 34], [56, 36], [66, 38], [40, 44], [52, 46], [64, 46], [74, 46], [58, 56], [68, 66], [76, 78], [80, 90],
  [120, 32], [130, 32], [140, 34], [126, 42], [136, 42], [146, 42], [132, 54], [142, 64], [146, 78], [138, 88],
  [158, 36], [168, 38], [178, 36], [188, 36], [198, 40], [208, 44], [164, 48], [174, 52], [184, 52], [194, 54], [204, 56],
  [182, 64], [192, 66], [208, 72], [218, 86], [228, 92], [216, 98],
];

export function HomeView({
  config,
  providerStatus,
  memories,
  notes,
  reminders,
  skills,
  avatarState,
  avatarEmotion,
  micLevel,
  lipOpenness,
  lipWidth,
  messages,
  inputValue,
  forceThinking,
  isSending,
  wakeWordActive,
  autoSpeak,
  errorBanner,
  warningBanner,
  onNavigate,
  onInputChange,
  onSelectEmotion,
  onSendMessage,
  onToggleForceThinking,
  onToggleListening,
  onToggleWakeWord,
  onToggleAutoSpeak,
  onTerminate,
  onReplayMessage,
  onDismissError,
  onSaveConfig,
  onToggleSkill,
  onAddNote,
  onDeleteNote,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
}: HomeViewProps) {
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [speechLang, setSpeechLang] = useState<'en-US' | 'ur-PK'>('ur-PK');
  const [centerTab, setCenterTab] = useState<CenterHubTab>('visual');
  const [rightTab, setRightTab] = useState<RightPanelTab>('chat');

  // Inline Note & Reminder quick forms in Right Panel
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickRemText, setQuickRemText] = useState('');
  const [quickRemTime, setQuickRemTime] = useState('06:00 PM');

  useEffect(() => {
    const el = chatListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isSending, rightTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        setRightTab('chat');
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const stateDescription =
    avatarState === 'listening'
      ? 'Listening for voice command...'
      : avatarState === 'thinking'
        ? 'Reasoning with deep context...'
        : avatarState === 'speaking'
          ? `${config.assistant_name} is speaking (${avatarEmotion})`
          : avatarState === 'error'
            ? 'Attention required'
            : wakeWordActive
              ? `Ready · Say "${config.wake_word}"`
              : 'Ready for voice or text command';

  const providerLabel =
    providerStatus.activeProvider === 'cloudflare-binding'
      ? 'Cloudflare AI Binding'
      : providerStatus.activeProvider === 'cloudflare-rest'
        ? 'Cloudflare Workers AI'
        : providerStatus.activeProvider === 'google-ai-studio'
          ? 'Google AI Studio'
          : 'Skill Mode (Set AI Key)';

  const languageLabel =
    config.language === 'bilingual'
      ? 'Urdu + English'
      : config.language === 'ur'
        ? 'Urdu'
        : 'English';

  const activeSkillsCount = skills.filter((s) => s.is_enabled).length;
  const pendingRemindersCount = reminders.filter((r) => !r.is_done).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;
    onSendMessage();
  };

  const handleQuickNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNoteText.trim()) return;
    await onAddNote('Quick Note', quickNoteText.trim());
    setQuickNoteText('');
  };

  const handleQuickRemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRemText.trim()) return;
    await onAddReminder(quickRemText.trim(), quickRemTime.trim() || 'Today');
    setQuickRemText('');
  };

  return (
    <div className="grid h-full content-start gap-3 overflow-y-auto bg-[#050911] p-3 grid-cols-1 lg:min-h-0 lg:content-stretch lg:grid-cols-[240px_minmax(0,1fr)_340px] xl:grid-cols-[264px_minmax(0,1fr)_380px] lg:overflow-hidden">
      {/* FAR LEFT COLUMN: Core Feed + Cybernetic Global Edge Map + Stored Memory Highlights */}
      <aside
        aria-label="Core context and live intelligence"
        className="order-2 flex flex-col gap-3 lg:order-1 lg:min-h-0"
      >
        {/* Top Live Feed / Voice Status Card */}
        <div className="rounded-xl border border-cyan-500/20 bg-[#070E1A] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Live Feed
            </h3>
            <button
              type="button"
              onClick={() => setSpeechLang((prev) => (prev === 'en-US' ? 'ur-PK' : 'en-US'))}
              className="rounded border border-slate-700/80 bg-[#0B1526] px-2 py-0.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-white whitespace-nowrap shrink-0"
            >
              {speechLang === 'ur-PK' ? 'Urdu (PK)' : 'English'}
            </button>
          </div>
          <p className="mt-2 text-sm font-medium text-white truncate">{providerLabel}</p>
          <p className="mt-0.5 text-xs text-slate-400 truncate">
            {languageLabel} · {config.tts_voice} · {config.voice_speed.toFixed(2)}x
          </p>
        </div>

        {/* Middle Cybernetic Global Edge & Node Map */}
        <div className="rounded-xl border border-cyan-500/20 bg-[#070E1A] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
              AI Mesh Topology
            </h3>
            <span className="text-[11px] font-mono text-cyan-400 tabular-nums">
              {providerStatus.cloudflareBindingActive ? 'CF-Edge' : 'Local'}
            </span>
          </div>

          <div className="mt-2.5 overflow-hidden rounded-lg border border-slate-800/90 bg-[#050A14] p-2">
            <svg
              viewBox="0 0 260 120"
              className="h-28 w-full"
              aria-label="Global AI edge topology map"
            >
              {/* Subtle coordinate grid */}
              <line x1="0" y1="60" x2="260" y2="60" stroke="#1E293B" strokeWidth="0.6" strokeDasharray="3 3" />
              <line x1="130" y1="0" x2="130" y2="120" stroke="#1E293B" strokeWidth="0.6" strokeDasharray="3 3" />

              {/* Continental dot matrix */}
              {MAP_GRID_DOTS.map(([dx, dy], idx) => (
                <circle key={idx} cx={dx} cy={dy} r="1.4" fill="#1E3A5F" />
              ))}

              {/* Connecting node arcs */}
              <path
                d="M74 48 Q105 24 132 38 T174 54 T204 60"
                fill="none"
                stroke="#00F5FF"
                strokeOpacity="0.35"
                strokeWidth="1"
              />
              <path
                d="M132 38 Q168 78 224 92"
                fill="none"
                stroke="#10B981"
                strokeOpacity="0.28"
                strokeWidth="1"
              />

              {/* Highlighted node clusters */}
              {RADAR_CLUSTERS.map((node) => {
                const color =
                  node.tone === 'emerald'
                    ? '#10B981'
                    : node.tone === 'amber'
                      ? '#F59E0B'
                      : '#00F5FF';
                return (
                  <g key={node.label}>
                    <circle cx={node.x} cy={node.y} r="7" fill={color} fillOpacity="0.16" />
                    <circle cx={node.x} cy={node.y} r="2.6" fill={color} />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>{activeSkillsCount} skills active</span>
            <span aria-hidden="true">·</span>
            <span>{memories.length} memories</span>
          </div>
        </div>

        {/* Bottom Stored Intelligence / Memories List */}
        <div className="flex flex-1 flex-col justify-between rounded-xl border border-slate-800/90 bg-[#070E1A] p-3.5 lg:min-h-0">
          <div className="min-h-0 overflow-y-auto pr-0.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                Stored Intelligence
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('memory')}
                className="text-[11px] font-medium text-cyan-400 transition-colors hover:text-cyan-300 whitespace-nowrap shrink-0"
              >
                Manage
              </button>
            </div>

            {memories.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                No long-term facts stored yet. Share preferences in chat or add one in Memory.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-2.5">
                {memories.slice(0, 4).map((mem) => (
                  <li key={mem.id} className="flex items-start gap-2 text-xs">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-cyan-400"
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-2 leading-snug text-slate-200">{mem.value}</p>
                      <p className="mt-0.5 text-[11px] capitalize text-slate-500">
                        {mem.category}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400 tabular-nums">
            <span>{notes.length} notes</span>
            <span aria-hidden="true">·</span>
            <span>{pendingRemindersCount} reminders</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onNavigate('recent')}
              className="text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
            >
              History
            </button>
          </div>
        </div>
      </aside>

      {/* CENTER COLUMN: 4-Node Circuit Bus + Holographic Portrait Chamber + Visual/Neural Hub */}
      <section
        aria-label="Assistant command stage"
        className="order-1 flex flex-col gap-3 lg:order-2 lg:min-h-0"
      >
        {/* TOP STAGE: 4 Module Cards + Angled Circuit Bus + Glowing Portrait Chamber + Terminate */}
        <div className="rounded-xl border border-cyan-500/25 bg-[#070E1A] p-3.5 shadow-[0_0_45px_rgba(0,245,255,0.06)]">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {/* 4 Stacked Module Nodes + Multi-Color SVG Circuit Traces */}
            <div className="relative grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-44 sm:flex-col sm:gap-2.5">
              {/* Angled Circuit Bus SVG connecting all 4 nodes cleanly to the Portrait Chamber */}
              <svg
                viewBox="0 0 54 220"
                className="pointer-events-none absolute -right-11 top-2 hidden h-[204px] w-12 sm:block"
                aria-hidden="true"
              >
                {/* Node 1: Memory (Cyan) */}
                <path
                  d="M0 20 L22 20 L38 72 L54 72"
                  fill="none"
                  stroke="#00F5FF"
                  strokeOpacity="0.65"
                  strokeWidth="1.6"
                />
                <circle cx="51" cy="72" r="2.2" fill="#00F5FF" />

                {/* Node 2: Skills (Emerald) */}
                <path
                  d="M0 78 L26 78 L38 96 L54 96"
                  fill="none"
                  stroke="#10B981"
                  strokeOpacity="0.65"
                  strokeWidth="1.6"
                />
                <circle cx="51" cy="96" r="2.2" fill="#10B981" />

                {/* Node 3: Character (Amber) */}
                <path
                  d="M0 138 L26 138 L38 122 L54 122"
                  fill="none"
                  stroke="#F59E0B"
                  strokeOpacity="0.65"
                  strokeWidth="1.6"
                />
                <circle cx="51" cy="122" r="2.2" fill="#F59E0B" />

                {/* Node 4: Settings (Sky) */}
                <path
                  d="M0 198 L22 198 L38 148 L54 148"
                  fill="none"
                  stroke="#38BDF8"
                  strokeOpacity="0.65"
                  strokeWidth="1.6"
                />
                <circle cx="51" cy="148" r="2.2" fill="#38BDF8" />
              </svg>

              <button
                type="button"
                onClick={() => onNavigate('memory')}
                className="min-w-0 rounded-lg border border-cyan-500/35 bg-[#0A1424] px-3 py-2 text-left transition-colors hover:border-cyan-400 hover:bg-[#0E1C32]"
              >
                <span className="block font-display text-xs font-semibold tracking-wide text-cyan-300 whitespace-nowrap">
                  MEMORY
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400 tabular-nums">
                  {memories.length} stored
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('skills')}
                className="min-w-0 rounded-lg border border-emerald-500/35 bg-[#0A1424] px-3 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-[#0E1C32]"
              >
                <span className="block font-display text-xs font-semibold tracking-wide text-emerald-300 whitespace-nowrap">
                  SKILLS
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400 tabular-nums">
                  {activeSkillsCount} active
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('character')}
                className="min-w-0 rounded-lg border border-amber-500/35 bg-[#0A1424] px-3 py-2 text-left transition-colors hover:border-amber-400 hover:bg-[#0E1C32]"
              >
                <span className="block font-display text-xs font-semibold tracking-wide text-amber-300 whitespace-nowrap">
                  CHARACTER
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                  {config.assistant_name} · {config.language}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="min-w-0 rounded-lg border border-sky-500/35 bg-[#0A1424] px-3 py-2 text-left transition-colors hover:border-sky-400 hover:bg-[#0E1C32]"
              >
                <span className="block font-display text-xs font-semibold tracking-wide text-sky-300 whitespace-nowrap">
                  SETTINGS
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  Voice &amp; AI
                </span>
              </button>
            </div>

            {/* Right-Hand Glowing Holographic Portrait Chamber */}
            <div className="relative flex flex-1 flex-col items-center rounded-xl border border-cyan-400/25 bg-[#050A14] px-3 py-2.5 sm:ml-6">
              {/* Subtle HUD Corner Brackets */}
              <span aria-hidden="true" className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 border-l border-t border-cyan-400/60" />
              <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 border-r border-t border-cyan-400/60" />
              <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-2 h-2.5 w-2.5 border-b border-l border-cyan-400/60" />
              <span aria-hidden="true" className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 border-b border-r border-cyan-400/60" />

              <HolographicAvatar
                state={avatarState}
                emotion={avatarEmotion}
                assistantName={config.assistant_name}
                micLevel={micLevel}
                lipOpenness={lipOpenness}
                lipWidth={lipWidth}
              />

              <p
                className="mt-0.5 text-center text-xs font-medium text-cyan-200/90"
                data-testid="avatar-status-text"
              >
                {stateDescription}
              </p>

              {/* Prominent Crimson TERMINATE Bar right below portrait (matching reference) */}
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onTerminate}
                  aria-label="Terminate active speech or processing"
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/60 bg-rose-600/20 px-4 py-1 text-xs font-semibold tracking-wider text-rose-200 transition-colors hover:bg-rose-600/35 hover:text-white whitespace-nowrap shrink-0"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>TERMINATE</span>
                </button>
              </div>
            </div>
          </div>

          {/* Unified Voice & Expression Control Strip */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5">
            <div
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0A1322] p-0.5"
              role="group"
              aria-label="Facial expression"
            >
              {EMOTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectEmotion(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    avatarEmotion === opt.id
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleListening}
                aria-label={avatarState === 'listening' ? 'Stop listening' : 'Start listening'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  avatarState === 'listening'
                    ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                    : 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                }`}
              >
                {avatarState === 'listening' ? (
                  <>
                    <MicOff className="h-3.5 w-3.5" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" />
                    <span>Speak</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleWakeWord}
                aria-pressed={wakeWordActive}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  wakeWordActive
                    ? 'border-cyan-500/40 bg-[#0D1626] text-cyan-300'
                    : 'border-slate-800 bg-[#0D1626] text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>{wakeWordActive ? 'Wake On' : 'Wake Off'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleAutoSpeak}
                aria-pressed={autoSpeak}
                aria-label={autoSpeak ? 'Mute voice replies' : 'Enable voice replies'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0D1626] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white whitespace-nowrap shrink-0"
              >
                {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span>{autoSpeak ? 'Auto Voice' : 'Muted'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM CENTER CARD: Neural Hub with Live Tabs (Visual Hub | Skills | Voice) */}
        <div className="flex flex-1 flex-col rounded-xl border border-slate-800/90 bg-[#070E1A] p-4 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
              Neural Hub
            </h3>
            <div
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#050A14] p-0.5"
              role="tablist"
              aria-label="Neural hub modes"
            >
              {(
                [
                  { id: 'visual', label: 'Visual Hub' },
                  { id: 'skills', label: 'Quick Skills' },
                  { id: 'voice', label: 'Voice Tuning' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={centerTab === tab.id}
                  onClick={() => setCenterTab(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    centerTab === tab.id
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: Visual Hub (Isometric Layered Architecture + "What do you want to see?") */}
          {centerTab === 'visual' && (
            <div className="mt-3 grid flex-1 grid-cols-1 items-center gap-4 sm:grid-cols-12 lg:min-h-0">
              {/* Isometric Glowing Architecture Stack */}
              <div className="flex flex-col items-center justify-center sm:col-span-5">
                <svg
                  viewBox="0 0 200 156"
                  className="h-36 w-48"
                  aria-label="Interactive isometric neural stack for Persona, Skills, and Memory"
                >
                  {/* Vertical guide lines */}
                  <line x1="100" y1="20" x2="100" y2="136" stroke="#00F5FF" strokeOpacity="0.18" strokeDasharray="3 3" />

                  {/* Bottom Plate: Memory Vault */}
                  <g onClick={() => onNavigate('memory')} className="cursor-pointer opacity-90 hover:opacity-100">
                    <polygon
                      points="100,90 172,114 100,138 28,114"
                      fill="rgba(14, 165, 233, 0.14)"
                      stroke="#0284C7"
                      strokeWidth="1.4"
                    />
                    <polygon points="28,114 100,138 100,146 28,122" fill="rgba(2, 132, 199, 0.22)" stroke="#0284C7" strokeWidth="1" />
                    <polygon points="172,114 100,138 100,146 172,122" fill="rgba(14, 165, 233, 0.12)" stroke="#0284C7" strokeWidth="1" />
                  </g>

                  {/* Middle Plate: Skills & Tools */}
                  <g onClick={() => onNavigate('skills')} className="cursor-pointer opacity-95 hover:opacity-100">
                    <polygon
                      points="100,56 172,80 100,104 28,80"
                      fill="rgba(0, 245, 255, 0.14)"
                      stroke="#22D3EE"
                      strokeWidth="1.5"
                    />
                    <polygon points="28,80 100,104 100,112 28,88" fill="rgba(34, 211, 238, 0.22)" stroke="#22D3EE" strokeWidth="1" />
                    <polygon points="172,80 100,104 100,112 172,88" fill="rgba(34, 211, 238, 0.12)" stroke="#22D3EE" strokeWidth="1" />
                  </g>

                  {/* Top Plate: Holographic Face & Urdu Neural Engine + 3 Isometric Nodes */}
                  <g onClick={() => onNavigate('character')} className="cursor-pointer hover:opacity-100">
                    <polygon
                      points="100,22 172,46 100,70 28,46"
                      fill="rgba(0, 245, 255, 0.20)"
                      stroke="#00F5FF"
                      strokeWidth="1.7"
                    />
                    <polygon points="28,46 100,70 100,78 28,54" fill="rgba(0, 245, 255, 0.28)" stroke="#00F5FF" strokeWidth="1" />
                    <polygon points="172,46 100,70 100,78 172,54" fill="rgba(0, 245, 255, 0.16)" stroke="#00F5FF" strokeWidth="1" />
                    {/* Small glowing data cubes on top plate */}
                    <polygon points="100,12 114,18 100,24 86,18" fill="rgba(0,245,255,0.45)" stroke="#67E8F9" strokeWidth="1" />
                    <polygon points="86,18 100,24 100,34 86,28" fill="rgba(0,245,255,0.3)" stroke="#67E8F9" strokeWidth="1" />
                    <polygon points="114,18 100,24 100,34 114,28" fill="rgba(0,245,255,0.18)" stroke="#67E8F9" strokeWidth="1" />
                    <circle cx="128" cy="46" r="3" fill="#10B981" />
                    <circle cx="72" cy="46" r="3" fill="#38BDF8" />
                  </g>
                </svg>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <button type="button" onClick={() => onNavigate('character')} className="hover:text-cyan-300">
                    Persona
                  </button>
                  <span aria-hidden="true">·</span>
                  <button type="button" onClick={() => onNavigate('skills')} className="hover:text-cyan-300">
                    Skills
                  </button>
                  <span aria-hidden="true">·</span>
                  <button type="button" onClick={() => onNavigate('memory')} className="hover:text-cyan-300">
                    Memory
                  </button>
                </div>
              </div>

              {/* "What do you want to see?" Prompts */}
              <div className="flex flex-col justify-center sm:col-span-7">
                <h4 className="font-display text-sm font-semibold text-white">
                  What do you want to see?
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Trigger Urdu speech checks, bilingual skills, or deep reasoning.
                </p>
                <div className="mt-2.5 space-y-1.5">
                  {QUICK_VISUAL_PROMPTS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={isSending}
                      onClick={() => {
                        setRightTab('chat');
                        onSendMessage(item.text);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-[#0A1322] px-3 py-1.5 text-left text-xs text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-white disabled:opacity-50"
                    >
                      <span className="truncate">{item.label}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Live Skill Toggles inside the Neural Hub */}
          {centerTab === 'skills' && (
            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {skills.slice(0, 5).map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/90 bg-[#0A1322] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-white">{skill.display_name}</p>
                    <p className="truncate text-[11px] text-slate-400">{skill.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={skill.is_enabled}
                    aria-label={`Toggle ${skill.display_name}`}
                    onClick={() => void onToggleSkill(skill.id, !skill.is_enabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                      skill.is_enabled
                        ? 'border-cyan-400 bg-cyan-400/20'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                        skill.is_enabled
                          ? 'translate-x-4 bg-cyan-400'
                          : 'translate-x-1 bg-slate-500'
                      }`}
                    />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onNavigate('skills')}
                className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-cyan-400 hover:text-cyan-300"
              >
                <span>Open all {skills.length} skills &amp; custom builder</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Tab 3: Live Voice Speed & Volume Tuning */}
          {centerTab === 'voice' && (
            <div className="mt-3 flex flex-1 flex-col justify-between gap-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800/90 bg-[#0A1322] p-3">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="hub-voice-speed" className="font-medium text-slate-200">
                      Urdu Voice Speed
                    </label>
                    <span className="font-mono text-cyan-300 tabular-nums">
                      {config.voice_speed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    id="hub-voice-speed"
                    type="range"
                    min="0.75"
                    max="1.40"
                    step="0.05"
                    value={config.voice_speed}
                    onChange={(e) => void onSaveConfig({ voice_speed: Number(e.target.value) })}
                    className="mt-2.5 w-full accent-cyan-400"
                  />
                </div>

                <div className="rounded-lg border border-slate-800/90 bg-[#0A1322] p-3">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="hub-voice-volume" className="font-medium text-slate-200">
                      Voice Volume
                    </label>
                    <span className="font-mono text-cyan-300 tabular-nums">
                      {Math.round(config.voice_volume * 100)}%
                    </span>
                  </div>
                  <input
                    id="hub-voice-volume"
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.05"
                    value={config.voice_volume}
                    onChange={(e) => void onSaveConfig({ voice_volume: Number(e.target.value) })}
                    className="mt-2.5 w-full accent-cyan-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>Active Voice: {config.tts_voice} · Pakistani Urdu Neural Engine</span>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="inline-flex items-center gap-1 font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
                >
                  <span>Full Voice Settings</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <DesktopBridgePanel />
      </section>

      {/* FAR RIGHT COLUMN: Segmented Chat | Notes | Reminders Panel */}
      <section
        aria-label="Assistant transcript and workspace"
        className="order-3 flex min-h-[440px] flex-col rounded-xl border border-cyan-500/20 bg-[#070E1A] lg:order-3 lg:min-h-0"
      >
        {/* Top Segmented Tabs + Thinking Switch */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 px-3.5 py-2.5">
          <div
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#050A14] p-0.5"
            role="tablist"
            aria-label="Transcript workspace tabs"
          >
            {(
              [
                { id: 'chat', label: 'Chat' },
                { id: 'notes', label: `Notes (${notes.length})` },
                { id: 'reminders', label: `Reminders (${reminders.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={rightTab === tab.id}
                onClick={() => setRightTab(tab.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  rightTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleForceThinking}
            aria-pressed={forceThinking}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              forceThinking
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                : 'border-slate-800 bg-[#0B1424] text-slate-300 hover:border-slate-700 hover:text-white'
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            <span>{forceThinking ? 'High Thinking' : 'Auto Think'}</span>
          </button>
        </div>

        {(errorBanner || warningBanner) && (
          <div className="border-b border-slate-800/80 px-3.5 py-2 text-xs">
            {errorBanner && (
              <div
                role="alert"
                className="flex items-start justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200"
              >
                <span>{errorBanner}</span>
                <button
                  type="button"
                  onClick={onDismissError}
                  className="font-medium text-rose-300 hover:text-white whitespace-nowrap shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
            {warningBanner && !errorBanner && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
                {warningBanner}
              </div>
            )}
          </div>
        )}

        {/* TAB: LIVE CHAT */}
        {rightTab === 'chat' && (
          <>
            <div
              ref={chatListRef}
              className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5"
              data-testid="chat-messages-list"
            >
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const timeLabel = formatMessageTime(msg.timestamp);
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? 'border border-cyan-400/35 bg-cyan-500/10 text-slate-100'
                          : 'border border-slate-800 bg-[#0C1628] text-slate-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap" dir="auto">
                        {msg.content}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-500 tabular-nums">
                      <span>{isUser ? 'You' : config.assistant_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{timeLabel}</span>
                      {msg.emotion && !isUser && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{msg.emotion}</span>
                        </>
                      )}
                      {msg.skillExecuted && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-400">Skill: {msg.skillExecuted}</span>
                        </>
                      )}
                      {msg.thinkingUsed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-sky-400">High Thinking</span>
                        </>
                      )}
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => onReplayMessage(msg)}
                          aria-label={`Read aloud response from ${timeLabel}`}
                          className="ml-1 inline-flex items-center text-slate-400 transition-colors hover:text-cyan-300"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex flex-col items-start">
                  <div className="rounded-xl border border-slate-800 bg-[#0C1628] px-3.5 py-2.5 text-sm text-slate-400">
                    {forceThinking
                      ? `${config.assistant_name} is reasoning deeply...`
                      : `${config.assistant_name} is thinking...`}
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-slate-800/80 bg-[#050A14] p-3"
            >
              <div className="flex items-center gap-2">
                <label htmlFor="nova-chat-input" className="sr-only">
                  Message {config.assistant_name}
                </label>
                <input
                  ref={inputRef}
                  id="nova-chat-input"
                  type="text"
                  dir="auto"
                  value={inputValue}
                  onChange={(e) => onInputChange(e.target.value)}
                  placeholder={`Type to ${config.assistant_name} (اردو / Roman Urdu / EN)...`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#0B1424] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onToggleListening}
                  aria-label={avatarState === 'listening' ? 'Stop microphone' : 'Use microphone'}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors shrink-0 ${
                    avatarState === 'listening'
                      ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                      : 'border-slate-800 bg-[#0B1424] text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <Mic className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  disabled={isSending || !inputValue.trim()}
                  aria-label="Send message"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-400 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </>
        )}

        {/* TAB: QUICK NOTES */}
        {rightTab === 'notes' && (
          <div className="flex flex-1 flex-col justify-between p-3.5 min-h-0">
            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  No notes yet. Add a quick note below.
                </p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-slate-800 bg-[#0C1628] p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {note.title || 'Quick Note'}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{note.content}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete note "${note.title || note.content}"`}
                      onClick={() => void onDeleteNote(note.id)}
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleQuickNoteSubmit}
              className="mt-3 flex items-center gap-2 border-t border-slate-800/80 pt-3"
            >
              <label htmlFor="quick-note-input" className="sr-only">
                Quick note content
              </label>
              <input
                id="quick-note-input"
                type="text"
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder="Save a quick note..."
                className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#0B1424] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!quickNoteText.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-cyan-400 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB: QUICK REMINDERS */}
        {rightTab === 'reminders' && (
          <div className="flex flex-1 flex-col justify-between p-3.5 min-h-0">
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {reminders.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  No reminders scheduled. Add one below.
                </p>
              ) : (
                reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0C1628] px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => void onToggleReminder(rem.id, !rem.is_done)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      {rem.is_done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`truncate text-xs ${
                            rem.is_done ? 'text-slate-500 line-through' : 'text-slate-100'
                          }`}
                        >
                          {rem.title}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{rem.remind_at}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete reminder "${rem.title}"`}
                      onClick={() => void onDeleteReminder(rem.id)}
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleQuickRemSubmit}
              className="mt-3 flex items-center gap-1.5 border-t border-slate-800/80 pt-3"
            >
              <label htmlFor="quick-rem-input" className="sr-only">
                Reminder title
              </label>
              <input
                id="quick-rem-input"
                type="text"
                value={quickRemText}
                onChange={(e) => setQuickRemText(e.target.value)}
                placeholder="Reminder..."
                className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#0B1424] px-2.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
              <label htmlFor="quick-rem-time" className="sr-only">
                Reminder time
              </label>
              <input
                id="quick-rem-time"
                type="text"
                value={quickRemTime}
                onChange={(e) => setQuickRemTime(e.target.value)}
                className="w-20 rounded-lg border border-slate-800 bg-[#0B1424] px-2 py-2 text-xs text-slate-200 focus:border-cyan-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!quickRemText.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-cyan-400 px-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

function formatMessageTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'Now';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
