// Words a typed answer may add or leave out, and the note labels after which a card lists more
// right answers, for answerCheck.ts. Per card language (src/lib/language.ts); a language that
// isn't here gets none of it. Reviewed 2026-11-12 (an AI second opinion, not a native speaker).
import type { CardLanguage } from './language';

export type OptionalWords = {
  /** Words that may come first: an article, or a Vietnamese classifier ("quả táo" for "táo"). */
  words: readonly string[];
  /** Elided articles written before a vowel with an apostrophe ("l’école"). */
  elided?: readonly string[];
  /**
   * Phrases the first word belongs to, so it isn't taken off: "a few" isn't "few", "un peu"
   * isn't "peu", "trái cây" (fruit) isn't "cây" (a tree).
   */
  phrases?: Readonly<Record<string, readonly string[]>>;
  /**
   * The card has one and the typed answer leaves it out ("libro" for "el libro") or has another
   * ("la libro"): almost, as the article shows if a word is masculine or feminine (and "lot"
   * isn't "a lot"). Not set: no help.
   */
  leftOutIsAlmost?: boolean;
  /** Words that may be left out and it's still right: "give up" for "to give up". */
  leftOutIsRight?: readonly string[];
  /** Not counted in the answer's length, so "se brosser les dents" is short enough to type. */
  uncounted?: readonly string[];
};

const EN_ARTICLES = ['the', 'a', 'an'];
const ES_ARTICLES = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'];
const PT_ARTICLES = ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas'];
const FR_ARTICLES = ['le', 'la', 'les', 'un', 'une', 'des', 'du'];
const IT_ARTICLES = ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una'];
const DE_ARTICLES = [
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einen',
  'einem',
  'einer',
  'eines',
];

// "a few" is some, "few" is hardly any; "una vez" is once.
const EN_PHRASES = { a: ['few', 'little', 'lot', 'bit'] };
const ES_PHRASES = { un: ['poco'], una: ['vez'] };
const PT_PHRASES = { um: ['pouco'], uma: ['vez'] };

export const OPTIONAL_WORDS: Partial<Record<CardLanguage, OptionalWords>> = {
  en: {
    words: [...EN_ARTICLES, 'to'],
    phrases: EN_PHRASES,
    leftOutIsAlmost: true,
    leftOutIsRight: ['to'],
  },
  es: {
    words: ES_ARTICLES,
    phrases: ES_PHRASES,
    leftOutIsAlmost: true,
    uncounted: [...ES_ARTICLES, 'se'],
  },
  pt: {
    words: PT_ARTICLES,
    phrases: PT_PHRASES,
    leftOutIsAlmost: true,
    uncounted: [...PT_ARTICLES, 'se'],
  },
  fr: {
    words: FR_ARTICLES,
    elided: ['l'],
    phrases: { un: ['peu'] },
    leftOutIsAlmost: true,
    uncounted: [...FR_ARTICLES, 'se'],
  },
  it: {
    words: IT_ARTICLES,
    elided: ['l', 'un'],
    phrases: { un: ['poco'], una: ['volta'] },
    leftOutIsAlmost: true,
    uncounted: IT_ARTICLES,
  },
  de: { words: DE_ARTICLES, leftOutIsAlmost: true, uncounted: DE_ARTICLES },
  // Classifiers, and "sự" that makes a noun ("sự giúp đỡ"). Not tòa, bông, hạt, việc, cuộc,
  // niềm or nỗi: they make other words too ("tòa nhà" is a building, "bông tai" an earring).
  // Left out is only almost: "trai" isn't "con trai" (a son).
  vi: {
    words: [
      'cái',
      'con',
      'chiếc',
      'quả',
      'trái',
      'cây',
      'cuốn',
      'quyển',
      'tờ',
      'tấm',
      'bức',
      'đôi',
      'ngôi',
      'căn',
      'viên',
      'miếng',
      'sợi',
      'củ',
      'cơn',
      'sự',
    ],
    phrases: {
      trái: ['cây', 'đất'], // fruit, the Earth
      cây: ['xăng', 'táo', 'số'], // a petrol station, an apple tree, a kilometre
      đôi: ['khi', 'lúc'], // sometimes
    },
    leftOutIsAlmost: true,
  },
};

/**
 * For a deck without a language: English, Spanish, Portuguese and French articles, and the safe
 * Italian and German ones (not "die" or "i", which are other words too). Leaving one out gets no
 * help, as the language isn't known.
 */
export const ANY_ARTICLE: OptionalWords = {
  words: [
    ...new Set([...EN_ARTICLES, ...ES_ARTICLES, ...PT_ARTICLES, ...FR_ARTICLES]),
    'il',
    'der',
    'das',
    'ein',
    'eine',
  ],
  elided: ['l'],
  phrases: { ...EN_PHRASES, ...ES_PHRASES, ...PT_PHRASES, un: ['poco', 'peu'] },
};

/**
 * Note labels (lower case, the part before ":") after which a card lists more right answers,
 * comma-separated: "Cũng nói: dạ, có", "En España: zumo", "Au Québec : chum". The Library's packs
 * use them (library.test.ts checks every label there is here or deliberately not), and anyone
 * may. Only labels for the same meaning: not "Cũng có nghĩa" / "También significa" (another
 * meaning), "Với người" (another use) or "Tiếng Anh Mỹ" (English), as the card's example shows
 * which meaning it asks for ("cũ" isn't "old" in "My grandfather is old").
 */
export const ALSO_LABELS: readonly string[] = [
  'also',
  // Vietnamese
  'cũng nói',
  'cũng dùng cho',
  'miền nam',
  'miền bắc',
  'miền bắc cũng nói',
  'trong câu hỏi thường nói',
  'đầy đủ',
  'bánh sinh nhật',
  'ở đại học',
  'môn ở trường',
  // Spanish
  'también',
  'en españa',
  // Portuguese
  'também',
  'em portugal',
  // French
  'aussi',
  'au québec',
];
