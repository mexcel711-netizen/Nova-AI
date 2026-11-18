import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AppConfig,
  ChatMessage,
  FacialEmotion,
  MemoryRecord,
  NoteRecord,
  ReminderRecord,
  SessionSummary,
  SkillActionType,
  SkillConfig,
} from '../src/types/nova';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'nova.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    emotion TEXT DEFAULT 'calm',
    model_used TEXT,
    provider_used TEXT,
    thinking_used INTEGER DEFAULT 0,
    skill_executed TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    key TEXT,
    value TEXT NOT NULL,
    source TEXT DEFAULT 'user_stated',
    confidence REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);

  CREATE TABLE IF NOT EXISTS skills_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger_phrases TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_value TEXT,
    is_enabled INTEGER DEFAULT 1,
    is_custom INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    is_done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations for existing databases
for (const alterSql of [
  "ALTER TABLE conversations ADD COLUMN emotion TEXT DEFAULT 'calm'",
  'ALTER TABLE conversations ADD COLUMN provider_used TEXT',
]) {
  try {
    db.exec(alterSql);
  } catch {
    // column already exists
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  assistant_name: 'NOVA',
  personality: 'friendly_professional',
  custom_prompt:
    'You are NOVA, a poised, warm Pakistani female AI assistant fluent in Urdu, Roman Urdu, and English. Be expressive, natural, helpful, and concise.',
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

function seedDefaults() {
  const upsertCfg = db.prepare(`
    INSERT INTO app_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
    upsertCfg.run(k, String(v));
  }

  const skillCount = (db.prepare('SELECT COUNT(*) as c FROM skills_config').get() as { c: number }).c;
  if (skillCount === 0) {
    const insertSkill = db.prepare(`
      INSERT INTO skills_config (
        skill_name, display_name, description, trigger_phrases, action_type, action_value, is_enabled, is_custom
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0)
    `);
    const builtIns: Array<[string, string, string, string[], SkillActionType, string]> = [
      [
        'app_launcher',
        'App & Web Launcher',
        'Opens apps and websites via English or Urdu commands ("open youtube", "Chrome kholo").',
        ['open', 'launch', 'start', 'kholo', 'chalu karo'],
        'launch',
        'browser_launcher',
      ],
      [
        'web_search',
        'Web Search',
        'Launches instant web searches ("search quantum computing", "weather search karo").',
        ['search', 'google', 'look up', 'dhundo'],
        'url',
        'https://www.google.com/search?q=',
      ],
      [
        'notes_manager',
        'Quick Notes',
        'Captures persistent notes directly into your memory vault ("note: ...", "note likho: ...").',
        ['create note', 'take note', 'note:', 'note likho'],
        'note',
        'notes_table',
      ],
      [
        'reminders_manager',
        'Smart Reminders',
        'Schedules voice or text reminders ("remind me to call Ali at 6pm", "yaad dilao ...").',
        ['remind me', 'yaad dilao', 'reminder lagao'],
        'reminder',
        'reminders_table',
      ],
      [
        'calculator',
        'Precision Calculator',
        'Evaluates math expressions locally without network latency ("calculate 245 * 18").',
        ['calculate', 'compute', 'hisaab', 'kitna hota hai'],
        'calc',
        'math_eval',
      ],
      [
        'time_date',
        'Clock & Calendar',
        'Reports current local time and date in Urdu or English ("what time is it", "waqt kya hai").',
        ['what time', 'current time', 'waqt', 'tareekh'],
        'system',
        'clock',
      ],
      [
        'system_control',
        'Audio & Display Control',
        'Controls assistant audio levels, muting, and focus state ("mute", "volume up", "awaaz band").',
        ['volume up', 'volume down', 'mute', 'unmute', 'awaaz'],
        'system',
        'audio_control',
      ],
      [
        'document_drafter',
        'Bilingual Document & Email Drafter',
        'Uses Deep Thinking mode to draft formal Urdu or English emails, summaries, and briefs.',
        ['draft email', 'write document', 'email likho'],
        'ai',
        'gemini-4-carbon',
      ],
    ];
    for (const s of builtIns) {
      insertSkill.run(s[0], s[1], s[2], JSON.stringify(s[3]), s[4], s[5]);
    }
  }

  const memCount = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
  if (memCount === 0) {
    const insertMem = db.prepare(`
      INSERT INTO memories (category, key, value, source, confidence) VALUES (?, ?, ?, ?, ?)
    `);
    insertMem.run('preference', 'language_mode', 'Prefers bilingual English and Pakistani Urdu responses', 'user_stated', 0.96);
    insertMem.run('fact', 'workspace_role', 'Building NOVA AI personal voice & task workstation', 'ai_inferred', 0.9);
  }

  const noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number }).c;
  if (noteCount === 0) {
    db.prepare(`INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)`).run(
      'NOVA Quick Commands',
      'Try saying or typing: "Chrome kholo", "create note: Review Q4 specs", "remind me to call team at 4pm", or toggle Deep Thinking for complex analysis.',
      JSON.stringify(['guide', 'bilingual'])
    );
  }

  const remCount = (db.prepare('SELECT COUNT(*) as c FROM reminders').get() as { c: number }).c;
  if (remCount === 0) {
    db.prepare(`INSERT INTO reminders (title, remind_at, is_done) VALUES (?, ?, 0)`).run(
      'Review daily voice notes & priorities',
      '06:00 PM'
    );
  }

  const convCount = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number }).c;
  if (convCount === 0) {
    const sampleSession = 'session-onboarding-01';
    const insertConv = db.prepare(`
      INSERT INTO conversations (session_id, role, content, language, emotion, model_used, provider_used, thinking_used, skill_executed, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertConv.run(
      sampleSession,
      'user',
      'Assalamualaikum Nova, aaj ka schedule aur quick note check karo.',
      'ur',
      'calm',
      null,
      null,
      0,
      null,
      new Date(Date.now() - 3600 * 1000).toISOString()
    );
    insertConv.run(
      sampleSession,
      'assistant',
      'وعلیکم السلام! آپ کا ریمائنڈر شام 6 بجے کے لیے سیٹ ہے، اور آپ کا کوئیک نوٹ میموری والٹ میں محفوظ ہے۔',
      'ur',
      'happy',
      'gemini-4-hydrogen',
      'google-ai-studio',
      0,
      null,
      new Date(Date.now() - 3590 * 1000).toISOString()
    );
  }
}

seedDefaults();

export function getConfig(): AppConfig {
  const rows = db.prepare('SELECT key, value FROM app_config').all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const parsedSpeed = Number(map.get('voice_speed'));
  const parsedVolume = Number(map.get('voice_volume'));

  return {
    assistant_name: map.get('assistant_name') || DEFAULT_CONFIG.assistant_name,
    personality: (map.get('personality') as AppConfig['personality']) || DEFAULT_CONFIG.personality,
    custom_prompt: map.get('custom_prompt') ?? DEFAULT_CONFIG.custom_prompt,
    language: (map.get('language') as AppConfig['language']) || DEFAULT_CONFIG.language,
    response_tone: (map.get('response_tone') as AppConfig['response_tone']) || DEFAULT_CONFIG.response_tone,
    tts_voice: map.get('tts_voice') || DEFAULT_CONFIG.tts_voice,
    voice_speed: Number.isFinite(parsedSpeed) && parsedSpeed >= 0.5 && parsedSpeed <= 1.75 ? parsedSpeed : DEFAULT_CONFIG.voice_speed,
    voice_volume: Number.isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1.5 ? parsedVolume : DEFAULT_CONFIG.voice_volume,
    stt_model: (map.get('stt_model') as AppConfig['stt_model']) || DEFAULT_CONFIG.stt_model,
    wake_word: map.get('wake_word') || DEFAULT_CONFIG.wake_word,
    wake_word_enabled: map.get('wake_word_enabled') === 'true',
    auto_speak: map.get('auto_speak') !== 'false',
    deep_thinking_mode:
      (map.get('deep_thinking_mode') as AppConfig['deep_thinking_mode']) ||
      DEFAULT_CONFIG.deep_thinking_mode,
    default_model:
      (map.get('default_model') as AppConfig['default_model']) || DEFAULT_CONFIG.default_model,
    ai_provider:
      (map.get('ai_provider') as AppConfig['ai_provider']) || DEFAULT_CONFIG.ai_provider,
  };
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) {
      stmt.run(k, String(v));
    }
  }
  return getConfig();
}

