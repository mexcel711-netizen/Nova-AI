import { useEffect, useRef, useState } from 'react';
import {
  Brain,
  Mic,
  MicOff,
  Radio,
  Send,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AppConfig,
  AvatarState,
  ChatMessage,
  FacialEmotion,
  ProviderStatus,
} from '../../types/nova';
import { HolographicAvatar } from '../HolographicAvatar';

interface HomeViewProps {
  config: AppConfig;
  providerStatus: ProviderStatus;
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
}

const QUICK_PROMPTS = [
  { label: 'Test Urdu Voice (وقت اور سلام)', text: 'وقت کیا ہے؟' },
  { label: 'Chrome kholo', text: 'Chrome kholo' },
  { label: 'Create a quick note', text: 'create note: Prepare NOVA bilingual demo checklist' },
  {
    label: 'Deep Thinking architecture check',
    text: 'Design a resilient event-driven architecture for an offline-first voice assistant and explain trade-offs step by step.',
  },
];

const EMOTION_OPTIONS: Array<{ id: FacialEmotion; label: string }> = [
  { id: 'calm', label: 'Calm' },
  { id: 'happy', label: 'Happy' },
  { id: 'sad', label: 'Sad' },
  { id: 'surprised', label: 'Surprised' },
];

export function HomeView({
  config,
  providerStatus,
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
}: HomeViewProps) {
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [speechLang, setSpeechLang] = useState<'en-US' | 'ur-PK'>('ur-PK');

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;
    onSendMessage();
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:overflow-hidden lg:grid-cols-12">
      {/* Center Holographic Stage */}
      <section
        aria-label="Assistant voice stage"
        className="flex flex-col items-center justify-between border-b border-slate-800/80 bg-[#0A0A0F] px-6 py-6 lg:col-span-7 lg:border-b-0 lg:border-r"
      >
        <div className="flex w-full max-w-xl flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>{providerLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {config.language === 'bilingual'
                ? 'Urdu + English'
                : config.language === 'ur'
                  ? 'Urdu'
                  : 'English'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Speed {config.voice_speed.toFixed(2)}x</span>
          </div>
          <button
            type="button"
            onClick={() => setSpeechLang((prev) => (prev === 'en-US' ? 'ur-PK' : 'en-US'))}
            className="rounded-md border border-slate-800 bg-[#0D1117] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white whitespace-nowrap shrink-0"
          >
            Mic Lang: {speechLang === 'ur-PK' ? 'Urdu (PK)' : 'English'}
          </button>
        </div>

        <div className="my-auto flex flex-col items-center py-2 text-center">
          <HolographicAvatar
            state={avatarState}
            emotion={avatarEmotion}
            assistantName={config.assistant_name}
            micLevel={micLevel}
            lipOpenness={lipOpenness}
            lipWidth={lipWidth}
          />

          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">
            {config.assistant_name}
          </h2>
          <p className="mt-1 text-sm text-slate-400" data-testid="avatar-status-text">
            {stateDescription}
          </p>

          {/* Facial Expression Controls */}
          <div
            className="mt-3 flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0D1117] p-1"
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
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Primary Voice & Control Bar */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onToggleListening}
              aria-label={avatarState === 'listening' ? 'Stop listening' : 'Start listening'}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                avatarState === 'listening'
                  ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                  : 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
              }`}
            >
              {avatarState === 'listening' ? (
                <>
                  <MicOff className="h-4 w-4" />
                  <span>Stop Listening</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  <span>Speak</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleWakeWord}
              aria-pressed={wakeWordActive}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                wakeWordActive
                  ? 'border-cyan-500/40 bg-[#0D1117] text-cyan-300'
                  : 'border-slate-800 bg-[#0D1117] text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <Radio className="h-4 w-4" />
              <span>{wakeWordActive ? 'Wake Word On' : 'Wake Word Off'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleAutoSpeak}
              aria-pressed={autoSpeak}
              aria-label={autoSpeak ? 'Mute voice replies' : 'Enable voice replies'}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0D1117] px-3.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white whitespace-nowrap shrink-0"
            >
              {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span>{autoSpeak ? 'Auto Voice On' : 'Muted'}</span>
            </button>

            <button
              type="button"
              onClick={onTerminate}
              aria-label="Terminate active speech or processing"
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20 hover:text-rose-200 whitespace-nowrap shrink-0"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Terminate</span>
            </button>
          </div>
        </div>

        {/* Quick Command Prompts */}
        <div className="w-full max-w-xl border-t border-slate-800/80 pt-3.5">
          <p className="mb-2 text-xs font-medium text-slate-400">Quick commands</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={isSending}
                onClick={() => onSendMessage(item.text)}
                className="truncate rounded-lg border border-slate-800/90 bg-[#0D1117] px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Right Chat Transcript Panel */}
      <section
        aria-label="Conversation transcript"
        className="flex min-h-0 flex-col bg-[#0D1117] lg:col-span-5"
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-white">Conversation</h3>
            <p className="text-xs text-slate-400 tabular-nums">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'} · Shortcut Ctrl+Space
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleForceThinking}
            aria-pressed={forceThinking}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              forceThinking
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700 hover:text-white'
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            <span>{forceThinking ? 'High Thinking On' : 'Auto Thinking'}</span>
          </button>
        </div>

        {(errorBanner || warningBanner) && (
          <div className="border-b border-slate-800/80 px-5 py-2.5 text-xs">
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

        {/* Messages Feed */}
        <div
          className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
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
                  className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'border border-cyan-500/30 bg-cyan-500/10 text-slate-100'
                      : 'border border-slate-800 bg-[#111827] text-slate-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap" dir="auto">
                    {msg.content}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-2 px-1 text-[11px] text-slate-500 tabular-nums">
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
              <div className="rounded-xl border border-slate-800 bg-[#111827] px-4 py-3 text-sm text-slate-400">
                {forceThinking
                  ? `${config.assistant_name} is reasoning deeply...`
                  : `${config.assistant_name} is thinking...`}
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-800/80 bg-[#0A0A0F]/60 p-4"
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
              placeholder={`Ask ${config.assistant_name} in اردو, Roman Urdu, or English...`}
              className="flex-1 rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={onToggleListening}
              aria-label={avatarState === 'listening' ? 'Stop microphone' : 'Use microphone'}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors shrink-0 ${
                avatarState === 'listening'
                  ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                  : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={isSending || !inputValue.trim()}
              aria-label="Send message"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-cyan-400 px-4 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Send className="h-4 w-4" />
              <span>Send</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function formatMessageTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'Now';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
