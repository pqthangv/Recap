// Recap's text in the app languages (languages.ts). By default it follows the phone (a language
// Recap doesn't have gets English); Settings › Language can pick one instead. Android 13+ and iOS
// also let people pick a language for Recap in the system settings, so the phone's language is
// read at start and again whenever the app comes back to the foreground. A line a translation
// doesn't have yet shows in English.
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { en } from './en';
import {
  APP_LANGUAGES,
  isLanguage,
  LANGUAGE_INFO,
  type Language,
  type Translated,
} from './languages';
import { fetchTranslation, translationNow } from './load';
import type { PluralKey, StringKey, Translation } from './types';

export type { PluralKey, StringKey } from './types';
export { APP_LANGUAGES, isLanguage, type Language } from './languages';

/** Settings › Language: a language, or 'auto' to follow the phone. */
export type LanguageChoice = Language | 'auto';

/** Each language's own name, the same in every language, so people can find theirs. */
export const LANGUAGE_NAMES = Object.fromEntries(
  APP_LANGUAGES.map((lang) => [lang, LANGUAGE_INFO[lang].name]),
) as Record<Language, string>;

/** The first of the phone's preferred languages that Recap speaks. */
export function phoneLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (isLanguage(code)) return code;
    }
  } catch (e) {
    console.warn('Could not read the phone language', e);
  }
  return 'en';
}

/** The text in `lang` that's ready now: English always; others once the app has them. */
function textIn(lang: Language): Translation | null {
  return lang === 'en' ? en : translationNow(lang as Translated);
}

let choice: LanguageChoice = 'auto';
// The language asked for, and the one shown: they differ while the website downloads one.
let wanted: Language = phoneLanguage();
let current: Language = textIn(wanted) ? wanted : 'en';
const listeners = new Set<() => void>();

export function language(): Language {
  return current;
}

/** For the system's own formatting (a time, a date), with digits 0–9 like every other number. */
export function localeTag(): string {
  // Bengali (bn-BD) would write ০–৯ otherwise; the others already use 0–9.
  return `${LANGUAGE_INFO[current].locale}-u-nu-latn`;
}

function show(next: Language): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Switches to `next`; resolves once it's shown. On the website a newer language downloads first,
 * and if that fails (offline) the text stays as it was.
 */
export function setLanguage(next: Language): Promise<void> {
  wanted = next;
  if (textIn(next)) {
    show(next);
    return Promise.resolve();
  }
  return fetchTranslation(next as Translated).then(
    () => {
      if (wanted === next) show(next); // unless another language was picked meanwhile
    },
    (e: unknown) => console.warn(`Could not load the ${next} text`, e),
  );
}

/** Applies Settings › Language (read from the database at start, and when it's changed). */
export function setLanguageChoice(next: LanguageChoice): Promise<void> {
  choice = next;
  return refreshLanguage();
}

/** Picks up a language change made in the phone's settings while Recap was in the background. */
export function refreshLanguage(): Promise<void> {
  return setLanguage(choice === 'auto' ? phoneLanguage() : choice);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current language. The root layout remounts each screen's content with it as the key. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, language);
}

/** "1234567" → "1,234,567", or "12,34,567" where the language groups as India does. */
export function groupDigits(digits: string, mark: string, lakh = false): string {
  const threes = (text: string) => text.replace(/\B(?=(\d{3})+(?!\d))/g, mark);
  const m = /^(-?)(\d+)$/.exec(digits);
  if (!lakh || !m || m[2]!.length <= 3) return threes(digits);
  const [, sign, all] = m as unknown as [string, string, string];
  const head = all.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, mark);
  return `${sign}${head}${mark}${all.slice(-3)}`;
}

/** 7936 → "7,936" in English, "7.936" in Vietnamese. */
export function count(n: number): string {
  const { thousands, lakh } = LANGUAGE_INFO[current];
  return groupDigits(String(n), thousands, lakh);
}

/** 2.5 → "2.5" in English, "2,5" in Vietnamese; `digits` after the mark. */
export function decimal(n: number, digits: number): string {
  const { thousands, decimal: mark, lakh } = LANGUAGE_INFO[current];
  const [whole = '', part] = n.toFixed(digits).split('.');
  const grouped = groupDigits(whole, thousands, lakh);
  return part === undefined ? grouped : `${grouped}${mark}${part}`;
}

type Params = Record<string, string | number>;

/** The text for `key` in the current language, with {placeholders} filled in (numbers via count). */
export function t(key: StringKey, params?: Params): string {
  return tIn(current, key, params);
}

/** Like t(), in `lang` instead of the app's language: math is read aloud in the card side's own
 * language (an English deck in the Vietnamese app still says "x squared"). */
export function tIn(lang: Language, key: StringKey, params?: Params): string {
  const text = textIn(lang)?.[key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? count(value) : value;
  });
}

/**
 * "1 card" / "5 cards": the key's text for the form n takes in this language, {n} filled in. A
 * form no text has (a newer language's extra one) takes the `_other` line.
 */
export function tn(key: PluralKey, n: number, params?: Params): string {
  const form = `${key}_${LANGUAGE_INFO[current].plural(n)}` as StringKey;
  const known = textIn(current)?.[form] !== undefined || form in en;
  return t(known ? form : (`${key}_other` as StringKey), { ...params, n });
}
