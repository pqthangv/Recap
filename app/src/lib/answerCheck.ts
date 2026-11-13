// "Type the answer": which cards are short enough to type, how close a typed answer is, and the
// grade Recap suggests for it. You still pick the grade; the suggestion is highlighted.
import { ALSO_LABELS, ANY_ARTICLE, OPTIONAL_WORDS, type OptionalWords } from './answerWords';
import { detectLanguage, type CardLanguage } from './language';
import { hasMath } from './math/parse';
import { sideToText } from './math/plainText';
import { Rating, type Grade } from './scheduler';

/**
 * - correct: the same, ignoring letter case, spaces and punctuation. Also right: an answer the
 *   card's note gives ("Cũng nói: dạ, có"), an added article or classifier ("la familia" for
 *   "familia", "quả táo" for "táo"), "se tornar" for "tornar-se", and spellings that are both
 *   right (see normalize and spellings)
 * - accents: right letters, wrong or missing accents ("ma" for "má" — a different word in
 *   Vietnamese, so not correct)
 * - typo: one or two letters off, or the card's article left out or another one ("libro" or
 *   "la libro" for "el libro")
 * - wrong: anything else
 * - skipped: nothing typed (Show answer)
 */
export type AnswerResult = 'correct' | 'accents' | 'typo' | 'wrong' | 'skipped';

// Characters by code point: combining marks sit on the letter before them, so they're invisible
// in an editor.
const fromCode = (code: number) => String.fromCharCode(code);
const span = (from: number, to: number) => `${fromCode(from)}-${fromCode(to)}`;

// A capital, a word and its meaning, a short term: a few words, not an explanation. Checked on
// the Library: every capital fits, no IELTS or SAT definition does ("causing harm or damage" is
// four words). Vietnamese puts a space between syllables, so it gets more ("Thành phố Hồ Chí Minh").
// Articles and "se" don't count in Spanish, Portuguese, French, Italian and German
// ("se brosser les dents" is two words); English counts them, or "to give someone a job" fits.
const MAX_WORDS = 3;
const MAX_VIETNAMESE_WORDS = 5;
const MAX_CHARS = 40;
// Chinese and Japanese don't put spaces between words, so count characters there instead.
const MAX_CJK_CHARS = 10;
const CJK = new RegExp(
  `[${span(0x3040, 0x30ff)}${span(0x3400, 0x4dbf)}${span(0x4e00, 0x9fff)}${span(0xf900, 0xfaff)}]`,
);

/** Started typing within this long after the question appeared (or was read aloud): Easy. */
export const QUICK_START_MS = 3000;

/**
 * The part of a card's back that's checked: the first paragraph without notes in brackets, e.g.
 * "Porto-Novo" from "Porto-Novo\n\nCotonou is the seat of government." and "sự giáng thủy" from
 * "sự giáng thủy (mưa, tuyết)".
 */
export function expectedAnswer(back: string): string {
  // As shown on the card: "\$5" is "$5".
  const first =
    sideToText(back)
      .trim()
      .split(/\n[ \t]*\n/)[0] ?? '';
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
  // Typing a formula on a phone keyboard isn't recalling it: math answers are tapped.
  if (hasMath(back)) return false;
  const answer = expectedAnswer(back);
  if (!normalize(answer) || answer.includes('\n') || answer.length > MAX_CHARS) return false;
  if (CJK.test(answer) && !answer.includes(' ')) return [...answer].length <= MAX_CJK_CHARS;
  const lang = language ?? detectLanguage(answer);
  const uncounted = new Set(OPTIONAL_WORDS[lang]?.uncounted);
  const words = answer.split(' ').filter((word) => !uncounted.has(word.toLowerCase())).length;
  return words <= (lang === 'vi' ? MAX_VIETNAMESE_WORDS : MAX_WORDS);
}

