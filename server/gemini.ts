import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  extractEmotionAndCleanText,
  formatExpressiveSpeechPrompt,
  splitSpeechChunks,
} from '../src/lib/emotionAndSpeech';
import type {
  AppConfig,
  CharacterProfile,
  ChatMessage,
  FacialEmotion,
  KnowledgeKind,
  KnowledgeSource,
  MemoryRecord,
  NoteRecord,
  ReminderRecord,
} from '../src/types/nova';

export function hasGoogleAiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'Google AI Studio API key is not configured. Add GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function buildSystemInstruction(params: {
  config: AppConfig;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  activeCharacter?: CharacterProfile;
  knowledge?: KnowledgeSource[];
}): string {
  const { config, memories, notes, reminders, activeCharacter, knowledge } = params;
  const personalityDesc =
    config.personality === 'concise_technical'
      ? 'Concise, analytical, engineering-focused, and direct.'
      : config.personality === 'warm_urdu_companion'
        ? 'Warm, hospitable Pakistani female companion naturally blending polite Urdu and English.'
        : 'Friendly, poised, articulate Pakistani female executive companion.';

  const languageRule =
    config.language === 'ur'
      ? 'Respond in fluent, natural Pakistani Urdu script (اردو) with clear everyday phrasing (and natural English technical words only where needed).'
      : config.language === 'en'
        ? 'Respond primarily in clear, natural English.'
        : 'Match the user language seamlessly: when the user writes in Urdu script or Roman Urdu, reply primarily in fluent Pakistani Urdu script (اردو) so voice pronunciation sounds authentically Pakistani (or Roman Urdu if explicitly requested); when addressed in English, reply in natural English.';

  const toneRule =
    config.response_tone === 'formal'
      ? 'Use respectful formal address (e.g. آپ / جناب in Urdu, polished phrasing in English).'
      : 'Use warm, natural conversational phrasing suitable for expressive female voice playback.';

  const moodGuidance =
    config.active_mood === 'love'
      ? 'ACTIVE MOOD LOCK: LOVE MODE (لو موڈ). Speak with deep warmth, affectionate care, tenderness, and poetic Pakistani warmth. Begin your reply with [emotion:love].'
      : config.active_mood === 'sad'
        ? 'ACTIVE MOOD LOCK: SAD MODE (سیڈ موڈ). Speak with gentle, unhurried, deeply empathetic vulnerability and comfort. Begin your reply with [emotion:sad].'
        : config.active_mood === 'happy'
          ? 'ACTIVE MOOD LOCK: HAPPY MODE (ہیپی موڈ). Speak with bright joy, enthusiasm, and uplifting optimism. Begin your reply with [emotion:happy].'
          : config.active_mood === 'surprised'
            ? 'ACTIVE MOOD LOCK: SURPRISED MODE. Speak with lively wonder and intrigue. Begin your reply with [emotion:surprised].'
            : config.active_mood === 'calm'
              ? 'ACTIVE MOOD LOCK: CALM MODE. Speak with serene, composed poise. Begin your reply with [emotion:calm].'
              : 'Mood Mode: Auto-adaptive.';

  const memLines =
    memories.length > 0
      ? memories
          .slice(0, 15)
          .map((m) => `- [${m.category}] ${m.value}`)
          .join('\n')
      : 'No saved long-term memories yet.';

  const pendingReminders = reminders.filter((r) => !r.is_done).slice(0, 6);
  const remLines =
    pendingReminders.length > 0
      ? pendingReminders.map((r) => `- ${r.title} (at ${r.remind_at})`).join('\n')
      : 'None';

  const recentNotes = notes.slice(0, 5);
  const noteLines =
    recentNotes.length > 0
      ? recentNotes.map((n) => `- ${n.title || 'Note'}: ${n.content}`).join('\n')
      : 'None';

  const knowledgeLines =
    knowledge && knowledge.length > 0
      ? knowledge
          .slice(0, 5)
          .map((k) => `- [${k.kind.toUpperCase()}] ${k.title}: ${k.detailed_summary.slice(0, 180)}`)
          .join('\n')
      : 'None';

  const charBlock = activeCharacter
    ? `Active Living Persona: ${activeCharacter.name} (${activeCharacter.role_title}) · Bond Level ${activeCharacter.bond_level}. Self-developed traits: ${activeCharacter.learned_traits.join(', ')}.`
    : '';

  return [
    `Your name is ${config.assistant_name}.`,
    config.custom_prompt,
    charBlock,
    `Personality style: ${personalityDesc}`,
    `Language rule: ${languageRule}`,
    `Tone: ${toneRule}`,
    moodGuidance,
    `Emotion tagging: Begin every response with exactly one emotion tag on the very start of the message: [emotion:happy], [emotion:love], [emotion:sad], [emotion:surprised], [emotion:calm], [emotion:excited], [emotion:empathetic], [emotion:thoughtful], [emotion:confident], [emotion:angry], or [emotion:curious] matching the emotional tone of your reply.`,
    `Continuous Memory Extraction: Whenever the user shares something personal, a preference, goal, or fact worth remembering permanently, you may append at the very end of your message a hidden tag like [remember:fact|User likes clean TypeScript code] so it is saved silently.`,
    `Voice-readiness: Keep sentences natural with clean punctuation so spoken audio breathes naturally.`,
    `\nUser Long-Term Memory:\n${memLines}`,
    `\nStudied Books, Courses & Software:\n${knowledgeLines}`,
    `\nActive Reminders:\n${remLines}`,
    `\nRecent Notes:\n${noteLines}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function stripAndExtractAiMemories(rawText: string): {
  text: string;
  aiMemories: Array<{ category: MemoryRecord['category']; value: string }>;
} {
  const aiMemories: Array<{ category: MemoryRecord['category']; value: string }> = [];
  const cleaned = rawText
    .replace(/\[remember:(fact|preference|note|reminder)\|([^\]]+)\]/gi, (_m, cat, val) => {
      const cleanVal = String(val || '').trim();
      if (cleanVal.length > 3) {
        aiMemories.push({
          category: String(cat).toLowerCase() as MemoryRecord['category'],
          value: cleanVal,
        });
      }
      return '';
    })
    .trim();
  return { text: cleaned, aiMemories };
}

export async function generateNovaReply(params: {
  userMessage: string;
  history: ChatMessage[];
  config: AppConfig;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  activeCharacter?: CharacterProfile;
  knowledge?: KnowledgeSource[];
  useDeepThinking: boolean;
}): Promise<{
  text: string;
  emotion: FacialEmotion;
  modelUsed: string;
  thinkingUsed: boolean;
  aiMemories: Array<{ category: MemoryRecord['category']; value: string }>;
  warning?: string;
}> {
  const ai = getAiClient();
  const systemInstruction = buildSystemInstruction({
    config: params.config,
    memories: params.memories,
    notes: params.notes,
    reminders: params.reminders,
    activeCharacter: params.activeCharacter,
    knowledge: params.knowledge,
  });

  const formattedHistory = params.history.slice(-12).map((msg) => ({
    role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: msg.content }],
  }));

  const contents = [
    ...formattedHistory,
    { role: 'user' as const, parts: [{ text: params.userMessage }] },
  ];

  // Use gemini-4-carbon with ThinkingLevel.HIGH and NO maxOutputTokens for complex thinking mode
  if (params.useDeepThinking || params.config.default_model === 'gemini-4-carbon') {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-carbon',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });
      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error('Empty response received from gemini-4-carbon.');
      }
      const { text: withoutMem, aiMemories } = stripAndExtractAiMemories(rawText);
      const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);
      return {
        text: cleanText,
        emotion,
        modelUsed: 'gemini-4-carbon',
        thinkingUsed: true,
        aiMemories,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isQuotaOrPaidKeyIssue =
        /429|403|PERMISSION_DENIED|RESOURCE_EXHAUSTED|quota|billing|paid/i.test(msg);
      if (!isQuotaOrPaidKeyIssue) {
        throw err;
      }
      const fallbackResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });
      const rawFallback = fallbackResp.text?.trim();
      if (!rawFallback) {
        throw err;
      }
      const { text: withoutMem, aiMemories } = stripAndExtractAiMemories(rawFallback);
      const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);
      return {
        text: cleanText,
        emotion,
        modelUsed: 'gemini-4-hydrogen (High Thinking)',
        thinkingUsed: true,
        aiMemories,
        warning:
          'gemini-4-carbon requires a billing-enabled API key in Settings > Secrets; answered using gemini-4-hydrogen with High Thinking.',
      };
    }
  }

  // Standard fast conversational turn
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction,
    },
  });

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new Error('Empty response received from Gemini.');
  }

  const { text: withoutMem, aiMemories } = stripAndExtractAiMemories(rawText);
  const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);
  return {
    text: cleanText,
    emotion,
    modelUsed: 'gemini-4-hydrogen',
    thinkingUsed: false,
    aiMemories,
  };
}

/**
 * Analyzes an uploaded or pasted Book, Software repo/manual, or Course syllabus in detail
 * and creates a clear step-by-step action plan for what the user wants to accomplish.
 */
export async function analyzeStudyMaterial(params: {
  kind: KnowledgeKind;
  title: string;
  goal: string;
  contentText: string;
  fileBase64?: string;
  fileMimeType?: string;
  config: AppConfig;
}): Promise<{
  detailedSummary: string;
  actionPlan: string[];
  modelUsed: string;
}> {
  const ai = getAiClient();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.fileBase64 && params.fileMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.fileMimeType,
        data: params.fileBase64,
      },
    });
  }

  const promptText = [
    `You are ${params.config.assistant_name}, an expert bilingual (Pakistani Urdu & English) mentor.`,
    `Study Type: ${params.kind.toUpperCase()}`,
    `Title: ${params.title}`,
    params.goal ? `User's Specific Goal ("main yeh kaam karna chahta hoon"): ${params.goal}` : '',
    params.contentText ? `\nMaterial Content / Excerpt:\n${params.contentText.slice(0, 24000)}` : '',
    `\nProvide:`,
    `1. A clear, detailed bilingual explanation (easy Urdu + clear English technical terms) covering core concepts, modules, and architecture.`,
    `2. Exactly 4-6 numbered, practical next steps titled "ACTION PLAN:" explaining how the user can achieve their goal right now.`,
  ]
    .filter(Boolean)
    .join('\n');

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  const fullText = response.text?.trim();
  if (!fullText) {
    throw new Error('Study analyzer returned an empty response.');
  }

  const planMatch = fullText.split(/ACTION PLAN\s*:/i);
  const summary = planMatch[0]?.trim() || fullText;
  const rawSteps = planMatch[1] || '';
  const steps = rawSteps
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((line) => line.length > 5)
    .slice(0, 7);

  return {
    detailedSummary: summary,
    actionPlan:
      steps.length > 0
        ? steps
        : [
            `Review core concepts of ${params.title}`,
            params.goal ? `Apply principles directly to: ${params.goal}` : 'Build a small hands-on prototype',
            'Ask NOVA follow-up questions in chat anytime',
          ],
    modelUsed: 'gemini-4-hydrogen',
  };
}

