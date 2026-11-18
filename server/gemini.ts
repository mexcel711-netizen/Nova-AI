import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  extractEmotionAndCleanText,
  formatExpressiveSpeechPrompt,
  splitSpeechChunks,
} from '../src/lib/emotionAndSpeech';
import type {
  AppConfig,
  ChatMessage,
  FacialEmotion,
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
}): string {
  const { config, memories, notes, reminders } = params;
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

  return [
    `Your name is ${config.assistant_name}.`,
    config.custom_prompt,
    `Personality style: ${personalityDesc}`,
    `Language rule: ${languageRule}`,
    `Tone: ${toneRule}`,
    `Emotion tagging: Begin every response with exactly one emotion tag on the very start of the message: [emotion:happy], [emotion:sad], [emotion:surprised], or [emotion:calm] matching the emotional tone of your reply.`,
    `Voice-readiness: Keep sentences natural with clean punctuation so spoken audio breathes naturally.`,
    `\nUser Long-Term Memory:\n${memLines}`,
    `\nActive Reminders:\n${remLines}`,
    `\nRecent Notes:\n${noteLines}`,
  ].join('\n');
}

export async function generateNovaReply(params: {
  userMessage: string;
  history: ChatMessage[];
  config: AppConfig;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  useDeepThinking: boolean;
}): Promise<{
  text: string;
  emotion: FacialEmotion;
  modelUsed: string;
  thinkingUsed: boolean;
  warning?: string;
}> {
  const ai = getAiClient();
  const systemInstruction = buildSystemInstruction({
    config: params.config,
    memories: params.memories,
    notes: params.notes,
    reminders: params.reminders,
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
      const { cleanText, emotion } = extractEmotionAndCleanText(rawText);
      return {
        text: cleanText,
        emotion,
        modelUsed: 'gemini-4-carbon',
        thinkingUsed: true,
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
      const { cleanText, emotion } = extractEmotionAndCleanText(rawFallback);
      return {
        text: cleanText,
        emotion,
        modelUsed: 'gemini-4-hydrogen (High Thinking)',
        thinkingUsed: true,
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

  const { cleanText, emotion } = extractEmotionAndCleanText(rawText);
  return {
    text: cleanText,
    emotion,
    modelUsed: 'gemini-4-hydrogen',
    thinkingUsed: false,
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
