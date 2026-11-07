// The languages Recap's own text comes in (not the cards' languages: those are in
// src/lib/language.ts). Adding one: its file next to en.ts (every key it has; a missing one shows
// in English), a line below, its loader in load.ts and load.web.ts, the expo-localization list in
// app.json and the iPhone permission prompts in languages/<code>.json.

export const APP_LANGUAGES = ['en', 'vi'] as const;
export type Language = (typeof APP_LANGUAGES)[number];
/** A language Recap's text is translated into (English is the original, always there). */
export type Translated = Exclude<Language, 'en'>;

export function isLanguage(value: unknown): value is Language {
  return APP_LANGUAGES.includes(value as Language);
}

/**
 * Which text a count takes: `<key>_one` ("1 card") or `<key>_other` ("5 cards"). Languages with
 * more forms (Russian's "2 карты" / "5 карт") will add theirs here and get those keys; until a key
 * has a form, `_other` is used.
 */
export type PluralForm = 'one' | 'other';

export type LanguageInfo = {
  /** Its own name, the same in every language, so people can find theirs. */
  name: string;
  /** BCP-47 tag, for the little the system formats itself (the time of day, dates). */
  locale: string;
  /** The form a count of n takes. From a table, not Intl: Hermes doesn't have it everywhere. */
  plural: (n: number) => PluralForm;
  /** Between thousands (7,936) and before decimals (2.5). */
  thousands: string;
  decimal: string;
};

/** "1 card", every other count plural: English (and Vietnamese, which has one form, both alike). */
const onlyOne = (n: number): PluralForm => (n === 1 ? 'one' : 'other');

export const LANGUAGE_INFO: Record<Language, LanguageInfo> = {
  en: { name: 'English', locale: 'en-US', plural: onlyOne, thousands: ',', decimal: '.' },
  vi: { name: 'Tiếng Việt', locale: 'vi-VN', plural: onlyOne, thousands: '.', decimal: ',' },
};