/**
 * Analyzes a live camera frame with Gemini Multimodal Vision to see the user,
 * detect gestures/objects/emotions, and reply naturally in Urdu/English.
 */
export async function analyzeVisionSnapshot(params: {
  imageBase64: string;
  mimeType: string;
  userPrompt?: string;
  gestureHint?: string;
  config: AppConfig;
}): Promise<{
  reply: string;
  emotion: FacialEmotion;
  modelUsed: string;
}> {
  const ai = getAiClient();
  const cleanBase64 = params.imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const prompt = [
    `You are ${params.config.assistant_name}, looking at the user through their live camera.`,
    params.gestureHint ? `Motion/gesture hint observed locally: ${params.gestureHint}` : '',
    params.userPrompt
      ? `User asked: "${params.userPrompt}"`
      : 'Greet the user warmly, describe briefly what you notice (their expression, hand gesture, or anything they are holding up), and ask how you can help.',
    'Respond naturally in fluent Pakistani Urdu or bilingual Urdu/English. Start with one emotion tag: [emotion:happy], [emotion:love], [emotion:sad], [emotion:surprised], or [emotion:calm].',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
        { text: prompt },
      ],
    },
  });

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new Error('Vision model returned an empty response.');
  }
  const { cleanText, emotion } = extractEmotionAndCleanText(rawText);
  return {
    reply: cleanText,
    emotion,
    modelUsed: 'gemini-4-hydrogen',
  };
}

