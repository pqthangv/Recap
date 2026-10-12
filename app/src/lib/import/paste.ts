// "Paste a list": one card per line, `term - definition`, `term<TAB>definition` or
// `term;definition`. The separator is detected from the text.

export type Separator = 'tab' | 'dash' | 'semicolon';

export type ParsedCard = { front: string; back: string };

export type PasteResult = {
  separator: Separator | null;
  cards: ParsedCard[];
  /** Non-empty lines that had no separator (shown so the user can fix them). */
  skipped: string[];
};

const PATTERNS: Record<Separator, RegExp> = {
  tab: /\t/,
  // A spaced hyphen or dash: "chat - cat", "chat – cat", "chat — cat". Hyphenated words are safe.
  dash: /\s+[-–—]\s+/,
  semicolon: /;/,
};

// When two separators are equally common, prefer the more deliberate one.
const PRIORITY: Separator[] = ['tab', 'dash', 'semicolon'];

export const SEPARATOR_LABELS: Record<Separator, string> = {
  tab: 'tab',
  dash: 'dash ( - )',
  semicolon: 'semicolon ( ; )',
};

export function detectSeparator(lines: readonly string[]): Separator | null {
  let best: Separator | null = null;
  let bestCount = 0;
  for (const sep of PRIORITY) {
    const count = lines.filter((l) => PATTERNS[sep].test(l)).length;
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

export function parsePaste(text: string): PasteResult {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  const separator = detectSeparator(lines);
  const cards: ParsedCard[] = [];
  const skipped: string[] = [];
  for (const line of lines) {
    // Split on the first separator only, so a definition may contain it too.
    const m = separator ? PATTERNS[separator].exec(line) : null;
    const front = m ? line.slice(0, m.index).trim() : '';
    const back = m ? line.slice(m.index + m[0].length).trim() : '';
    if (front && back) cards.push({ front, back });
    else skipped.push(line.trim());
  }
  return { separator, cards, skipped };
}
