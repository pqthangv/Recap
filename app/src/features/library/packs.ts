// The ready-made decks in the Library. Recap's own writing (word picks, definitions and examples),
// not copied from any book or list, and bundled with the app so they work offline. Capitals are
// plain facts (the 193 UN members), with a short note where a country has more than one.
import type { ImageSourcePropType } from 'react-native';

import flagUk from '@/assets/images/library/flag-uk.png';
import flagUs from '@/assets/images/library/flag-us.png';
import type { StringKey } from '@/lib/i18n';
import { deckColors } from '@/lib/theme';

import capitals from './packs/capitals.json';
import ielts from './packs/ielts.json';
import sat from './packs/sat.json';

export type PackCard = { front: string; back: string };

/** The round badge on the Library card: a flag (assets/images/library) or a Material icon. */
export type PackLogo = { image: ImageSourcePropType } | { icon: 'public' };

export type Pack = {
  id: string;
  /** Also the group name: its decks are called "<name> › <deck>". Not translated: the decks on
   *  the phone are found by this name, and the cards are in English anyway. */
  name: string;
  description: StringKey;
  color: string;
  logo: PackLogo;
  /** A few words shown on the Library card; the first deck's first fronts if not set. */
  examples?: readonly string[];
  decks: readonly { name: string; cards: readonly PackCard[] }[];
};

export const PACKS: readonly Pack[] = [
  {
    id: 'ielts',
    name: 'IELTS vocabulary',
    description: 'pack.ielts',
    color: deckColors[1],
    logo: { image: flagUk },
    decks: ielts.decks,
  },
  {
    id: 'sat',
    name: 'SAT vocabulary',
    description: 'pack.sat',
    color: deckColors[0],
    logo: { image: flagUs },
    decks: sat.decks,
  },
  {
    id: 'capitals',
    name: 'World capitals',
    description: 'pack.capitals',
    color: deckColors[2],
    logo: { icon: 'public' }, // a globe
    examples: ['Japan', 'Brazil', 'Kenya'],
    decks: capitals.decks,
  },
];
