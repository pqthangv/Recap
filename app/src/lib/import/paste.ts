// "Paste a list": one card per line, `term - definition`, `term<TAB>definition` or
// `term;definition`. The separator is detected from the text.
import { t } from '../i18n';
import { findFormulas } from '../math/parse';

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

/** How the import screen names each separator ("split by dash ( - )"). */
export function separatorLabel(separator: Separator): string {
  return t(`paste.${separator}`);
}

/** The line with its formulas blanked out (same length), so the " - " in "$a - b$" or a ";"
 * inside a formula isn't taken for the separator. */
function outsideMath(line: string): string {
  let out = line;
  for (const f of findFormulas(line)) {
    out = out.slice(0, f.start) + '_'.repeat(f.end - f.start) + out.slice(f.end);
  }
  return out;
}

export function detectSeparator(lines: readonly string[]): Separator | null {
  let best: Separator | null = null;
  let bestCount = 0;
  for (const sep of PRIORITY) {
    const count = lines.filter((l) => PATTERNS[sep].test(outsideMath(l))).length;
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
    const m = separator ? PATTERNS[separator].exec(outsideMath(line)) : null;
    const front = m ? line.slice(0, m.index).trim() : '';
    const back = m ? line.slice(m.index + m[0].length).trim() : '';
    if (front && back) cards.push({ front, back });
    else skipped.push(line.trim());
  }
  return { separator, cards, skipped };
}