export function getSkills(): SkillConfig[] {
  const rows = db
    .prepare('SELECT * FROM skills_config ORDER BY is_custom DESC, id ASC')
    .all() as Array<{
    id: number;
    skill_name: string;
    display_name: string;
    description: string;
    trigger_phrases: string;
    action_type: SkillActionType;
    action_value: string;
    is_enabled: number;
    is_custom: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    ...r,
    trigger_phrases: safeParseArray(r.trigger_phrases),
    is_enabled: r.is_enabled === 1,
    is_custom: r.is_custom === 1,
  }));
}

export function createSkill(input: {
  display_name: string;
  description: string;
  trigger_phrases: string[];
  action_type: SkillActionType;
  action_value: string;
}): SkillConfig {
  const slug =
    input.display_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || `custom_${Date.now()}`;
  const uniqueName = `${slug}_${Date.now().toString().slice(-4)}`;
  const res = db
    .prepare(
      `INSERT INTO skills_config (skill_name, display_name, description, trigger_phrases, action_type, action_value, is_enabled, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)`
    )
    .run(
      uniqueName,
      input.display_name.trim(),
      input.description.trim() || 'Custom user automation skill',
      JSON.stringify(input.trigger_phrases),
      input.action_type,
      input.action_value.trim()
    );
  const created = db
    .prepare('SELECT * FROM skills_config WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return {
    id: Number(created.id),
    skill_name: String(created.skill_name),
    display_name: String(created.display_name),
    description: String(created.description),
    trigger_phrases: safeParseArray(String(created.trigger_phrases)),
    action_type: created.action_type as SkillActionType,
    action_value: String(created.action_value ?? ''),
    is_enabled: Number(created.is_enabled) === 1,
    is_custom: Number(created.is_custom) === 1,
    created_at: String(created.created_at),
  };
}

