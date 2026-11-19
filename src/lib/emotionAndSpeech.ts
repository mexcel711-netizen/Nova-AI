import type { AiProviderPreference, FacialEmotion, ProviderStatus } from '../types/nova';

/**
 * Classifies facial expression from bilingual English, Urdu, and Roman Urdu text.
 * Supports explicit `[emotion:...]` tag stripping including `love`, `happy`, `sad`, `surprised`, `calm`.
 */
export function extractEmotionAndCleanText(rawText: string): {
  cleanText: string;
  emotion: FacialEmotion;
} {
  let cleanText = rawText.trim();
  const tagMatch = cleanText.match(
    /^\[emotion:(happy|love|sad|surprised|calm|excited|empathetic|thoughtful|confident|angry|curious)\]\s*/i
  );
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
  const rules: Array<{ emotion: FacialEmotion; patterns: RegExp[] }> = [
    {
      emotion: 'love',
      patterns: [
        /\b(love you|i love|adore|sweetheart|darling|my heart|care deeply|always yours|affection|romantic)\b/i,
        /\b(pyaar|pyar|mohabbat|ishq|dil se|jaan|azeez|chahat|bohat pyari)\b/i,
        /(پیار|محبت|عشق|دل سے|عزیز|جان)/,
      ],
    },
    {
      emotion: 'excited',
      patterns: [
        /\b(can't wait|so excited|fantastic|let's go|amazing news|woohoo)\b/i,
        /\b(zabardast|bohat khoob|kya baat)\b/i,
      ],
    },
    {
      emotion: 'empathetic',
      patterns: [
        /\b(i understand|that sounds hard|i'm here for you|my heart goes out|take your time)\b/i,
        /\b(samajh sakti|fikr na karein|main saath hoon)\b/i,
      ],
    },
    {
      emotion: 'thoughtful',
      patterns: [
        /\b(let me think|consider|on reflection|perhaps|it depends|here's why)\b/i,
        /\b(ghor karte|sochti hoon|aaiye samjhein)\b/i,
      ],
    },
    {
      emotion: 'confident',
      patterns: [
        /\b(absolutely|certainly|definitely|you can count on me|i've got this)\b/i,
        /\b(bilkul|yaqeenan|zaroor|main kar sakti hoon)\b/i,
      ],
    },
    {
      emotion: 'angry',
      patterns: [
        /\b(unacceptable|furious|outrageous|that's not okay)\b/i,
        /\b(na-insafi|ghalat baat|bardasht nahi)\b/i,
      ],
    },
    {
      emotion: 'curious',
      patterns: [
        /\b(i wonder|interesting question|curious|let's explore|tell me more)\b/i,
        /\b(dilchasp|mazeed bataiye|jaanna chahti)\b/i,
      ],
    },
    {
      emotion: 'surprised',
      patterns: [
        /\b(wow|whoa|incredible|unbelievable|shocking|really\?!|seriously\?|what a surprise)\b/i,
        /\b(hairan|kamaal|wah|arey wah|sach mein)\b/i,
        /(حیران|کمال|واہ|سچ میں)/,
        /!{2,}|\?!/,
      ],
    },
    {
      emotion: 'sad',
      patterns: [
        /\b(sorry|unfortunately|sad|regret|apologize|condolences|heartbreaking|miss you|worried|unable to|failed)\b/i,
        /\b(afsos|maaf|maazrat|udaas|dukh|gham|pareshan|mushkil)\b/i,
        /(افسوس|معذرت|اداس|دکھ|پریشان|معاف)/,
      ],
    },
    {
      emotion: 'happy',
      patterns: [
        /\b(assalamualaikum|walaikum assalam|hello|welcome|great|wonderful|happy|glad|congratulations|awesome|delighted|thank|shukriya|khushi|mubarak|behtareen|zabardast|shandar|khush)\b/i,
        /(السلام علیکم|وعلیکم السلام|خوش|مبارک|شکریہ|بہترین|زبردست)/,
      ],
    },
  ];
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(lower))) return rule.emotion;
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
export function formatExpressiveSpeechPrompt(
  text: string,
  emotion: FacialEmotion
): {
  textWithBreaths: string;
  styleInstruction: string;
} {
  const chunks = splitSpeechChunks(text, 220);
  const textWithBreaths = chunks.join(' <breath> ');

  const emotionStyles: Record<FacialEmotion, string> = {
    calm: 'Calm, composed, soothing Pakistani female voice with poised warmth.',
    happy: 'Warm, cheerful, smiling Pakistani female voice with gentle enthusiasm.',
    love: 'Tender, affectionate, deeply caring and gentle Pakistani female voice filled with heartfelt warmth.',
    excited: 'Bright, energetic, delighted Pakistani female voice with lively but natural inflection.',
    sad: 'Soft, tender Pakistani female voice with gentle sadness and unhurried pacing.',
    empathetic: 'Deeply caring, reassuring Pakistani female voice with compassionate warmth.',
    thoughtful: 'Reflective, measured Pakistani female voice with thoughtful pauses and gentle curiosity.',
    confident: 'Clear, assured Pakistani female voice with steady, composed authority.',
    angry: 'Firm, controlled Pakistani female voice expressing displeasure without shouting.',
    surprised: 'Expressive, bright, intrigued Pakistani female voice with lively inflection.',
    curious: 'Engaged, inquisitive Pakistani female voice with an inviting upward lilt.',
  };
  const emotionStyle =
    emotionStyles[emotion] || 'Calm, composed, soothing Pakistani female voice with poised warmth.';

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
