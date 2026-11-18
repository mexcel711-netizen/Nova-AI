export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type FacialEmotion = 'calm' | 'happy' | 'sad' | 'surprised' | 'excited' | 'empathetic' | 'thoughtful' | 'confident' | 'angry' | 'curious';

export type SidebarPage =
  | 'home'
  | 'memory'
  | 'skills'
  | 'character'
  | 'recent'
  | 'settings';

export type LanguageCode = 'bilingual' | 'en' | 'ur';

export type ResponseStyle = 'friendly_professional' | 'concise_technical' | 'warm_urdu_companion';

export type AiProviderPreference = 'auto' | 'google-ai-studio' | 'cloudflare';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  spokenText?: string;
  emotion?: FacialEmotion;
  language: 'en' | 'ur';
  timestamp: string;
  modelUsed?: string;
  providerUsed?: string;
  thinkingUsed?: boolean;
  skillExecuted?: string;
}

export interface MemoryRecord {
  id: number;
  category: 'preference' | 'fact' | 'reminder' | 'note';
  key: string | null;
  value: string;
  source: 'user_stated' | 'ai_inferred' | 'manual';
  confidence: number;
  created_at: string;
  updated_at: string;
}

export type SkillActionType = 'launch' | 'url' | 'system' | 'ai' | 'note' | 'reminder' | 'calc';

export interface SkillConfig {
  id: number;
  skill_name: string;
  display_name: string;
  description: string;
  trigger_phrases: string[];
  action_type: SkillActionType;
  action_value: string;
  is_enabled: boolean;
  is_custom: boolean;
  created_at: string;
}

export interface ReminderRecord {
  id: number;
  title: string;
  remind_at: string;
  is_done: boolean;
  created_at: string;
}

export interface NoteRecord {
  id: number;
  title: string | null;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
  preview: string;
  primary_language: 'en' | 'ur';
}

export interface AppConfig {
  assistant_name: string;
  personality: ResponseStyle;
  custom_prompt: string;
  language: LanguageCode;
  response_tone: 'casual' | 'formal';
  tts_voice: string;
  voice_speed: number;
  voice_volume: number;
  stt_model: 'base' | 'small' | 'medium';
  wake_word: string;
  wake_word_enabled: boolean;
  auto_speak: boolean;
  deep_thinking_mode: 'auto' | 'always' | 'manual';
  default_model: 'gemini-4-hydrogen' | 'gemini-4-carbon';
  ai_provider: AiProviderPreference;
}

export interface SkillExecutionResult {
  matched: boolean;
  skillName?: string;
  actionType?: SkillActionType;
  responseText?: string;
  language?: 'en' | 'ur';
  emotion?: FacialEmotion;
  sideEffect?: {
    type: 'open_url' | 'create_note' | 'create_reminder' | 'system_action' | 'none';
    url?: string;
    noteTitle?: string;
    noteContent?: string;
    reminderTitle?: string;
    reminderAt?: string;
    systemCommand?: string;
  };
}

export interface ChatApiResponse {
  reply: string;
  spokenText?: string;
  emotion: FacialEmotion;
  language: 'en' | 'ur';
  modelUsed: string;
  providerUsed: string;
  thinkingUsed: boolean;
  skillExecuted?: string;
  sideEffect?: SkillExecutionResult['sideEffect'];
  extractedMemories?: Array<{ category: MemoryRecord['category']; key: string; value: string }>;
  warning?: string;
}

export interface ProviderStatus {
  activeProvider: 'cloudflare-binding' | 'cloudflare-rest' | 'google-ai-studio' | 'unconfigured';
  googleAiConfigured: boolean;
  cloudflareConfigured: boolean;
  cloudflareBindingActive: boolean;
}
