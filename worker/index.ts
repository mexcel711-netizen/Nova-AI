import {
  detectEmotionFromText,
  extractEmotionAndCleanText,
  resolveActiveAiProvider,
  splitSpeechChunks,
} from '../src/lib/emotionAndSpeech';
import { extractMemoriesFromUtterance } from '../src/lib/memoryExtractor';
import { detectUrduIntent, matchSkillCommand } from '../src/lib/skillMatcher';
import type {
  AppConfig,
  ChatApiResponse,
  FacialEmotion,
  ProviderStatus,
  SkillConfig,
} from '../src/types/nova';

interface CloudflareAiBinding {
  run: (
    model: string,
    input: {
      messages?: Array<{ role: string; content: string }>;
      text?: string;
    }
  ) => Promise<{ response?: string } | ReadableStream<Uint8Array>>;
}

interface WorkerEnv {
  AI?: CloudflareAiBinding;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  CLOUDFLARE_MODEL?: string;
}

const DEFAULT_WORKER_CONFIG: AppConfig = {
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

const DEFAULT_WORKER_SKILLS: SkillConfig[] = [
  {
    id: 1,
    skill_name: 'app_launcher',
    display_name: 'App & Web Launcher',
    description: 'Opens apps and websites via English or Urdu commands.',
    trigger_phrases: ['open', 'launch', 'start', 'kholo'],
    action_type: 'launch',
    action_value: 'browser_launcher',
    is_enabled: true,
    is_custom: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    skill_name: 'calculator',
    display_name: 'Precision Calculator',
    description: 'Evaluates math expressions.',
    trigger_phrases: ['calculate', 'compute', 'hisaab'],
    action_type: 'calc',
    action_value: 'math_eval',
    is_enabled: true,
    is_custom: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    skill_name: 'time_date',
    display_name: 'Clock & Calendar',
    description: 'Reports current local time and date.',
    trigger_phrases: ['what time', 'waqt', 'tareekh'],
    action_type: 'system',
    action_value: 'clock',
    is_enabled: true,
    is_custom: false,
    created_at: new Date().toISOString(),
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getWorkerProviderStatus(env: WorkerEnv): ProviderStatus {
  return resolveActiveAiProvider({
    preference: 'auto',
    hasCloudflareBinding: Boolean(env.AI),
    hasCloudflareRest: false,
    hasGoogleAiKey: Boolean(env.GEMINI_API_KEY?.trim()),
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return jsonResponse({
        ok: true,
        runtime: 'cloudflare-worker',
        timestamp: new Date().toISOString(),
        providerStatus: getWorkerProviderStatus(env),
      });
    }

    if (url.pathname === '/api/state') {
      return jsonResponse({
        config: DEFAULT_WORKER_CONFIG,
        skills: DEFAULT_WORKER_SKILLS,
        memories: [],
        notes: [],
        reminders: [],
        sessions: [],
        providerStatus: getWorkerProviderStatus(env),
      });
    }

    if (url.pathname === '/api/config' && request.method === 'PUT') {
      const partial = (await request.json()) as Partial<AppConfig>;
      return jsonResponse({
        config: { ...DEFAULT_WORKER_CONFIG, ...partial },
        providerStatus: getWorkerProviderStatus(env),
      });
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const { message, history = [] } = (await request.json()) as {
          message?: string;
          history?: Array<{ role: string; content: string }>;
        };
        const cleanMessage = (message ?? '').trim();
        if (!cleanMessage) return jsonResponse({ error: 'Message cannot be empty.' }, 400);

        const userLang: 'en' | 'ur' = detectUrduIntent(cleanMessage) ? 'ur' : 'en';
        const extracted = extractMemoriesFromUtterance(cleanMessage);
        const skillMatch = matchSkillCommand(cleanMessage, DEFAULT_WORKER_SKILLS);

        if (skillMatch.matched && skillMatch.responseText) {
          const payload: ChatApiResponse = {
            reply: skillMatch.responseText,
            emotion: detectEmotionFromText(skillMatch.responseText),
            language: skillMatch.language ?? userLang,
            modelUsed: 'skill-engine',
            providerUsed: 'local-skill',
            thinkingUsed: false,
            skillExecuted: skillMatch.skillName,
            sideEffect: skillMatch.sideEffect,
            extractedMemories: extracted.map((m) => ({
              category: m.category,
              key: m.key,
              value: m.value,
            })),
          };
          return jsonResponse(payload);
        }

        const systemPrompt =
          'You are NOVA, a poised, warm Pakistani female AI assistant fluent in Urdu (اردو), Roman Urdu, and English. Always begin your reply with exactly one emotion tag: [emotion:happy], [emotion:sad], [emotion:surprised], or [emotion:calm]. When addressed in Urdu or Roman Urdu, respond naturally in Urdu script (اردو) so speech pronunciation sounds authentic.';

        // Automatically use Cloudflare Workers AI binding (`env.AI`) upon deployment!
        if (env.AI) {
          const model = env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
          const aiRes = (await env.AI.run(model, {
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.slice(-8).map((m) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
              })),
              { role: 'user', content: cleanMessage },
            ],
          })) as { response?: string };

          const rawText = aiRes?.response?.trim() || 'جی، میں آپ کی مدد کے لیے حاضر ہوں۔';
          const parsed = extractEmotionAndCleanText(rawText);
          const payload: ChatApiResponse = {
            reply: parsed.cleanText,
            emotion: parsed.emotion,
            language: detectUrduIntent(parsed.cleanText) ? 'ur' : userLang,
            modelUsed: model,
            providerUsed: 'cloudflare-binding',
            thinkingUsed: false,
          };
          return jsonResponse(payload);
        }

        // Fallback to Gemini REST if GEMINI_API_KEY secret is configured on Cloudflare
        if (env.GEMINI_API_KEY?.trim()) {
          const gemRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY.trim())}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: cleanMessage }] }],
              }),
            }
          );
          const gemData = (await gemRes.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const rawText =
            gemData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
            'Assalamualaikum! How can I assist you?';
          const parsed = extractEmotionAndCleanText(rawText);
          return jsonResponse({
            reply: parsed.cleanText,
            emotion: parsed.emotion,
            language: detectUrduIntent(parsed.cleanText) ? 'ur' : userLang,
            modelUsed: 'gemini-api',
            providerUsed: 'google-ai-studio',
            thinkingUsed: false,
          } satisfies ChatApiResponse);
        }

        return jsonResponse(
          { error: 'Cloudflare Workers AI binding (env.AI) is not attached.' },
          503
        );
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Worker chat error' },
          500
        );
      }
    }

    if (url.pathname === '/api/tts' && request.method === 'POST') {
      const { text, language } = (await request.json()) as {
        text?: string;
        emotion?: FacialEmotion;
        language?: 'en' | 'ur';
      };
      if (!text?.trim()) return jsonResponse({ error: 'Text is required.' }, 400);

      const chunks = splitSpeechChunks(text.trim(), 165);
      const audioChunks: Array<{ audioBase64: string; mimeType: string }> = [];

      for (const chunk of chunks.slice(0, 8)) {
        const hasUrdu = /[\u0600-\u06FF]/.test(chunk);
        const tl = hasUrdu || language === 'ur' ? 'ur' : 'en';
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${tl}&client=tw-ob`;
        const resp = await fetch(ttsUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (resp.ok) {
          const bytes = new Uint8Array(await resp.arrayBuffer());
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          audioChunks.push({ audioBase64: btoa(bin), mimeType: 'audio/mpeg' });
        }
      }
      return jsonResponse({ audioChunks, engine: 'urdu-neural-https' });
    }

    return env.ASSETS.fetch(request);
  },
};
