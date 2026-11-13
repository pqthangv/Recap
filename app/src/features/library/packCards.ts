// The cards of the Library's packs. A phone has them all in the app, so adding one works offline.
// The website downloads a pack's cards only when it's added (packCards.web.ts), so its first load
// doesn't carry every pack.
import type { PackDeck } from './packs';
import capitals from './packs/capitals.json';
import englishBasicsBn from './packs/english-basics-bn.json';
import englishBasicsEs from './packs/english-basics-es.json';
import englishBasicsFr from './packs/english-basics-fr.json';
import englishBasicsHi from './packs/english-basics-hi.json';
import englishBasicsPt from './packs/english-basics-pt.json';
import englishBasics from './packs/english-basics.json';
import ielts from './packs/ielts.json';
import sat from './packs/sat.json';
import toeic from './packs/toeic.json';

// By pack id, which is its file's name in ./packs.
const FILES: Record<string, { decks: readonly PackDeck[] }> = {
  capitals,
  'english-basics': englishBasics,
  'english-basics-bn': englishBasicsBn,
  'english-basics-es': englishBasicsEs,
  'english-basics-fr': englishBasicsFr,
  'english-basics-hi': englishBasicsHi,
  'english-basics-pt': englishBasicsPt,
  ielts,
  sat,
  toeic,
};

/** The pack's decks with their cards. */
export function loadPackDecks(id: string): Promise<readonly PackDeck[]> {
  const file = FILES[id];
  return file ? Promise.resolve(file.decks) : Promise.reject(new Error(`No Library pack ${id}`));
}