// Hindi: the dot under क ख ग ज फ (loan sounds, often left out: "जरूर" for "ज़रूर"), ं for ँ
// ("हां" for "हाँ"), ं for a nasal with ् before a consonant ("हिंदी" for "हिन्दी"), and ई / ए for
// यी / ये after a letter ("नई" for "नयी", "गए" for "गये").
const NUQTA = fromCode(0x093c);
const VIRAMA = fromCode(0x094d);
const ANUSVARA = fromCode(0x0902);
const HI_VOWEL_SIGNS = span(0x093e, 0x094c);
const HI_LOAN_DOT = new RegExp(`([कखगजफ])${NUQTA}`, 'g');
const HI_CHANDRABINDU = new RegExp(fromCode(0x0901), 'g');
const HI_NASAL = new RegExp(`[ङञणनम]${VIRAMA}(?=[क-ह])`, 'g');
const HI_YI = new RegExp(`([क-ह${HI_VOWEL_SIGNS}])य${fromCode(0x0940)}`, 'g');
const HI_YE = new RegExp(`([क-ह${HI_VOWEL_SIGNS}])य${fromCode(0x0947)}`, 'g');
// Bengali: ং for ঙ at the end of a word or before a consonant ("রং" for "রঙ").
const BN_NGA = new RegExp(`ঙ(?:${fromCode(0x09cd)}(?=[ক-হ])|(?![${span(0x0980, 0x09ff)}]))`, 'g');

// Vietnamese: the tone on either vowel of "oa", "oe", "uy" ending a syllable ("khỏe" = "khoẻ",
// "thủy" = "thuỷ"), and i for a y with a tone after a consonant ("kỳ" = "kì", "Mỹ" = "Mĩ"). Not
// "ly" and "li", which are other words.
const TONED: Record<string, string> = {
  o: 'òóỏõọ',
  u: 'ùúủũụ',
  a: 'àáảãạ',
  e: 'èéẻẽẹ',
  y: 'ỳýỷỹỵ',
  i: 'ìíỉĩị',
};
const END = `(?![a-z${span(0x00e0, 0x024f)}${span(0x1e00, 0x1eff)}])`;
const VI_OA = new RegExp(`([${TONED.o}])([ae])${END}`, 'g');
const VI_UY = new RegExp(`([${TONED.u}])y${END}`, 'g');
const VI_Y = new RegExp(`([bcdđghklmnpqrstvx])([${TONED.y}])${END}`, 'g');
const moveTone = (from: string, toneOn: string, to: string) =>
  TONED[to][TONED[from].indexOf(toneOn)];

