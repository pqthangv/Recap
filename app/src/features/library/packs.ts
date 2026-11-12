// The ready-made decks in the Library. Recap's own writing (word picks, definitions and examples),
// not copied from any book or list, and bundled with the app so they work offline. Capitals are
// plain facts (the 193 UN members), with a short note where a country has more than one. Exam
// names (IELTS, SAT, TOEIC) only describe what the words are for; no exam logos. English basics
// is for Vietnamese speakers: the word and an English example on the front, the Vietnamese meaning
// (short enough to type) and the example in Vietnamese on the back, read in English and Vietnamese.
import type { ImageSourcePropType } from 'react-native';

import flagUk from '@/assets/images/library/flag-uk.png';
import flagUs from '@/assets/images/library/flag-us.png';
import type { Language, StringKey } from '@/lib/i18n';
import type { SideLanguages } from '@/lib/language';
import { deckColors } from '@/lib/theme';

import capitals from './packs/capitals.json';
import englishBasics from './packs/english-basics.json';
import ielts from './packs/ielts.json';
import sat from './packs/sat.json';
import toeic from './packs/toeic.json';

export type PackCard = { front: string; back: string };

/** The round badge on the Library card: a flag (assets/images/library) or a Material icon. */
export type PackLogo =
  { image: ImageSourcePropType } | { icon: 'public' | 'business-center' | 'translate' };

/** The Library's chips, in this order (after "All"). A chip shows only if a pack is in it. */
export const PACK_CATEGORIES = ['exams', 'languages', 'geography'] as const;
export type PackCategory = (typeof PACK_CATEGORIES)[number];

export const CATEGORY_NAMES: Record<PackCategory, StringKey> = {
  exams: 'library.exams',
  languages: 'library.languages',
  geography: 'library.geography',
};

export type Pack = {
  id: string;
  /** Also the group name: its decks are called "<name> › <deck>". Not translated: the decks on
   *  the phone are found by this name, and the cards are in English anyway. */
  name: string;
  description: StringKey;
  color: string;
  logo: PackLogo;
  category: PackCategory;
  /** Made for speakers of this app language (its meanings are in it): listed first when Recap is
   *  in that language, last otherwise. Not set: for everyone. */
  speakers?: Language;
  /** What each side is read aloud in, given to the decks when they're added (else Auto). */
  languages?: SideLanguages;
  decks: readonly { name: string; cards: readonly PackCard[] }[];
};

export const PACKS: readonly Pack[] = [
  {
    id: 'english-basics',
    name: 'English basics',
    description: 'pack.englishBasics',
    color: deckColors[5],
    logo: { icon: 'translate' },
    category: 'languages',
    speakers: 'vi',
    languages: { front: 'en', back: 'vi' },
    decks: englishBasics.decks,
  },
  {
    id: 'ielts',
    name: 'IELTS vocabulary',
    description: 'pack.ielts',
    color: deckColors[1],
    logo: { image: flagUk },
    category: 'exams',
    decks: ielts.decks,
  },
  {
    id: 'sat',
    name: 'SAT vocabulary',
    description: 'pack.sat',
    color: deckColors[0],
    logo: { image: flagUs },
    category: 'exams',
    decks: sat.decks,
  },
  {
    id: 'toeic',
    name: 'TOEIC vocabulary',
    description: 'pack.toeic',
    color: deckColors[3],
    logo: { icon: 'business-center' }, // a briefcase: workplace English
    category: 'exams',
    decks: toeic.decks,
  },
  {
    id: 'capitals',
    name: 'World capitals',
    description: 'pack.capitals',
    color: deckColors[2],
    logo: { icon: 'public' }, // a globe
    category: 'geography',
    decks: capitals.decks,
  },
];
