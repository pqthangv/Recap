// The languages a card's sides can be in: picked in Create with AI and on a deck ("Read aloud
// in"), and used to choose the voice that reads each side. Named in their own language. The
// server takes the same codes for Create with AI (server/app/llm/languages.py; a test checks).

// Older apps read a code they don't know as Auto (backups and sync check it with isCardLanguage).
export const CARD_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'zh', name: '简体中文' },
  { code: 'zh-Hant', name: '繁體中文' },
  { code: 'yue', name: '粵語' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'th', name: 'ไทย' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'fil', name: 'Filipino' },
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
  'zh-Hant': 'zh-TW',
  yue: 'zh-HK',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-BR',
  ru: 'ru-RU',
  th: 'th-TH',
  hi: 'hi-IN',
  bn: 'bn-BD',
  id: 'id-ID',
  ms: 'ms-MY',
  fil: 'fil-PH',
};

/**
 * The tags a phone's or browser's voices for each language start with, when they differ from the
 * code. Voices are listed in different ways: Cantonese is "zh-HK" on iPhone and in browsers but
 * "yue-HK" on Android; older Android calls Indonesian "in" and some engines call Filipino "tl"
 * (Tagalog). Mandarin is "zh-CN", "zh-TW" or "cmn-…" (a Hong Kong voice speaks Cantonese). The two
 * Chinese ones that need a region (Taiwan, Hong Kong) only take voices from there.
 */
const VOICE_TAGS: Partial<Record<CardLanguage, readonly string[]>> = {
  zh: ['zh-CN', 'zh-SG', 'zh-TW', 'zh-Hans', 'cmn'],
  'zh-Hant': ['zh-TW', 'cmn-TW', 'zh-Hant-TW'],
  yue: ['yue', 'zh-HK', 'zh-MO', 'zh-Hant-HK'],
  id: ['id', 'in'],
  fil: ['fil', 'tl'],
};

const asTag = (language: string) => language.replace(/_/g, '-');

/** True when a voice for `voiceLanguage` ("zh-HK", "yue_HK", "en-US") can read `lang`. */
export function voiceReads(lang: CardLanguage, voiceLanguage: string): boolean {
  const tag = asTag(voiceLanguage).toLowerCase();
  return (VOICE_TAGS[lang] ?? [lang]).some((start) => {
    const s = start.toLowerCase();
    return tag === s || tag.startsWith(`${s}-`);
  });
}

// The region of a tag: "TW" in "zh-TW", "zh-Hant-TW" and "cmn_TW".
function regionOf(tag: string): string | undefined {
  return asTag(tag)
    .split('-')
    .slice(1)
    .find((part) => /^[a-z]{2}$/i.test(part))
    ?.toUpperCase();
}

/**
 * Android asks its speech engine for a language without the region ("zh" for "zh-HK"), so these
 * came out wrong on Google's voices (checked 2026-11-07): Taiwan's Mandarin and Hong Kong's
 * Cantonese as mainland Mandarin, Bangladesh's Bengali as India's. For them the voice itself is
 * named.
 */
const ANDROID_NAMED_VOICE: ReadonlySet<CardLanguage> = new Set(['zh-Hant', 'yue', 'bn']);

export type ListedVoice = { identifier: string; language: string };

/**
 * What to ask the speech engine for to read `lang`, given the voices this phone or browser lists:
 * the tag of one of its voices for that language, from the region in SPEECH_LOCALES if it has one
 * (Bangladesh's Bengali, else India's), and on Android the voice itself where the region matters.
 * Google lists a "<tag>-language" voice per region, its own default there, which comes first.
 * With no voice for the language (or no list), the usual tag: the phone reads it as best it can.
 */
export function speechRequest(
  lang: CardLanguage,
  voices: readonly ListedVoice[],
  android: boolean,
): { language: string; voice?: string } {
  const wanted = SPEECH_LOCALES[lang];
  const fitting = voices.filter((v) => voiceReads(lang, v.language));
  const region = regionOf(wanted);
  // The tag itself, then its region (not a dialect like Edge's "zh-CN-liaoning" first), then
  // the rest.
  const rank = (v: ListedVoice) => {
    const tag = asTag(v.language);
    const place = tag.toLowerCase() === wanted.toLowerCase() ? 0 : regionOf(tag) === region ? 1 : 2;
    return place * 2 + (v.identifier.endsWith('-language') ? 0 : 1);
  };
  const best = [...fitting].sort((a, b) => rank(a) - rank(b))[0];
  if (!best) return { language: wanted };
  const language = asTag(best.language);
  return android && ANDROID_NAMED_VOICE.has(lang)
    ? { language, voice: best.identifier }
    : { language };
}

// --- Auto: guessing a side's language from its text (decks without a language set). ---

// Alphabets only one of the languages uses. Han characters alone are taken as Chinese; Japanese
// almost always has kana too.
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const KANA = /[぀-ヿ]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const THAI = /[฀-๿]/;
const CYRILLIC = /[Ѐ-ӿ]/;
// Devanagari (Hindi; Marathi and Nepali too, read by the Hindi voice) and Bengali letters.
const DEVANAGARI = /[\u0900-\u097F\uA8E0-\uA8FF]/;
const BENGALI = /[\u0980-\u09FF]/;

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
 * Italian, Portuguese, Indonesian, Malay or Filipino looks English. Chinese is read as Mandarin
 * from mainland China (Traditional characters too, not Cantonese) — setting the deck's language
 * fixes those.
 */
export function detectLanguage(text: string): CardLanguage {
  const s = text.normalize('NFC');
  if (HANGUL.test(s)) return 'ko';
  if (KANA.test(s)) return 'ja';
  if (HAN.test(s)) return 'zh';
  if (THAI.test(s)) return 'th';
  if (CYRILLIC.test(s)) return 'ru';
  if (DEVANAGARI.test(s)) return 'hi';
  if (BENGALI.test(s)) return 'bn';
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