// Lower case, the same Unicode form for accents typed either way, punctuation as spaces
// (apostrophes and full stops dropped: "don't" = "dont", "D.C." = "DC"), single spaces. Spellings
// that are both right come out the same: œ/æ as "oe"/"ae" (French "oeuf" for "œuf"), ß as "ss",
// and the Hindi, Bengali and Vietnamese ones above.
function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(HI_LOAN_DOT, '$1')
    .replace(HI_CHANDRABINDU, ANUSVARA)
    .replace(HI_NASAL, ANUSVARA)
    .replace(HI_YI, '$1ई')
    .replace(HI_YE, '$1ए')
    .replace(BN_NGA, fromCode(0x0982))
    .replace(VI_OA, (_, o: string, vowel: string) => `o${moveTone('o', o, vowel)}`)
    .replace(VI_UY, (_, u: string) => `u${moveTone('u', u, 'y')}`)
    .replace(VI_Y, (_, consonant: string, y: string) => `${consonant}${moveTone('y', y, 'i')}`)
    .replace(/['’‘`.]/g, '')
    .replace(/[,!?:;¿¡"“”«»。、，！？：；…\-–—()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Hà Nội" → "ha noi". Explicit ranges, not \p{M}, like language.ts. Also almost: the dot left
// off Hindi ड़ ढ़ (other letters, unlike क़ ज़), and Bengali without its nukta or chandrabindu
// ("বড" for "বড়"): those make another letter or sound.
const ACCENTS = new RegExp(`[${span(0x0300, 0x036f)}]`, 'g');
const OTHER_LETTER_MARKS = new RegExp(`[${NUQTA}${fromCode(0x09bc)}${fromCode(0x0981)}]`, 'g');
function withoutAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(ACCENTS, '')
    .replace(OTHER_LETTER_MARKS, '')
    .replace(/đ/g, 'd')
    .normalize('NFC');
}

/**
 * Other ways to write the same normalized answer in this language: German "fuer" for "für",
 * Portuguese "ténis" (Portugal) for "tênis" (Brazil).
 */
function spellings(text: string, language: CardLanguage | null | undefined): string[] {
  if (language === 'de') {
    return [text, text.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')];
  }
  if (language === 'pt') return [text, text.replace(/ê(?=[mn])/g, 'é').replace(/ô(?=[mn])/g, 'ó')];
  return [text];
}

/** "la familia" → "familia", "l’école" → "école"; the same text when it has no such first word. */
function withoutFirstWord(text: string, optional: OptionalWords): string {
  const trimmed = text.trim();
  const elided = optional.elided?.find((word) =>
    new RegExp(`^${word}['’‘]\\s*\\S`, 'iu').test(trimmed),
  );
  if (elided) return trimmed.slice(elided.length + 1).trim();
  const [first, second] = trimmed.toLowerCase().split(/\s+/);
  if (second === undefined || !optional.words.includes(first)) return trimmed;
  if (optional.phrases?.[first]?.includes(second)) return trimmed; // "a few" isn't "few"
  return trimmed.slice(trimmed.search(/\s/)).trim();
}

// In one Unicode form: Bengali "এছাড়াও" can be typed with ড় as one character or two.
const ALSO = new Set(ALSO_LABELS.map((label) => label.normalize('NFC')));

/**
 * The right answers the card's notes give: the items after an "also" label, e.g. "dạ" and "có"
 * from "vâng\n\nVâng, tôi hiểu.\n\nCũng nói: dạ, có" (answerWords.ts has the labels).
 */
export function noteAnswers(back: string): string[] {
  const paragraphs = sideToText(back)
    .trim()
    .split(/\n[ \t]*\n/)
    .slice(1);
  const answers: string[] = [];
  for (const paragraph of paragraphs) {
    // A note may have two: "Với kính, đồng hồ: đeo. Với mũ: đội" (or with a "।").
    for (const sentence of paragraph.split(/\.\s+|।\s*/)) {
      // French puts a no-break space before the colon ("Au Québec : chum"); \s takes it.
      const note = /^([^:\n]{1,40}?)\s*:\s*(.+)$/u.exec(sentence.trim());
      if (!note) continue;
      const label = note[1].replace(/\s+/g, ' ').trim().toLowerCase().normalize('NFC');
      if (!ALSO.has(label)) continue;
      for (const item of note[2].split(/[,;/]/)) {
        // "em… tùy người nghe" → "em", "chúng ta (gồm cả người nghe)" → "chúng ta"
        const answer = item
          .split(/…|\.\.\./)[0]
          .replace(/\([^)]*\)/g, ' ')
          .replace(/\.$/, '')
          .trim();
        if (answer) answers.push(answer);
      }
    }
  }
  return answers;
}

/** "tornar-se" and "se tornar" are the same verb in Portuguese. */
function bothOrders(option: string): string[] {
  const after = /^(\S+)-se$/u.exec(option.trim());
  if (after) return [option, `se ${after[1]}`];
  const before = /^se (\S+)$/u.exec(option.trim());
  return before ? [option, `${before[1]}-se`] : [option];
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

/**
 * How close `typed` is to the card's answer. "dog; hound" or "dog / hound" accept either, and so
 * does a note "Also: hound". `language`: the back's language when the deck sets one; without it,
 * any article may be added but leaving one out gets no help.
 */
export function checkAnswer(
  typed: string,
  back: string,
  language?: CardLanguage | null,
): AnswerResult {
  const given = normalize(typed);
  if (!given) return 'skipped';
  const optional = (language ? OPTIONAL_WORDS[language] : ANY_ARTICLE) ?? { words: [] };
  const variants = (texts: string[]) =>
    [...new Set(texts.flatMap((text) => spellings(text, language)))].filter(Boolean);
  const raw = [...expectedAnswer(back).split(/[;/]/), ...noteAnswers(back)]
    .flatMap(bothOrders)
    .filter((option) => normalize(option));
  const options = variants(raw.map(normalize));
  // As typed, and without an article or classifier the typed answer added.
  const forms = variants([given, normalize(withoutFirstWord(typed, optional))]);
  if (forms.some((form) => options.includes(form))) return 'correct';
  // The card's first word left out: right for some ("to"), almost for articles.
  const leftOut = raw
    .filter((option) => withoutFirstWord(option, optional) !== option.trim())
    .map((option) => ({
      word: option.trim().split(/\s+/)[0].toLowerCase(),
      rest: variants([normalize(withoutFirstWord(option, optional))]),
    }))
    .filter(({ rest }) => rest.some((option) => forms.includes(option)));
  if (leftOut.some(({ word }) => optional.leftOutIsRight?.includes(word))) return 'correct';
  const plainForms = forms.map(withoutAccents);
  const plainOptions = options.map(withoutAccents);
  if (plainForms.some((form) => plainOptions.includes(form))) return 'accents';
  if (optional.leftOutIsAlmost && leftOut.length > 0) return 'typo';
  const close = plainOptions.some((option) =>
    plainForms.some((form) => editDistance(form, option) <= allowedTypos([...option].length)),
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
