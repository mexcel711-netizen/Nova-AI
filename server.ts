import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { generateCloudflareRestReply } from './server/cloudflare';
import {
  addMemory,
  addNote,
  addReminder,
  clearAllMemories,
  createSkill,
  deleteMemory,
  deleteNote,
  deleteReminder,
  deleteSession,
  deleteSkill,
  getConfig,
  getConversationMessages,
  getMemories,
  getNotes,
  getReminders,
  getSessionSummaries,
  getSkills,
  saveConversationTurn,
  toggleReminder,
  toggleSkill,
  updateConfig,
} from './server/db';
import {
  buildSystemInstruction,
  generateNovaReply,
  generateNovaSpeech,
  hasGoogleAiKey,
  transcribeNovaAudio,
} from './server/gemini';
import {
  detectEmotionFromText,
  extractEmotionAndCleanText,
  resolveActiveAiProvider,
} from './src/lib/emotionAndSpeech';
import { extractMemoriesFromUtterance } from './src/lib/memoryExtractor';
import { detectUrduIntent, isComplexThinkingQuery, matchSkillCommand } from './src/lib/skillMatcher';
import type { ChatApiResponse, FacialEmotion, ProviderStatus, SkillActionType } from './src/types/nova';

const PORT = 3000;

function getProviderStatus(): ProviderStatus {
  const config = getConfig();
  const hasCfRest = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim()
  );
  return resolveActiveAiProvider({
    preference: config.ai_provider,
    hasCloudflareBinding: false,
    hasCloudflareRest: hasCfRest,
    hasGoogleAiKey: hasGoogleAiKey(),
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      providerStatus: getProviderStatus(),
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      config: getConfig(),
      skills: getSkills(),
      memories: getMemories(),
      notes: getNotes(),
      reminders: getReminders(),
      sessions: getSessionSummaries(),
      providerStatus: getProviderStatus(),
    });
  });

  app.get('/api/conversations/:sessionId', (req, res) => {
    const messages = getConversationMessages(req.params.sessionId);
    res.json({ messages });
  });

  app.delete('/api/conversations/:sessionId', (req, res) => {
    deleteSession(req.params.sessionId);
    res.json({ ok: true, sessions: getSessionSummaries() });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, sessionId, forceThinking } = req.body as {
        message?: string;
        sessionId?: string;
        forceThinking?: boolean;
      };

      const cleanMessage = (message ?? '').trim();
      const activeSession = (sessionId ?? '').trim() || `session-${Date.now()}`;

      if (!cleanMessage) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const config = getConfig();
      const skills = getSkills();
      const userLang: 'en' | 'ur' = detectUrduIntent(cleanMessage) ? 'ur' : 'en';

      // Persist user message
      saveConversationTurn({
        sessionId: activeSession,
        role: 'user',
        content: cleanMessage,
        language: userLang,
        emotion: detectEmotionFromText(cleanMessage),
      });

      // Extract explicit long-term facts/preferences from user statement
      const extracted = extractMemoriesFromUtterance(cleanMessage);
      for (const item of extracted) {
        addMemory({
          category: item.category,
          key: item.key,
          value: item.value,
          source: item.source,
          confidence: item.confidence,
        });
      }

      // 1. Check direct skills first (instant execution)
      const skillMatch = matchSkillCommand(cleanMessage, skills);
      if (skillMatch.matched && skillMatch.responseText) {
        const sideEffect = skillMatch.sideEffect;
        if (sideEffect?.type === 'create_note' && sideEffect.noteContent) {
          addNote(sideEffect.noteTitle ?? 'Quick Note', sideEffect.noteContent, ['voice']);
        } else if (sideEffect?.type === 'create_reminder' && sideEffect.reminderTitle) {
          addReminder(sideEffect.reminderTitle, sideEffect.reminderAt ?? 'Today');
        }

        const replyLang = skillMatch.language ?? userLang;
        const skillEmotion: FacialEmotion =
          skillMatch.emotion || detectEmotionFromText(skillMatch.responseText);

        saveConversationTurn({
          sessionId: activeSession,
          role: 'assistant',
          content: skillMatch.responseText,
          language: replyLang,
          emotion: skillEmotion,
          modelUsed: 'skill-engine',
          providerUsed: 'local-skill',
          thinkingUsed: false,
          skillExecuted: skillMatch.skillName,
        });

        const payload: ChatApiResponse = {
          reply: skillMatch.responseText,
          emotion: skillEmotion,
          language: replyLang,
          modelUsed: 'skill-engine',
          providerUsed: 'local-skill',
          thinkingUsed: false,
          skillExecuted: skillMatch.skillName,
          sideEffect,
          extractedMemories: extracted.map((m) => ({
            category: m.category,
            key: m.key,
            value: m.value,
          })),
        };
        res.json(payload);
        return;
      }

      // 2. Route to active AI provider (Google AI Studio or Cloudflare Workers AI)
      const history = getConversationMessages(activeSession).slice(0, -1);
      const memories = getMemories();
      const notes = getNotes();
      const reminders = getReminders();
      const providerStatus = getProviderStatus();

      if (providerStatus.activeProvider === 'unconfigured') {
        res.status(503).json({
          error:
            'No AI provider key is configured yet. Add GEMINI_API_KEY in Settings > Secrets for Google AI Studio testing, or deploy to Cloudflare Workers for automatic AI binding.',
        });
        return;
      }

      const shouldThink =
        Boolean(forceThinking) ||
        config.deep_thinking_mode === 'always' ||
        (config.deep_thinking_mode === 'auto' && isComplexThinkingQuery(cleanMessage));

      let replyText = '';
      let replyEmotion: FacialEmotion = 'calm';
      let modelUsed = '';
      let thinkingUsed = false;
      let warning: string | undefined;

      if (providerStatus.activeProvider === 'cloudflare-rest') {
        const systemInstruction = buildSystemInstruction({
          config,
          memories,
          notes,
          reminders,
        });
        const cfResult = await generateCloudflareRestReply({
          userMessage: cleanMessage,
          history,
          config,
          memories,
          notes,
          reminders,
          systemInstruction,
        });
        const parsed = extractEmotionAndCleanText(cfResult.text);
        replyText = parsed.cleanText;
        replyEmotion = parsed.emotion;
        modelUsed = cfResult.modelUsed;
      } else {
        const aiResult = await generateNovaReply({
          userMessage: cleanMessage,
          history,
          config,
          memories,
          notes,
          reminders,
          useDeepThinking: shouldThink,
        });
        replyText = aiResult.text;
        replyEmotion = aiResult.emotion;
        modelUsed = aiResult.modelUsed;
        thinkingUsed = aiResult.thinkingUsed;
        warning = aiResult.warning;
      }

      const replyLang: 'en' | 'ur' = detectUrduIntent(replyText) ? 'ur' : userLang;

      saveConversationTurn({
        sessionId: activeSession,
        role: 'assistant',
        content: replyText,
        language: replyLang,
        emotion: replyEmotion,
        modelUsed,
        providerUsed: providerStatus.activeProvider,
        thinkingUsed,
      });

      const payload: ChatApiResponse = {
        reply: replyText,
        emotion: replyEmotion,
        language: replyLang,
        modelUsed,
        providerUsed: providerStatus.activeProvider,
        thinkingUsed,
        extractedMemories: extracted.map((m) => ({
          category: m.category,
          key: m.key,
          value: m.value,
        })),
        warning,
      };
      res.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process assistant turn.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voiceName, emotion, language } = req.body as {
        text?: string;
        voiceName?: string;
        emotion?: FacialEmotion;
        language?: 'en' | 'ur';
      };
      if (!text?.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const config = getConfig();
      const detectedLang: 'en' | 'ur' =
        language || (detectUrduIntent(text) ? 'ur' : 'en');
      const resolvedEmotion: FacialEmotion = emotion || detectEmotionFromText(text);

      const audio = await generateNovaSpeech({
        text: text.trim(),
        voiceName: voiceName || config.tts_voice,
        emotion: resolvedEmotion,
        language: detectedLang,
      });
      res.json(audio);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speech synthesis failed.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body as { audioBase64?: string; mimeType?: string };
      if (!audioBase64) {
        res.status(400).json({ error: 'Audio payload is required.' });
        return;
      }
      const text = await transcribeNovaAudio({
        audioBase64,
        mimeType: mimeType || 'audio/webm',
      });
      res.json({ text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Audio transcription failed.';
      res.status(500).json({ error: msg });
    }
  });

  // Memories CRUD
  app.post('/api/memories', (req, res) => {
    const { category, key, value } = req.body as {
      category?: 'preference' | 'fact' | 'reminder' | 'note';
      key?: string;
      value?: string;
    };
    if (!value?.trim()) {
      res.status(400).json({ error: 'Memory content is required.' });
      return;
    }
    const created = addMemory({
      category: category || 'fact',
      key: key?.trim() || 'manual_entry',
      value: value.trim(),
      source: 'manual',
      confidence: 1.0,
    });
    res.json({ memory: created, memories: getMemories() });
  });

  app.delete('/api/memories/:id', (req, res) => {
    deleteMemory(Number(req.params.id));
    res.json({ ok: true, memories: getMemories() });
  });

  app.delete('/api/memories', (_req, res) => {
    clearAllMemories();
    res.json({ ok: true, memories: getMemories() });
  });

  // Notes CRUD
  app.post('/api/notes', (req, res) => {
    const { title, content, tags } = req.body as {
      title?: string;
      content?: string;
      tags?: string[];
    };
    if (!content?.trim()) {
      res.status(400).json({ error: 'Note content is required.' });
      return;
    }
    const note = addNote(title?.trim() || null, content.trim(), Array.isArray(tags) ? tags : []);
    res.json({ note, notes: getNotes() });
  });

  app.delete('/api/notes/:id', (req, res) => {
    deleteNote(Number(req.params.id));
    res.json({ ok: true, notes: getNotes() });
  });

  // Reminders CRUD
  app.post('/api/reminders', (req, res) => {
    const { title, remind_at } = req.body as { title?: string; remind_at?: string };
    if (!title?.trim()) {
      res.status(400).json({ error: 'Reminder title is required.' });
      return;
    }
    const reminder = addReminder(title.trim(), remind_at?.trim() || 'Today');
    res.json({ reminder, reminders: getReminders() });
  });

  app.patch('/api/reminders/:id', (req, res) => {
    const { is_done } = req.body as { is_done?: boolean };
    toggleReminder(Number(req.params.id), Boolean(is_done));
    res.json({ ok: true, reminders: getReminders() });
  });

  app.delete('/api/reminders/:id', (req, res) => {
    deleteReminder(Number(req.params.id));
    res.json({ ok: true, reminders: getReminders() });
  });

  // Skills CRUD
  app.post('/api/skills', (req, res) => {
    const { display_name, description, trigger_phrases, action_type, action_value } = req.body as {
      display_name?: string;
      description?: string;
      trigger_phrases?: string[];
      action_type?: SkillActionType;
      action_value?: string;
    };
    if (!display_name?.trim() || !Array.isArray(trigger_phrases) || trigger_phrases.length === 0) {
      res.status(400).json({ error: 'Skill name and at least one trigger phrase are required.' });
      return;
    }
    const skill = createSkill({
      display_name: display_name.trim(),
      description: description?.trim() || 'Custom user automation skill',
      trigger_phrases: trigger_phrases.map((t) => t.trim()).filter(Boolean),
      action_type: action_type || 'url',
      action_value: action_value?.trim() || '',
    });
    res.json({ skill, skills: getSkills() });
  });

  app.patch('/api/skills/:id', (req, res) => {
    const { is_enabled } = req.body as { is_enabled?: boolean };
    toggleSkill(Number(req.params.id), Boolean(is_enabled));
    res.json({ ok: true, skills: getSkills() });
  });

  app.delete('/api/skills/:id', (req, res) => {
    deleteSkill(Number(req.params.id));
    res.json({ ok: true, skills: getSkills() });
  });

  // Config update
  app.put('/api/config', (req, res) => {
    const updated = updateConfig(req.body);
    res.json({ config: updated, providerStatus: getProviderStatus() });
  });

  // Vite / Static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NOVA AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NOVA AI server:', err);
  process.exit(1);
});
