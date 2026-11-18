import type { AiProviderPreference, FacialEmotion, ProviderStatus } from '../types/nova';

/**
 * Classifies facial expression from bilingual English, Urdu, and Roman Urdu text.
 * Also supports optional explicit `[emotion:happy|sad|surprised|calm]` tag stripping.
 */
export function extractEmotionAndCleanText(rawText: string): {
  cleanText: string;
  emotion: FacialEmotion;
} {
  let cleanText = rawText.trim();
  const tagMatch = cleanText.match(/^\[emotion:(happy|sad|surprised|calm)\]\s*/i);
  if (tagMatch) {
    const tagged = tagMatch[1].toLowerCase() as FacialEmotion;
    cleanText = cleanText.slice(tagMatch[0].length).trim();
    return { cleanText, emotion: tagged };
  }

  return {
    cleanText,
    emotion: detectEmotionFromText(cleanText),
  };
}

export function detectEmotionFromText(text: string): FacialEmotion {
  const lower = text.toLowerCase();

  const surprisedPatterns = [
    /\b(wow|whoa|amazing|incredible|unbelievable|shocking|really\?!|seriously\?|what a surprise)\b/i,
    /\b(hairan|kamaal|wah|arey wah|sach mein)\b/i,
    /(حیران|کمال|واہ|سچ میں)/,
    /!{2,}|\?!/,
  ];
  if (surprisedPatterns.some((re) => re.test(text))) {
    return 'surprised';
  }

  const sadPatterns = [
    /\b(sorry|unfortunately|sad|regret|apologize|condolences|heartbreaking|miss you|worried|unable to|failed)\b/i,
    /\b(afsos|maaf|maazrat|udaas|dukh|ggham|pareshan|mushkil)\b/i,
    /(افسوس|معذرت|اداس|دکھ|پریشان|معاف)/,
  ];
  if (sadPatterns.some((re) => re.test(lower))) {
    return 'sad';
  }

  const happyPatterns = [
    /\b(assalamualaikum|walaikum assalam|hello|welcome|great|wonderful|happy|glad|congratulations|awesome|delighted|love|thank|shukriya|khushi|mubarak|behtareen|zabardast|shandar|khush)\b/i,
    /(السلام علیکم|وعلیکم السلام|خوش|مبارک|شکریہ|بہترین|زبردست)/,
  ];
  if (happyPatterns.some((re) => re.test(lower))) {
    return 'happy';
  }

  return 'calm';
}

/**
 * Splits long bilingual text into natural speaking chunks (<= maxChars)
 * respecting Urdu ("۔") and English (".", "!", "?") sentence boundaries
 * so neural TTS plays with natural breathing pauses.
 */
export function splitSpeechChunks(text: string, maxChars: number = 175): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const rawSentences = normalized
    .split(/(?<=[.!?۔؟\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of rawSentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    const subParts = sentence.split(/(?<=[,،;؛])\s+/);
    let current = '';
    for (const part of subParts) {
      if (!current) {
        current = part;
      } else if (current.length + 1 + part.length <= maxChars) {
        current += ' ' + part;
      } else {
        chunks.push(current);
        current = part;
      }
    }
    if (current) chunks.push(current);
  }

  // Fallback hard split for unbroken strings
  const finalChunks: string[] = [];
  for (const ch of chunks) {
    if (ch.length <= maxChars) {
      finalChunks.push(ch);
    } else {
      const words = ch.split(' ');
      let buf = '';
      for (const w of words) {
        if (!buf) buf = w;
        else if (buf.length + 1 + w.length <= maxChars) buf += ' ' + w;
        else {
          finalChunks.push(buf);
          buf = w;
        }
      }
      if (buf) finalChunks.push(buf);
    }
  }
  return finalChunks;
}

/**
 * Formats text with natural `<breath>` markers for Gemini 3.8 Neural TTS emotional pacing.
 */
export function formatExpressiveSpeechPrompt(text: string, emotion: FacialEmotion): {
  textWithBreaths: string;
  styleInstruction: string;
} {
  const chunks = splitSpeechChunks(text, 220);
  const textWithBreaths = chunks.join(' <breath> ');

  const emotionStyle =
    emotion === 'happy'
      ? 'Warm, cheerful, smiling Pakistani female voice with gentle enthusiasm.'
      : emotion === 'sad'
        ? 'Soft, empathetic, gentle Pakistani female voice with caring warmth.'
        : emotion === 'surprised'
          ? 'Expressive, bright, intrigued Pakistani female voice with lively inflection.'
          : 'Calm, composed, soothing Pakistani female voice with poised warmth.';

  const styleInstruction = `${emotionStyle} Speak fluent Urdu with an authentic Pakistani accent and clear natural English when mixing languages. Maintain natural human speech rhythm and subtle breathing pauses.`;

  return { textWithBreaths, styleInstruction };
}

/**
 * Resolves which AI backend should handle requests based on environment bindings,
 * API keys, and user preference.
 */
export function resolveActiveAiProvider(params: {
  preference: AiProviderPreference;
  hasCloudflareBinding: boolean;
  hasCloudflareRest: boolean;
  hasGoogleAiKey: boolean;
}): ProviderStatus {
  const { preference, hasCloudflareBinding, hasCloudflareRest, hasGoogleAiKey } = params;
  const cloudflareConfigured = hasCloudflareBinding || hasCloudflareRest;

  let activeProvider: ProviderStatus['activeProvider'] = 'unconfigured';

  if (preference === 'cloudflare') {
    if (hasCloudflareBinding) activeProvider = 'cloudflare-binding';
    else if (hasCloudflareRest) activeProvider = 'cloudflare-rest';
    else if (hasGoogleAiKey) activeProvider = 'google-ai-studio';
  } else if (preference === 'google-ai-studio') {
    if (hasGoogleAiKey) activeProvider = 'google-ai-studio';
    else if (hasCloudflareBinding) activeProvider = 'cloudflare-binding';
    else if (hasCloudflareRest) activeProvider = 'cloudflare-rest';
  } else {
    // 'auto': Cloudflare Workers native AI binding activates automatically upon deploy;
    // otherwise Google AI Studio key or Cloudflare REST is used seamlessly.
    if (hasCloudflareBinding) activeProvider = 'cloudflare-binding';
    else if (hasGoogleAiKey) activeProvider = 'google-ai-studio';
    else if (hasCloudflareRest) activeProvider = 'cloudflare-rest';
  }

  return {
    activeProvider,
    googleAiConfigured: hasGoogleAiKey,
    cloudflareConfigured,
    cloudflareBindingActive: hasCloudflareBinding,
  };
}
