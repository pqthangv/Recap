// The languages a card's sides can be in: picked in Create with AI and on a deck ("Read aloud
// in"), and used to choose the voice that reads each side. Named in their own language. The
// server takes the same codes for Create with AI (server/app/llm/languages.py; a test checks).

export const CARD_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'zh', name: '简体中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'th', name: 'ไทย' },
] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number]['code'];

export function isCardLanguage(value: unknown): value is CardLanguage {
  return CARD_LANGUAGES.some((language) => language.code === value);
}

/** The language's own name ("Deutsch"), or null for Auto. */
export function cardLanguageName(code: CardLanguage | null): string | null {
  return CARD_LANGUAGES.find((language) => language.code === code)?.name ?? null;
}

/** BCP-47 tag for the text-to-speech engine. */
export const SPEECH_LOCALES: Record<CardLanguage, string> = {
  en: 'en-US',
  vi: 'vi-VN',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-BR',
  ru: 'ru-RU',
  th: 'th-TH',
};

// --- Auto: guessing a side's language from its text (decks without a language set). ---

// Alphabets only one of the languages uses. Han characters alone are taken as Chinese; Japanese
// almost always has kana too.
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const KANA = /[぀-ヿ]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const THAI = /[฀-๿]/;
const CYRILLIC = /[Ѐ-ӿ]/;

// Letters only Vietnamese uses: đ ă ơ ư ĩ ũ and the "Latin Extended Additional" block
// (ạ ả ấ ầ ẩ ẫ ậ … ỹ), plus the combining hook above / horn / dot below for decomposed text.
const VIETNAMESE_ONLY = /[đĐăĂơƠưƯĩĨũŨẠ-ỵ̛̃̉]/;

// Letters of one Latin-script language that Vietnamese and English don't use.
const GERMAN_ONLY = /[äöüßÄÖÜẞ]/;
const SPANISH_ONLY = /[ñÑ¿¡]/;
const FRENCH_ONLY = /[çÇœŒ]/;

// Accented letters Vietnamese shares with French/Spanish/etc. (cá, tôi, bà, là …).
const VIETNAMESE_SHARED = /[àáâãèéêìíòóôõùúýÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ̀́̂̃]/;

// Vietnamese has no f, j, w or z, so these mark an English loanword like "café".
const NOT_VIETNAMESE = /[fjwzFJWZ]/;

/**
 * A best guess from the text alone. Reliable for English, Vietnamese and the languages with their
 * own alphabet or letters; French or Spanish with only é/à-type accents still looks Vietnamese, and
 * Italian or Portuguese looks English — setting the deck's language fixes those.
 */
export function detectLanguage(text: string): CardLanguage {
  const s = text.normalize('NFC');
  if (HANGUL.test(s)) return 'ko';
  if (KANA.test(s)) return 'ja';
  if (HAN.test(s)) return 'zh';
  if (THAI.test(s)) return 'th';
  if (CYRILLIC.test(s)) return 'ru';
  if (VIETNAMESE_ONLY.test(s)) return 'vi';
  if (GERMAN_ONLY.test(s)) return 'de';
  if (SPANISH_ONLY.test(s)) return 'es';
  if (FRENCH_ONLY.test(s)) return 'fr';
  if (VIETNAMESE_SHARED.test(s) && !NOT_VIETNAMESE.test(s)) return 'vi';
  return 'en';
}

export type SideLanguages = { front: CardLanguage | null; back: CardLanguage | null };

/**
 * The languages a card's sides are read in, from its deck's settings (null = Auto). A reverse
 * card shows the original's back on its front, so the two swap.
 */
export function cardSideLanguages(
  deck: { front_lang: string | null; back_lang: string | null } | undefined,
  isReverse: boolean,
): SideLanguages {
  const stored = (value: string | null | undefined) => (isCardLanguage(value) ? value : null);
  const front = stored(deck?.front_lang);
  const back = stored(deck?.back_lang);
  return isReverse ? { front: back, back: front } : { front, back };
}
