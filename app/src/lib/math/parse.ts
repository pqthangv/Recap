// Finding the formulas in a card side. Cards stay plain text; math is written between
// `$…$` (in a sentence) or `$$…$$` (on its own line), and Anki's `\(…\)` / `\[…\]` count too, so
// cards imported before Recap knew math show it without being rewritten.
//
// `$` follows Pandoc's rule, so prices stay text: the opening `$` is followed by something other
// than a space, the closing `$` comes right after something other than a space and isn't followed
// by a digit. "$5 to $10" and "$5-$10" have no math; `\$` is always a dollar sign.

export type MathPart = { tex: string; display: boolean };
export type TextPart = { text: string };
export type Part = TextPart | MathPart;

export const isMath = (part: Part): part is MathPart => 'tex' in part;

const BLANK_LINE = /\n[ \t]*\n/;
const SPACE = /\s/;
const DIGIT = /[0-9]/;

/** The closing `$` of an inline formula opened just before `start`, or -1. */
function inlineEnd(s: string, start: number): number {
  if (start >= s.length || SPACE.test(s[start])) return -1;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (c === '\n') return -1;
    if (c === '\\') {
      j++; // \$ inside a formula is TeX's dollar sign
    } else if (c === '$') {
      // A `$` that can't close ("$5 and $x$": the one before x) ends the search, so the scan
      // starts again from it and finds $x$, instead of reading "5 and $x" as a formula.
      return !SPACE.test(s[j - 1]) && !DIGIT.test(s[j + 1] ?? '') ? j : -1;
    }
  }
  return -1;
}

/** Where `close` ends a formula that starts at `start`, or -1 (not across a blank line). */
function blockEnd(s: string, start: number, close: string): number {
  for (let j = start; j < s.length; j++) {
    if (s.startsWith(close, j)) {
      const tex = s.slice(start, j);
      return tex.trim() && !BLANK_LINE.test(tex) ? j : -1;
    }
    if (s[j] === '\\' && close !== '\\)' && close !== '\\]') j++;
  }
  return -1;
}

/** Splits a card side into text and formulas, in order. */
export function splitMath(text: string): Part[] {
  const parts: Part[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) parts.push({ text: buffer });
    buffer = '';
  };
  const formula = (tex: string, display: boolean) => {
    flush();
    parts.push({ tex: tex.trim(), display });
  };

  for (let i = 0; i < text.length;) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '\\' && next === '$') {
      buffer += '$';
      i += 2;
    } else if (c === '\\' && (next === '(' || next === '[')) {
      const close = next === '(' ? '\\)' : '\\]';
      const end = blockEnd(text, i + 2, close);
      if (end < 0) {
        buffer += c + next;
        i += 2;
      } else {
        formula(text.slice(i + 2, end), next === '[');
        i = end + 2;
      }
    } else if (c === '$' && next === '$') {
      const end = blockEnd(text, i + 2, '$$');
      if (end < 0) {
        buffer += '$$';
        i += 2;
      } else {
        formula(text.slice(i + 2, end), true);
        i = end + 2;
      }
    } else if (c === '$') {
      const end = inlineEnd(text, i + 1);
      if (end < 0) {
        buffer += '$';
        i += 1;
      } else {
        formula(text.slice(i + 1, end), false);
        i = end + 1;
      }
    } else {
      buffer += c;
      i += 1;
    }
  }
  flush();
  return aloneOnLine(parts);
}

/** A formula with nothing else on its line is drawn on its own (centered, larger). */
function aloneOnLine(parts: Part[]): Part[] {
  return parts.map((part, i) => {
    if (!isMath(part) || part.display) return part;
    const before = parts[i - 1];
    const after = parts[i + 1];
    const startsLine = !before || (!isMath(before) && /(^|\n)[ \t]*$/.test(before.text));
    const endsLine = !after || (!isMath(after) && /^[ \t]*(\n|$)/.test(after.text));
    return startsLine && endsLine ? { ...part, display: true } : part;
  });
}

/** True when the text has at least one formula. */
export function hasMath(text: string): boolean {
  return text.includes('$') || text.includes('\\(') || text.includes('\\[')
    ? splitMath(text).some(isMath)
    : false;
}