export function toggleSkill(id: number, is_enabled: boolean): void {
  db.prepare('UPDATE skills_config SET is_enabled = ? WHERE id = ?').run(is_enabled ? 1 : 0, id);
}

export function deleteSkill(id: number): void {
  db.prepare('DELETE FROM skills_config WHERE id = ? AND is_custom = 1').run(id);
}

export function getMemories(): MemoryRecord[] {
  return db
    .prepare('SELECT id, category, key, value, source, confidence, created_at, updated_at FROM memories WHERE is_deleted = 0 ORDER BY id DESC')
    .all() as unknown as MemoryRecord[];
}

export function addMemory(input: {
  category: MemoryRecord['category'];
  key?: string | null;
  value: string;
  source?: MemoryRecord['source'];
  confidence?: number;
}): MemoryRecord {
  const existing = db
    .prepare('SELECT id FROM memories WHERE is_deleted = 0 AND LOWER(value) = LOWER(?)')
    .get(input.value.trim()) as { id: number } | undefined;
  if (existing) {
    return db
      .prepare('SELECT id, category, key, value, source, confidence, created_at, updated_at FROM memories WHERE id = ?')
      .get(existing.id) as unknown as MemoryRecord;
  }
  const res = db
    .prepare(
      `INSERT INTO memories (category, key, value, source, confidence) VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.category,
      input.key ?? null,
      input.value.trim(),
      input.source ?? 'user_stated',
      input.confidence ?? 1.0
    );
  return db
    .prepare('SELECT id, category, key, value, source, confidence, created_at, updated_at FROM memories WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as unknown as MemoryRecord;
}

export function deleteMemory(id: number): void {
  db.prepare('UPDATE memories SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function clearAllMemories(): void {
  db.prepare('UPDATE memories SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP').run();
}

export function getNotes(): NoteRecord[] {
  const rows = db.prepare('SELECT * FROM notes ORDER BY id DESC').all() as Array<{
    id: number;
    title: string | null;
    content: string;
    tags: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({ ...r, tags: safeParseArray(r.tags) }));
}

export function addNote(title: string | null, content: string, tags: string[] = []): NoteRecord {
  const res = db
    .prepare('INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)')
    .run(title?.trim() || 'Quick Note', content.trim(), JSON.stringify(tags));
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(res.lastInsertRowid)) as {
    id: number;
    title: string | null;
    content: string;
    tags: string;
    created_at: string;
    updated_at: string;
  };
  return { ...row, tags: safeParseArray(row.tags) };
}

export function deleteNote(id: number): void {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}

export function getReminders(): ReminderRecord[] {
  const rows = db.prepare('SELECT * FROM reminders ORDER BY is_done ASC, id DESC').all() as Array<{
    id: number;
    title: string;
    remind_at: string;
    is_done: number;
    created_at: string;
  }>;
  return rows.map((r) => ({ ...r, is_done: r.is_done === 1 }));
}

export function addReminder(title: string, remind_at: string): ReminderRecord {
  const res = db
    .prepare('INSERT INTO reminders (title, remind_at, is_done) VALUES (?, ?, 0)')
    .run(title.trim(), remind_at.trim());
  const row = db
    .prepare('SELECT * FROM reminders WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as {
    id: number;
    title: string;
    remind_at: string;
    is_done: number;
    created_at: string;
  };
  return { ...row, is_done: row.is_done === 1 };
}

export function toggleReminder(id: number, is_done: boolean): void {
  db.prepare('UPDATE reminders SET is_done = ? WHERE id = ?').run(is_done ? 1 : 0, id);
}

export function deleteReminder(id: number): void {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

export function saveConversationTurn(turn: {
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  language: 'en' | 'ur';
  emotion?: FacialEmotion;
  modelUsed?: string;
  providerUsed?: string;
  thinkingUsed?: boolean;
  skillExecuted?: string;
}): ChatMessage {
  const res = db
    .prepare(
      `INSERT INTO conversations (session_id, role, content, language, emotion, model_used, provider_used, thinking_used, skill_executed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      turn.sessionId,
      turn.role,
      turn.content,
      turn.language,
      turn.emotion ?? 'calm',
      turn.modelUsed ?? null,
      turn.providerUsed ?? null,
      turn.thinkingUsed ? 1 : 0,
      turn.skillExecuted ?? null
    );
  const row = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return mapConversationRow(row);
}

export function getConversationMessages(sessionId: string): ChatMessage[] {
  const rows = db
    .prepare('SELECT * FROM conversations WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(mapConversationRow);
}

export function getSessionSummaries(): SessionSummary[] {
  const rows = db
    .prepare(
      `SELECT
        session_id,
        MIN(timestamp) as started_at,
        MAX(timestamp) as last_message_at,
        COUNT(*) as message_count,
        (SELECT content FROM conversations c2 WHERE c2.session_id = c1.session_id ORDER BY c2.id ASC LIMIT 1) as preview,
        (SELECT language FROM conversations c3 WHERE c3.session_id = c1.session_id ORDER BY c3.id DESC LIMIT 1) as primary_language
      FROM conversations c1
      GROUP BY session_id
      ORDER BY MAX(id) DESC`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    session_id: String(r.session_id),
    started_at: String(r.started_at),
    last_message_at: String(r.last_message_at),
    message_count: Number(r.message_count),
    preview: String(r.preview ?? ''),
    primary_language: r.primary_language === 'ur' ? 'ur' : 'en',
  }));
}

export function deleteSession(sessionId: string): void {
  db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
}

function mapConversationRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content),
    language: row.language === 'ur' ? 'ur' : 'en',
    emotion: (row.emotion as FacialEmotion) || 'calm',
    timestamp: String(row.timestamp),
    modelUsed: row.model_used ? String(row.model_used) : undefined,
    providerUsed: row.provider_used ? String(row.provider_used) : undefined,
    thinkingUsed: Number(row.thinking_used) === 1,
    skillExecuted: row.skill_executed ? String(row.skill_executed) : undefined,
  };
}

function safeParseArray(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