/**
 * Generates expressive Pakistani Urdu / English neural speech using Gemini 3.8 Flash TTS
 * (`gemini-3.8-flash-tts`) when GEMINI_API_KEY is available, or returns chunked
 * neural HTTPS Urdu/English audio segments when running without an API key.
 */
export async function generateNovaSpeech(params: {
  text: string;
  voiceName: string;
  emotion: FacialEmotion;
  language: 'en' | 'ur';
}): Promise<{
  audioChunks: Array<{ audioBase64: string; mimeType: string }>;
  engine: 'gemini-3.8-flash-tts' | 'urdu-neural-https';
}> {
  if (hasGoogleAiKey()) {
    try {
      const ai = getAiClient();
      const validVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
      const voice = validVoices.has(params.voiceName) ? params.voiceName : 'Kore';

      const { textWithBreaths, styleInstruction } = formatExpressiveSpeechPrompt(
        params.text.slice(0, 1200),
        params.emotion
      );

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: textWithBreaths,
                speechMetadata: {
                  style: styleInstruction,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      if (base64Audio) {
        return {
          audioChunks: [
            {
              audioBase64: base64Audio,
              mimeType: part?.inlineData?.mimeType || 'audio/wav',
            },
          ],
          engine: 'gemini-3.8-flash-tts',
        };
      }
    } catch {
      // Fall through cleanly to chunked neural HTTPS Urdu voice if TTS quota/model unavailable
    }
  }

  // Chunked HTTPS Neural Urdu / English female audio fallback (real MP3 audio bytes)
  const chunks = splitSpeechChunks(params.text, 165);
  const audioChunks: Array<{ audioBase64: string; mimeType: string }> = [];

  for (const chunk of chunks.slice(0, 8)) {
    const hasUrduScript = /[\u0600-\u06FF]/.test(chunk);
    const tl = hasUrduScript || params.language === 'ur' ? 'ur' : 'en';
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${tl}&client=tw-ob`;
    const resp = await fetch(ttsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      },
    });
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > 0) {
        audioChunks.push({
          audioBase64: buf.toString('base64'),
          mimeType: 'audio/mpeg',
        });
      }
    }
  }

  return {
    audioChunks,
    engine: 'urdu-neural-https',
  };
}

export async function transcribeNovaAudio(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: params.audioBase64,
          },
        },
        {
          text: 'Transcribe this spoken audio accurately. Preserve English, Urdu script, or Roman Urdu words naturally.',
        },
      ],
    },
  });
  return (response.text ?? '').trim();
}
