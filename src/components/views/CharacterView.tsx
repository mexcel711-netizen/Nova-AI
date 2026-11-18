import { useState } from 'react';
import { Check } from 'lucide-react';
import type { AppConfig, LanguageCode, ResponseStyle } from '../../types/nova';

interface CharacterViewProps {
  config: AppConfig;
  onSaveConfig: (partial: Partial<AppConfig>) => Promise<void>;
}

const PERSONALITY_PRESETS: Array<{
  id: ResponseStyle;
  label: string;
  desc: string;
  prompt: string;
}> = [
  {
    id: 'friendly_professional',
    label: 'Friendly & Professional',
    desc: 'Balanced, calm, warm executive companion.',
    prompt:
      'You are NOVA, a calm, intelligent bilingual personal assistant fluent in English, Urdu, and Roman Urdu. Be concise, practical, and warm.',
  },
  {
    id: 'concise_technical',
    label: 'Concise & Technical',
    desc: 'Direct, structured engineering and architecture answers.',
    prompt:
      'You are NOVA, a crisp, engineering-focused technical partner. Deliver direct solutions, clean steps, and accurate Urdu/English terminology.',
  },
  {
    id: 'warm_urdu_companion',
    label: 'Warm Urdu Companion',
    desc: 'Conversational Roman Urdu hospitality for everyday tasks.',
    prompt:
      'You are NOVA, a warm, polite household and daily-life assistant who speaks naturally in Roman Urdu and English.',
  },
];

export function CharacterView({ config, onSaveConfig }: CharacterViewProps) {
  const [assistantName, setAssistantName] = useState(config.assistant_name);
  const [personality, setPersonality] = useState<ResponseStyle>(config.personality);
  const [language, setLanguage] = useState<LanguageCode>(config.language);
  const [responseTone, setResponseTone] = useState<'casual' | 'formal'>(config.response_tone);
  const [customPrompt, setCustomPrompt] = useState(config.custom_prompt);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectPreset = (preset: (typeof PERSONALITY_PRESETS)[number]) => {
    setPersonality(preset.id);
    setCustomPrompt(preset.prompt);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistantName.trim()) {
      setErrorMsg('Assistant name cannot be empty.');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onSaveConfig({
        assistant_name: assistantName.trim(),
        personality,
        language,
        response_tone: responseTone,
        custom_prompt: customPrompt.trim(),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const previewGreeting =
    language === 'en'
      ? `Hello! I am ${assistantName.trim() || 'NOVA'}, ready to help with your work today.`
      : responseTone === 'formal'
        ? `Assalamualaikum! Mein ${assistantName.trim() || 'NOVA'} hun, aapki khidmat ke liye hazir hun.`
        : `Assalamualaikum! Mein ${assistantName.trim() || 'NOVA'} hun, bataiye aaj kya madad karun?`;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col overflow-y-auto px-6 py-6">
      <div className="border-b border-slate-800/80 pb-5">
        <h1 className="font-display text-2xl font-semibold text-white">Character &amp; Persona</h1>
        <p className="mt-1 text-sm text-slate-400">
          Customize your assistant&apos;s identity, bilingual behavior, and system prompt.
        </p>
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="char-name-input"
              className="block text-xs font-medium text-slate-300"
            >
              Assistant Name
            </label>
            <input
              id="char-name-input"
              type="text"
              value={assistantName}
              onChange={(e) => setAssistantName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#0D1117] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="char-language-select"
              className="block text-xs font-medium text-slate-300"
            >
              Language Preference
            </label>
            <select
              id="char-language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#0D1117] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
            >
              <option value="bilingual">Bilingual (Urdu + English)</option>
              <option value="ur">Urdu / Roman Urdu Primary</option>
              <option value="en">English Primary</option>
            </select>
          </div>
        </div>

        {/* Personality Presets */}
        <div>
          <span className="block text-xs font-medium text-slate-300">Personality Preset</span>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            {PERSONALITY_PRESETS.map((preset) => {
              const active = personality === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-white'
                      : 'border-slate-800 bg-[#0D1117] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-semibold">{preset.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{preset.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Response Tone */}
        <div>
          <span className="block text-xs font-medium text-slate-300">Response Style</span>
          <div className="mt-2 inline-flex rounded-lg border border-slate-800 bg-[#0D1117] p-1">
            {(['casual', 'formal'] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => setResponseTone(tone)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
                  responseTone === tone
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <label
            htmlFor="char-system-prompt"
            className="block text-xs font-medium text-slate-300"
          >
            System Prompt
          </label>
          <textarea
            id="char-system-prompt"
            rows={4}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-[#0D1117] p-3.5 text-sm leading-relaxed text-slate-100 focus:border-cyan-500/60 focus:outline-none"
          />
        </div>

        {/* Live Persona Preview */}
        <div className="rounded-xl border border-slate-800 bg-[#0D1117] p-4">
          <p className="text-xs font-medium text-slate-400">Live Greeting Preview</p>
          <p className="mt-1.5 text-sm text-cyan-200">{previewGreeting}</p>
        </div>

        {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}

        <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-5">
          {savedNotice && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
              <Check className="h-4 w-4" />
              Character saved
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Character'}
          </button>
        </div>
      </form>
    </div>
  );
}
