// Recap's text in English or Vietnamese. By default it follows the phone (any other language gets
// English); Settings › Language can pick one instead. Android 13+ and iOS also let people pick a
// language for Recap in the system settings, so the phone's language is read at start and again
// whenever the app comes back to the foreground.
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { en } from './en';
import type { PluralKey, StringKey, Strings } from './types';
import { vi } from './vi';

export type { PluralKey, StringKey } from './types';

export type Language = 'en' | 'vi';

/** Settings › Language: a language, or 'auto' to follow the phone. */
export type LanguageChoice = Language | 'auto';

/** Each language's own name, the same in every language, so people can find theirs. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', vi: 'Tiếng Việt' };

const STRINGS: Record<Language, Strings> = { en, vi };

/** BCP-47 tags, for the little the system formats itself (the time of day). */
const LOCALE_TAGS: Record<Language, string> = { en: 'en-US', vi: 'vi-VN' };

/** The first of the phone's preferred languages that Recap speaks. */
export function phoneLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (code === 'en' || code === 'vi') return code;
    }
  } catch (e) {
    console.warn('Could not read the phone language', e);
  }
  return 'en';
}

let choice: LanguageChoice = 'auto';
let current: Language = phoneLanguage();
const listeners = new Set<() => void>();

export function language(): Language {
  return current;
}

export function localeTag(): string {
  return LOCALE_TAGS[current];
}

export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/** Applies Settings › Language (read from the database at start, and when it's changed). */
export function setLanguageChoice(next: LanguageChoice): void {
  choice = next;
  refreshLanguage();
}

/** Picks up a language change made in the phone's settings while Recap was in the background. */
export function refreshLanguage(): void {
  setLanguage(choice === 'auto' ? phoneLanguage() : choice);
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

/** 7936 → "7,936" in English, "7.936" in Vietnamese. */
export function count(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, current === 'vi' ? '.' : ',');
}

type Params = Record<string, string | number>;

/** The text for `key` in the current language, with {placeholders} filled in (numbers via count). */
export function t(key: StringKey, params?: Params): string {
  const text = STRINGS[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? count(value) : value;
  });
}

/** "1 card" / "5 cards": the key's _one or _other text, with {n} filled in. */
export function tn(key: PluralKey, n: number, params?: Params): string {
  return t(`${key}_${n === 1 ? 'one' : 'other'}` as StringKey, { ...params, n });
}
