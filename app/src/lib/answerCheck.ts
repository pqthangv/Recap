// "Type the answer": which cards are short enough to type, how close a typed answer is, and the
// grade Recap suggests for it. You still pick the grade; the suggestion is highlighted.
import { detectLanguage, type CardLanguage } from './language';
import { Rating, type Grade } from './scheduler';

/**
 * - correct: the same, ignoring letter case, spaces and punctuation
 * - accents: right letters, wrong or missing accents ("ma" for "má" — a different word in
 *   Vietnamese, so not correct)
 * - typo: one or two letters off
 * - wrong: anything else
 * - skipped: nothing typed (Show answer)
 */
export type AnswerResult = 'correct' | 'accents' | 'typo' | 'wrong' | 'skipped';

// A capital, a word and its meaning, a short term: a few words, not an explanation. Checked on
// the Library: every capital fits, no IELTS or SAT definition does ("causing harm or damage" is
// four words). Vietnamese puts a space between syllables, so it gets more ("Thành phố Hồ Chí Minh").
const MAX_WORDS = 3;
const MAX_VIETNAMESE_WORDS = 5;
const MAX_CHARS = 40;
// Chinese and Japanese don't put spaces between words, so count characters there instead.
const MAX_CJK_CHARS = 10;
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

/** Started typing within this long after the question appeared (or was read aloud): Easy. */
export const QUICK_START_MS = 3000;

/**
 * The part of a card's back that's checked: the first paragraph without notes in brackets, e.g.
 * "Porto-Novo" from "Porto-Novo\n\nCotonou is the seat of government." and "sự giáng thủy" from
 * "sự giáng thủy (mưa, tuyết)".
 */
export function expectedAnswer(back: string): string {
  const first = back.trim().split(/\n[ \t]*\n/)[0] ?? '';
  return first
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * True when the card's answer is short enough to type and check letter by letter. `language`:
 * the back's language when the deck sets one (otherwise guessed).
 */
export function isTypeable(back: string, language?: CardLanguage | null): boolean {
  const answer = expectedAnswer(back);
  if (!normalize(answer) || answer.includes('\n') || answer.length > MAX_CHARS) return false;
  if (CJK.test(answer) && !answer.includes(' ')) return [...answer].length <= MAX_CJK_CHARS;
  const words = answer.split(' ').length;
  const vietnamese = (language ?? detectLanguage(answer)) === 'vi';
  return words <= (vietnamese ? MAX_VIETNAMESE_WORDS : MAX_WORDS);
}

// Lower case, the same Unicode form for accents typed either way, punctuation as spaces
// (apostrophes and full stops dropped: "don't" = "dont", "D.C." = "DC"), single spaces.
function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’‘`.]/g, '')
    .replace(/[,!?:;¿¡"“”«»。、，！？：；…\-–—()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Hà Nội" → "ha noi". Explicit ranges, not \p{M}, like language.ts.
function withoutAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').normalize('NFC');
}

// Letters that may differ for "typo": none in very short answers, more in long ones.
const allowedTypos = (letters: number) => (letters >= 9 ? 2 : letters >= 4 ? 1 : 0);

/** Edits (insert, delete, change, swap two neighbours) to turn `a` into `b`. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const d = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[x.length][y.length];
}

/** How close `typed` is to the card's answer. "dog; hound" or "dog / hound" accept either. */
export function checkAnswer(typed: string, back: string): AnswerResult {
  const given = normalize(typed);
  if (!given) return 'skipped';
  const options = expectedAnswer(back).split(/[;/]/).map(normalize).filter(Boolean);
  if (options.includes(given)) return 'correct';
  const plain = withoutAccents(given);
  const plainOptions = options.map(withoutAccents);
  if (plainOptions.includes(plain)) return 'accents';
  const close = plainOptions.some(
    (option) => editDistance(plain, option) <= allowedTypos([...option].length),
  );
  return close ? 'typo' : 'wrong';
}

/** The grade Recap highlights: right and quick → Easy, right → Good, almost → Hard, else Again. */
export function suggestGrade(result: AnswerResult, quick: boolean): Grade {
  if (result === 'correct') return quick ? Rating.Easy : Rating.Good;
  if (result === 'accents' || result === 'typo') return Rating.Hard;
  return Rating.Again;
}

export type MarkedText = { text: string; ok: boolean }[];

/**
 * The typed answer split into parts that match the right answer (ok) and parts that don't, for
 * marking mistakes. Compares letters ignoring case; accents count.
 */
export function markTyped(typed: string, back: string): MarkedText {
  const x = [...typed.trim()];
  const y = [...expectedAnswer(back)];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  // Longest common subsequence table, then walk it to see which typed letters are in the answer.
  const l = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      l[i][j] = same(x[i], y[j]) ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1]);
    }
  }
  const parts: MarkedText = [];
  const push = (char: string, ok: boolean) => {
    const last = parts.at(-1);
    if (last && last.ok === ok) last.text += char;
    else parts.push({ text: char, ok });
  };
  let i = 0;
  let j = 0;
  while (i < x.length) {
    if (j < y.length && same(x[i], y[j])) {
      push(x[i], true);
      i++;
      j++;
    } else if (j < y.length && l[i][j + 1] >= l[i + 1][j]) {
      j++;
    } else {
      push(x[i], false);
      i++;
    }
  }
  return parts;
}
