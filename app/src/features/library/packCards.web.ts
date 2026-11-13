// Website: each pack's cards are a separate file that the browser downloads when the pack is
// added, so the site's first load doesn't carry every pack. Metro splits a file off at each
// import() (as with MathJax, features/math/importTex.web.ts). A phone has them all: packCards.ts.
// (Jest can't run these import()s; library.test.ts checks every pack has its line.)
import type { PackDeck } from './packs';

type PackFile = { default: { decks: readonly PackDeck[] } };

// By pack id, which is its file's name in ./packs.
const LOADERS: Record<string, () => Promise<PackFile>> = {
  capitals: () => import('./packs/capitals.json'),
  'english-basics': () => import('./packs/english-basics.json'),
  'english-basics-es': () => import('./packs/english-basics-es.json'),
  'english-basics-fr': () => import('./packs/english-basics-fr.json'),
  'english-basics-pt': () => import('./packs/english-basics-pt.json'),
  ielts: () => import('./packs/ielts.json'),
  sat: () => import('./packs/sat.json'),
  toeic: () => import('./packs/toeic.json'),
};

/** The pack's decks with their cards, downloaded the first time (fails offline). */
export function loadPackDecks(id: string): Promise<readonly PackDeck[]> {
  const load = LOADERS[id];
  if (!load) return Promise.reject(new Error(`No Library pack ${id}`));
  return load().then((file) => file.default.decks);
}
