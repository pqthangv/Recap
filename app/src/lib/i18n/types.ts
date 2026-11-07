import type { en } from './en';

export type StringKey = keyof typeof en;

/** A full set of Recap's text in one language: every key in en.ts, no more, no less. */
export type Strings = Record<StringKey, string>;

/**
 * Recap's text in a newer language: only en.ts's keys, but some may be missing; those show in
 * English, so one late line doesn't hold up a release. Vietnamese stays complete (`Strings`).
 */
export type Translation = Partial<Strings>;

/** Keys with a "1 card" / "2 cards" pair (`<key>_one`, `<key>_other`), for tn(). */
export type PluralKey = StringKey extends infer K
  ? K extends `${infer Base}_one`
    ? Base
    : never
  : never;
