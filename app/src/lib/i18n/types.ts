import type { en } from './en';

export type StringKey = keyof typeof en;

/** A full set of Recap's text in one language: every key in en.ts, no more, no less. */
export type Strings = Record<StringKey, string>;

/** Keys with a "1 card" / "2 cards" pair (`<key>_one`, `<key>_other`), for tn(). */
export type PluralKey = StringKey extends infer K
  ? K extends `${infer Base}_one`
    ? Base
    : never
  : never;
