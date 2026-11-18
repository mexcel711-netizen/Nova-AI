import type { MemoryRecord } from '../types/nova';

export interface ExtractedMemoryCandidate {
  category: MemoryRecord['category'];
  key: string;
  value: string;
  source: 'user_stated' | 'ai_inferred';
  confidence: number;
}

/**
 * Extracts explicit user facts and preferences from English and Roman Urdu / Urdu statements.
 */
export function extractMemoriesFromUtterance(text: string): ExtractedMemoryCandidate[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 4) return [];

  const candidates: ExtractedMemoryCandidate[] = [];

  // Name patterns (English + Roman Urdu)
  const nameEn = trimmed.match(
    /\bmy name is\s+([a-zA-Z][a-zA-Z'-]{1,24}(?:\s+(?!and\b|aur\b|from\b|i\b|calculate\b)[a-zA-Z][a-zA-Z'-]{1,24})?)/i
  );
  const nameUr = trimmed.match(
    /\bmera naam\s+([a-zA-Z'-]{2,24}(?:\s+(?!hai\b|aur\b|and\b)[a-zA-Z'-]{2,24})?)\s+hai\b/i
  );
  const rawName = nameEn?.[1] || nameUr?.[1];
  if (rawName) {
    const cleanName = rawName.trim();
    candidates.push({
      category: 'fact',
      key: 'user_name',
      value: `User's name is ${cleanName}`,
      source: 'user_stated',
      confidence: 0.98,
    });
  }

  // Location patterns
  const locEn = trimmed.match(/\bi (?:live|am based|work) in\s+([a-zA-Z\s,.-]{2,40})/i);
  const locUr = trimmed.match(/\bmein\s+([a-zA-Z\s,.-]{2,35})\s+mein\s+rehta\b/i);
  const rawLoc = locEn?.[1] || locUr?.[1];
  if (rawLoc) {
    const cleanLoc = rawLoc.replace(/[.!?]+$/, '').trim();
    if (cleanLoc.length >= 2) {
      candidates.push({
        category: 'fact',
        key: 'user_location',
        value: `Located in ${cleanLoc}`,
        source: 'user_stated',
        confidence: 0.92,
      });
    }
  }

  // Preference patterns
  const prefEn = trimmed.match(/\bi (?:prefer|love|like|always use)\s+([^.!?]{3,70})/i);
  const prefUr = trimmed.match(/\bmujhe\s+([^.!?]{3,60}?)\s+(?:pasand hai|achha lagta hai)\b/i);
  const rawPref = prefEn?.[1] || prefUr?.[1];
  if (rawPref) {
    const cleanPref = rawPref.trim();
    candidates.push({
      category: 'preference',
      key: 'user_preference',
      value: `Prefers ${cleanPref}`,
      source: 'user_stated',
      confidence: 0.88,
    });
  }

  // Explicit "remember that ..." command
  const explicitMem =
    trimmed.match(/^(?:remember(?:\s+that)?|keep in mind(?:\s+that)?)\s+(.+)$/i) ||
    trimmed.match(/^(?:yaad\s+rakh(?:o|na)(?:\s+ke)?)\s+(.+)$/i);
  if (explicitMem && explicitMem[1].trim().length > 2) {
    candidates.push({
      category: 'fact',
      key: 'remembered_fact',
      value: explicitMem[1].trim(),
      source: 'user_stated',
      confidence: 1.0,
    });
  }

  return candidates;
}

export function filterMemories(
  memories: MemoryRecord[],
  query: string,
  category: 'all' | MemoryRecord['category']
): MemoryRecord[] {
  const q = query.trim().toLowerCase();
  return memories.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    return (
      item.value.toLowerCase().includes(q) ||
      (item.key?.toLowerCase().includes(q) ?? false) ||
      item.category.toLowerCase().includes(q)
    );
  });
}

export function isTodayIso(isoDateStr: string, now: Date = new Date()): boolean {
  const parsed = new Date(isoDateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}
