import type { SkillConfig, SkillExecutionResult } from '../types/nova';

/**
 * Safely evaluates basic arithmetic expressions (+, -, *, /, %, parentheses)
 * without using eval or Function.
 */
export function evaluateSafeArithmetic(expr: string): number | null {
  const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').trim();
  if (!/^[0-9+\-*/().%\s]+$/.test(cleaned)) {
    return null;
  }

  let pos = 0;
  const skipWs = () => {
    while (pos < cleaned.length && /\s/.test(cleaned[pos])) pos++;
  };

  const parseExpression = (): number => {
    let val = parseTerm();
    while (true) {
      skipWs();
      const ch = cleaned[pos];
      if (ch === '+') {
        pos++;
        val += parseTerm();
      } else if (ch === '-') {
        pos++;
        val -= parseTerm();
      } else {
        break;
      }
    }
    return val;
  };

  const parseTerm = (): number => {
    let val = parseFactor();
    while (true) {
      skipWs();
      const ch = cleaned[pos];
      if (ch === '*') {
        pos++;
        val *= parseFactor();
      } else if (ch === '/') {
        pos++;
        const denom = parseFactor();
        if (denom === 0) throw new Error('Division by zero');
        val /= denom;
      } else if (ch === '%') {
        pos++;
        const mod = parseFactor();
        if (mod === 0) throw new Error('Modulo by zero');
        val %= mod;
      } else {
        break;
      }
    }
    return val;
  };

  const parseFactor = (): number => {
    skipWs();
    if (cleaned[pos] === '+') {
      pos++;
      return parseFactor();
    }
    if (cleaned[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    if (cleaned[pos] === '(') {
      pos++;
      const val = parseExpression();
      skipWs();
      if (cleaned[pos] !== ')') {
        throw new Error('Mismatched parentheses');
      }
      pos++;
      return val;
    }

    const start = pos;
    let hasDot = false;
    while (pos < cleaned.length) {
      const ch = cleaned[pos];
      if (ch >= '0' && ch <= '9') {
        pos++;
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        pos++;
      } else {
        break;
      }
    }
    if (start === pos) {
      throw new Error('Expected number');
    }
    const num = Number(cleaned.slice(start, pos));
    if (!Number.isFinite(num)) {
      throw new Error('Invalid number');
    }
    return num;
  };

  try {
    const result = parseExpression();
    skipWs();
    if (pos !== cleaned.length || !Number.isFinite(result)) {
      return null;
    }
    return Math.round(result * 1_000_000) / 1_000_000;
  } catch {
    return null;
  }
}

export function detectUrduIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (/[\u0600-\u06FF]/.test(text)) return true;
  const romanUrduTokens = [
    'kholo',
    'batao',
    'waqt',
    'kya',
    'mera',
    'meri',
    'mujhe',
    'aaj',
    'yaad',
    'likho',
    'band',
    'chalu',
    'karo',
    'karein',
    'kaise',
    'assalam',
    'shukriya',
    'madad',
    'tareekh',
  ];
  return romanUrduTokens.some((tok) => new RegExp(`\\b${tok}\\b`, 'i').test(lower));
}

const KNOWN_APPS: Record<string, { label: string; url: string }> = {
  chrome: { label: 'Google Chrome', url: 'https://www.google.com' },
  browser: { label: 'Web Browser', url: 'https://www.google.com' },
  youtube: { label: 'YouTube', url: 'https://www.youtube.com' },
  github: { label: 'GitHub', url: 'https://github.com' },
  gmail: { label: 'Gmail', url: 'https://mail.google.com' },
  calendar: { label: 'Google Calendar', url: 'https://calendar.google.com' },
  maps: { label: 'Google Maps', url: 'https://maps.google.com' },
  vscode: { label: 'VS Code Web', url: 'https://vscode.dev' },
  notion: { label: 'Notion', url: 'https://www.notion.so' },
};

/**
 * Matches user utterance against enabled skills (custom skills first, then built-ins).
 */
export function matchSkillCommand(
  rawInput: string,
  skills: SkillConfig[],
  now: Date = new Date()
): SkillExecutionResult {
  const input = rawInput.trim();
  if (!input) return { matched: false };

  const lower = input.toLowerCase();
  const isUrdu = detectUrduIntent(input);

  // 1. Custom skills take priority when enabled
  for (const skill of skills) {
    if (!skill.is_enabled || !skill.is_custom) continue;
    const hit = skill.trigger_phrases.some((phrase) => {
      const p = phrase.trim().toLowerCase();
      return p.length > 0 && lower.includes(p);
    });
    if (hit) {
      if (skill.action_type === 'url') {
        return {
          matched: true,
          skillName: skill.skill_name,
          actionType: 'url',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu
            ? `${skill.display_name} khol diya gaya hai.`
            : `Opening ${skill.display_name} now.`,
          sideEffect: { type: 'open_url', url: skill.action_value },
        };
      }
      if (skill.action_type === 'note') {
        return {
          matched: true,
          skillName: skill.skill_name,
          actionType: 'note',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu
            ? `Custom skill "${skill.display_name}" ke zariye note save kar liya gaya hai.`
            : `Saved note via "${skill.display_name}".`,
          sideEffect: {
            type: 'create_note',
            noteTitle: skill.display_name,
            noteContent: skill.action_value || input,
          },
        };
      }
      if (skill.action_type === 'ai') {
        // AI custom skills enrich rather than bypass Gemini unless handled
        continue;
      }
      return {
        matched: true,
        skillName: skill.skill_name,
        actionType: skill.action_type,
        language: isUrdu ? 'ur' : 'en',
        responseText: skill.action_value || `Executed ${skill.display_name}.`,
        sideEffect: {
          type: 'system_action',
          systemCommand: skill.action_value,
        },
      };
    }
  }

  const isEnabled = (name: string) => {
    const found = skills.find((s) => s.skill_name === name);
    return found ? found.is_enabled : true;
  };

  // 2. Time & Date skill
  if (
    isEnabled('time_date') &&
    (/\b(what time|current time|time is it|tell me the time|what'?s the time)\b/i.test(lower) ||
      /\b(waqt|time kya|kya time|aaj ki tareekh|what date|today'?s date)\b/i.test(lower) ||
      /(وقت|تاریخ)/.test(input))
  ) {
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const hasUrduScript = /[\u0600-\u06FF]/.test(input);
    return {
      matched: true,
      skillName: 'time_date',
      actionType: 'system',
      language: isUrdu ? 'ur' : 'en',
      responseText: hasUrduScript
        ? `اس وقت ${timeStr} بج رہے ہیں، اور آج ${dateStr} ہے۔`
        : isUrdu
          ? `Abhi waqt ${timeStr} hai, aur aaj ${dateStr} hai.`
          : `It is currently ${timeStr} on ${dateStr}.`,
      sideEffect: { type: 'none' },
    };
  }

  // 3. Calculator skill
  if (isEnabled('calculator')) {
    const calcMatch = input.match(
      /(?:^|\b)(?:calc(?:ulate)?|compute|what is|kitna hota hai|hisaab)\s+([0-9+\-*/().%\s×÷,]+)(?:\?|$)/i
    );
    const candidate = calcMatch ? calcMatch[1].replace(/\?+$/, '').trim() : input;
    if (/[+\-*/%×÷]/.test(candidate) && /\d/.test(candidate)) {
      const value = evaluateSafeArithmetic(candidate);
      if (value !== null) {
        return {
          matched: true,
          skillName: 'calculator',
          actionType: 'calc',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu
            ? `${candidate} ka jawab ${value} hai.`
            : `${candidate} equals ${value}.`,
          sideEffect: { type: 'none' },
        };
      }
    }
  }

  // 4. Create Note skill
  if (isEnabled('notes_manager')) {
    const noteMatch =
      input.match(/^(?:create\s+a?\s*note|take\s+a?\s*note|add\s+note|note)\s*[:\-]?\s+(.+)$/i) ||
      input.match(/^(?:note\s+likho|likho)\s*[:\-]?\s+(.+)$/i);
    if (noteMatch && noteMatch[1].trim().length > 0) {
      const content = noteMatch[1].trim();
      const title = content.split(/[.!?\n]/)[0].slice(0, 48).trim();
      return {
        matched: true,
        skillName: 'notes_manager',
        actionType: 'note',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? `Note save ho gaya hai: "${content}"`
          : `I've saved your note: "${content}"`,
        sideEffect: {
          type: 'create_note',
          noteTitle: title || 'Quick Note',
          noteContent: content,
        },
      };
    }
  }

  // 5. Reminder skill
  if (isEnabled('reminders_manager')) {
    const reminderMatch =
      input.match(/^remind\s+me\s+(?:to\s+)?(.+?)(?:\s+(?:at|on|in)\s+(.+))?$/i) ||
      input.match(/^(?:yaad\s+dila(?:na|o)|reminder\s+lagao)\s*[:\-]?\s+(.+)$/i);
    if (reminderMatch && reminderMatch[1].trim().length > 0) {
      const title = reminderMatch[1].trim();
      const whenRaw = reminderMatch[2]?.trim();
      const remindAt = whenRaw || new Date(now.getTime() + 60 * 60 * 1000).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        matched: true,
        skillName: 'reminders_manager',
        actionType: 'reminder',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? `Reminder set kar diya gaya hai: "${title}" (${remindAt}).`
          : `Reminder set for "${title}" (${remindAt}).`,
        sideEffect: {
          type: 'create_reminder',
          reminderTitle: title,
          reminderAt: remindAt,
        },
      };
    }
  }

  // 6. Web search skill
  if (isEnabled('web_search')) {
    const searchMatch =
      input.match(/^(?:search(?:\s+for)?|google|look\s+up)\s+(.+)$/i) ||
      input.match(/^(.+?)\s+(?:search\s+karo|dhundo)$/i);
    if (searchMatch && searchMatch[1].trim().length > 1) {
      const q = searchMatch[1].trim();
      const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      return {
        matched: true,
        skillName: 'web_search',
        actionType: 'url',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? `"${q}" ke liye web search tayyar hai.`
          : `Searching the web for "${q}".`,
        sideEffect: { type: 'open_url', url },
      };
    }
  }

  // 7. App / Website Launcher skill ("open chrome", "chrome kholo")
  if (isEnabled('app_launcher')) {
    const openEn = input.match(/^(?:open|launch|start)\s+([a-z0-9.\-_ ]+)$/i);
    const openUr = input.match(/^([a-z0-9.\-_ ]+?)\s+(?:kholo|chalu\s+karo|open\s+karo)$/i);
    const target = (openEn?.[1] || openUr?.[1])?.trim().toLowerCase();
    if (target) {
      const known = KNOWN_APPS[target];
      if (known) {
        return {
          matched: true,
          skillName: 'app_launcher',
          actionType: 'launch',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu
            ? `${known.label} khul gaya hai.`
            : `Launching ${known.label}.`,
          sideEffect: { type: 'open_url', url: known.url },
        };
      }
      if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(target)) {
        return {
          matched: true,
          skillName: 'app_launcher',
          actionType: 'url',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu ? `${target} khol raha hun.` : `Opening ${target}.`,
          sideEffect: { type: 'open_url', url: `https://${target}` },
        };
      }
    }
  }

  // 8. System control skill (volume, brightness, mute)
  if (isEnabled('system_control')) {
    if (
      /\b(volume\s+(?:up|down)|mute|unmute|brightness\s+(?:up|down)|awaaz\s+(?:kam|zyada|band))\b/i.test(
        lower
      )
    ) {
      return {
        matched: true,
        skillName: 'system_control',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? 'Audio aur display control command execute kar di gayi hai.'
          : 'System audio/display control adjusted.',
        sideEffect: { type: 'system_action', systemCommand: lower },
      };
    }
  }

  return { matched: false };
}

/**
 * Determines whether a prompt is a complex reasoning, architecture, debugging,
 * mathematical proof, or multi-step planning query suitable for Deep Thinking (gemini-4-carbon).
 */
export function isComplexThinkingQuery(text: string): boolean {
  const lower = text.toLowerCase();
  if (text.trim().length >= 160) return true;
  const complexKeywords = [
    'architect',
    'architecture',
    'analyze',
    'analysis',
    'compare',
    'trade-off',
    'tradeoff',
    'debug',
    'root cause',
    'strategy',
    'plan',
    'roadmap',
    'algorithm',
    'complexity',
    'optimize',
    'proof',
    'derive',
    'explain in detail',
    'step by step',
    'step-by-step',
    'tafsil',
    'tafseel',
    'samjhao',
    'design a system',
    'write a full',
    'security audit',
  ];
  return complexKeywords.some((kw) => lower.includes(kw));
}
