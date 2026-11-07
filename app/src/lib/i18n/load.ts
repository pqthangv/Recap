// Phone: every language's text is in the app, ready at once. (The website downloads the newer
// ones only when they're shown: load.web.ts.) English is always there, in index.ts.
import type { Translated } from './languages';
import type { Translation } from './types';
import { vi } from './vi';

const BUNDLED: Record<Translated, Translation> = { vi };

/** The text in `lang` if the app has it already (always, on a phone), else null. */
export function translationNow(lang: Translated): Translation | null {
  return BUNDLED[lang];
}

/** The text in `lang`, downloading it first where that's needed (the website). */
export function fetchTranslation(lang: Translated): Promise<Translation> {
  return Promise.resolve(BUNDLED[lang]);
}
