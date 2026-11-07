// Website: a newer language is a separate file that the browser downloads only when it's shown,
// so the site's first load doesn't grow with every language. Metro splits a file off at each
// import() in LOADERS (as with MathJax, features/math/importTex.web.ts). A phone has them all:
// load.ts.
//
// Vietnamese stays in the site's own file: its math words read Vietnamese cards aloud even when
// the app is in English (lib/math/speak.ts).
import type { Translated } from './languages';
import type { Translation } from './types';
import { vi } from './vi';

const BUNDLED: Partial<Record<Translated, Translation>> = { vi };

// One line per newer language, e.g. `hi: () => import('./hi').then((m) => m.hi)`. A test
// (i18n.test.ts) checks that every language is here or in BUNDLED.
const LOADERS: Partial<Record<Translated, () => Promise<Translation>>> = {};

const downloaded: Partial<Record<Translated, Translation>> = {};

/** The text in `lang` if it's in the site's own file or was downloaded already, else null. */
export function translationNow(lang: Translated): Translation | null {
  return BUNDLED[lang] ?? downloaded[lang] ?? null;
}

/** The text in `lang`, downloaded the first time. */
export function fetchTranslation(lang: Translated): Promise<Translation> {
  const now = translationNow(lang);
  if (now) return Promise.resolve(now);
  const load = LOADERS[lang];
  if (!load) return Promise.reject(new Error(`The website has no ${lang} text`));
  return load().then((text) => (downloaded[lang] = text));
}
