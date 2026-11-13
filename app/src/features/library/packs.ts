// The ready-made decks in the Library. Recap's own writing (word picks, definitions and examples),
// not copied from any book or list. A phone has their cards in the app, so they work offline; the
// website downloads a pack's cards when it's added (packCards.ts / packCards.web.ts). Here is what
// the Library shows: each pack, and its decks' names and sizes from packIndex.json, which
// scripts/pack-index.js writes from ./packs (library.test.ts checks it's up to date). Capitals are
// plain facts (the 193 UN members), with a short note where a country has more than one. Exam
// names (IELTS, SAT, TOEIC) only describe what the words are for; no exam logos. English basics
// is for speakers of another app language: the word and an English example on the front, the
// meaning in their language (short enough to type) and the example in it on the back, read in
// English and that language. Every one teaches the same 1,000 words as the Vietnamese pack; the
// others share their fronts, with the examples set in Vietnam rewritten for everyone.
import type { ImageSourcePropType } from 'react-native';

import flagUk from '@/assets/images/library/flag-uk.png';
import flagUs from '@/assets/images/library/flag-us.png';
import type { Language, StringKey } from '@/lib/i18n';
import type { Translated } from '@/lib/i18n/languages';
import type { CardLanguage, SideLanguages } from '@/lib/language';
import { deckColors } from '@/lib/theme';

import packIndex from './packIndex.json';

export type PackCard = { front: string; back: string };

/** A deck of a pack with its cards, as loadPackDecks gives it. */
export type PackDeck = { name: string; cards: readonly PackCard[] };

/** A deck of a pack as the Library lists it: its name and how many cards it has. */
export type PackDeckSize = { name: string; count: number };

const SIZES: Record<string, readonly PackDeckSize[]> = packIndex;
const decksOf = (id: string): readonly PackDeckSize[] => SIZES[id] ?? [];

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
  /** Also its cards' file in ./packs. */
  id: string;
  /** Also the group name: its decks are called "<name> › <deck>". Never translated or renamed
   *  after a release: the decks on the phone are found by this name. English basics for other
   *  languages is named in the learner's language ("Inglés básico"). */
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
  decks: readonly PackDeckSize[];
};

/** English basics for speakers of `speakers`, in the family's one color and icon. */
function englishBasicsFor(
  speakers: Translated & CardLanguage,
  name: string,
  description: StringKey,
): Pack {
  const id = `english-basics-${speakers}`;
  return {
    id,
    name,
    description,
    color: deckColors[5],
    logo: { icon: 'translate' },
    category: 'languages',
    speakers,
    languages: { front: 'en', back: speakers },
    decks: decksOf(id),
  };
}

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
    decks: decksOf('english-basics'),
  },
  englishBasicsFor('es', 'Inglés básico', 'pack.englishBasicsEs'),
  englishBasicsFor('pt', 'Inglês básico', 'pack.englishBasicsPt'),
  englishBasicsFor('fr', 'Anglais de base', 'pack.englishBasicsFr'),
  englishBasicsFor('hi', 'बुनियादी अंग्रेज़ी', 'pack.englishBasicsHi'),
  englishBasicsFor('bn', 'প্রাথমিক ইংরেজি', 'pack.englishBasicsBn'),
  {
    id: 'ielts',
    name: 'IELTS vocabulary',
    description: 'pack.ielts',
    color: deckColors[1],
    logo: { image: flagUk },
    category: 'exams',
    decks: decksOf('ielts'),
  },
  {
    id: 'sat',
    name: 'SAT vocabulary',
    description: 'pack.sat',
    color: deckColors[0],
    logo: { image: flagUs },
    category: 'exams',
    decks: decksOf('sat'),
  },
  {
    id: 'toeic',
    name: 'TOEIC vocabulary',
    description: 'pack.toeic',
    color: deckColors[3],
    logo: { icon: 'business-center' }, // a briefcase: workplace English
    category: 'exams',
    decks: decksOf('toeic'),
  },
  {
    id: 'capitals',
    name: 'World capitals',
    description: 'pack.capitals',
    color: deckColors[2],
    logo: { icon: 'public' }, // a globe
    category: 'geography',
    decks: decksOf('capitals'),
  },
];
