import { clearTestDb, migrateTestDb, rawQuery } from '../../../test/db';

import { deleteDeck, listDecks } from '@/db/decks';
import { getDueQueue } from '@/db/study';
import { isTypeable } from '@/lib/answerCheck';
import { hasMath } from '@/lib/math/parse';

import {
  addPack,
  isPackAdded,
  libraryCategories,
  libraryPacks,
  packCardCount,
  packDeckNames,
} from './library';
import { PACK_CATEGORIES, PACKS, type Pack } from './packs';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../../test/db').createTestClient());

const NOW = new Date(2026, 9, 12, 12, 0, 0).getTime();

const PACK: Pack = {
  id: 'test',
  name: 'Test words',
  description: 'pack.sat',
  color: '#1A73E8',
  logo: { icon: 'public' },
  category: 'exams',
  decks: [
    {
      name: 'Set 1',
      cards: [
        { front: 'one', back: '(noun) the first\n\nOne is a number.' },
        { front: 'two', back: '(noun) the second\n\nTwo comes after one.' },
      ],
    },
    { name: 'Set 2', cards: [{ front: 'three', back: '(noun) the third\n\nThree is odd.' }] },
  ],
};

beforeAll(() => migrateTestDb());
beforeEach(() => clearTestDb());

describe('adding a Library pack', () => {
  it('adds its decks as one group, in its color, with cards in order', () => {
    expect(isPackAdded(PACK, listDecks())).toBe(false);
    const summary = addPack(PACK, NOW);
    expect(summary.added).toBe(3);
    expect(listDecks().map((d) => [d.name, d.color])).toEqual([
      ['Test words › Set 1', '#1A73E8'],
      ['Test words › Set 2', '#1A73E8'],
    ]);
    expect(isPackAdded(PACK, listDecks())).toBe(true);
    // Saved in the pack's order (studying mixes them, like every deck).
    const set1 = listDecks()[0].id;
    expect(getDueQueue(set1, NOW)).toHaveLength(2);
    const saved = rawQuery('select front from cards where deck_id = ? order by created_at', set1);
    expect(saved.map((r) => r.front)).toEqual(['one', 'two']);
  });

  it('adding again brings back only what is missing', () => {
    addPack(PACK, NOW);
    expect(addPack(PACK, NOW + 1).added).toBe(0);
    deleteDeck(listDecks()[1].id, NOW);
    expect(isPackAdded(PACK, listDecks())).toBe(false);
    expect(addPack(PACK, NOW + 2).added).toBe(1);
    expect(rawQuery('select count(*) as n from cards where deleted_at is null')[0].n).toBe(3);
  });

  it("gives the new decks the pack's languages, to be read aloud in", () => {
    addPack({ ...PACK, languages: { front: 'en', back: 'vi' } }, NOW);
    expect(listDecks().map((d) => [d.front_lang, d.back_lang])).toEqual([
      ['en', 'vi'],
      ['en', 'vi'],
    ]);
  });

  it('names and counts', () => {
    expect(packDeckNames(PACK)).toEqual(['Test words › Set 1', 'Test words › Set 2']);
    expect(packCardCount(PACK)).toBe(3);
  });
});

describe('the Library list', () => {
  const pack = (id: string, category: Pack['category'], speakers?: Pack['speakers']): Pack => ({
    ...PACK,
    id,
    category,
    speakers,
  });
  const SHELF = [
    pack('basics-vi', 'languages', 'vi'),
    pack('ielts', 'exams'),
    pack('basics-es', 'languages', 'es'),
    pack('capitals', 'geography'),
    pack('sat', 'exams'),
  ];
  const ids = (packs: readonly Pack[]) => packs.map((p) => p.id);

  it("lists packs for the app's language first and other languages' last", () => {
    expect(ids(libraryPacks(SHELF, 'all', 'vi'))).toEqual([
      'basics-vi',
      'ielts',
      'capitals',
      'sat',
      'basics-es',
    ]);
    expect(ids(libraryPacks(SHELF, 'all', 'es'))).toEqual([
      'basics-es',
      'ielts',
      'capitals',
      'sat',
      'basics-vi',
    ]);
    // No pack for English speakers: the packs for everyone lead, in their own order.
    expect(ids(libraryPacks(SHELF, 'all', 'en'))).toEqual([
      'ielts',
      'capitals',
      'sat',
      'basics-vi',
      'basics-es',
    ]);
  });

  it('shows one category per chip, in the same order', () => {
    expect(ids(libraryPacks(SHELF, 'exams', 'en'))).toEqual(['ielts', 'sat']);
    expect(ids(libraryPacks(SHELF, 'languages', 'es'))).toEqual(['basics-es', 'basics-vi']);
  });

  it('has a chip only for categories with a pack', () => {
    expect(libraryCategories(SHELF)).toEqual(['exams', 'languages', 'geography']);
    expect(libraryCategories([pack('capitals', 'geography')])).toEqual(['geography']);
  });

  it('puts every bundled pack in a chip', () => {
    expect(libraryCategories(PACKS)).toEqual([...PACK_CATEGORIES]);
    const shown = PACK_CATEGORIES.flatMap((c) => ids(libraryPacks(PACKS, c, 'en')));
    expect(shown.sort()).toEqual(ids(PACKS).sort());
  });

  it('starts with English basics in Vietnamese, with the exams in English', () => {
    expect(libraryPacks(PACKS, 'all', 'vi')[0].id).toBe('english-basics');
    expect(libraryPacks(PACKS, 'all', 'en')[0].id).toBe('ielts');
  });
});

describe('the bundled packs', () => {
  // Vocabulary: "(part of speech) definition", a blank line, an example. Capitals: the city,
  // sometimes followed by a blank line and a one-sentence note.
  const VOCAB = /^\((noun|verb|adjective|adverb|phrase)\) [^\n]+\n\n[^\n]+\.$/;
  // The meaning (no brackets: it's typed), the example in that language, maybe a note.
  const BASICS = /^[^\n()]+\n\n[^\n]+(\n\n[^\n]+)?$/;
  const FORMAT: Record<string, RegExp> = {
    ielts: VOCAB,
    sat: VOCAB,
    toeic: VOCAB,
    capitals: /^[^\n]+(\n\n[^\n]+\.)?$/,
    'english-basics': BASICS,
    'english-basics-es': BASICS,
    'english-basics-pt': BASICS,
    'english-basics-fr': BASICS,
  };

  it('every pack has a format check', () => {
    expect(PACKS.map((p) => p.id).sort()).toEqual(Object.keys(FORMAT).sort());
  });

  it('TOEIC vocabulary has 10 topics of 40 words', () => {
    const toeic = PACKS.find((p) => p.id === 'toeic')!;
    expect(toeic.decks.map((d) => d.cards.length)).toEqual(new Array(10).fill(40));
  });

  it('gives TOEIC its own words, none already in IELTS or SAT', () => {
    // IELTS and SAT share some academic words on purpose; TOEIC is workplace English.
    const words = (id: string) =>
      PACKS.find((p) => p.id === id)!.decks.flatMap((d) =>
        d.cards.map((c) => c.front.toLowerCase()),
      );
    const academic = new Set([...words('ielts'), ...words('sat')]);
    expect(words('toeic').filter((word) => academic.has(word))).toEqual([]);
  });

  const basics = PACKS.filter((p) => p.id.startsWith('english-basics'));
  const vietnamese = PACKS.find((p) => p.id === 'english-basics')!;
  const words = (pack: Pack) => pack.decks.map((d) => d.cards.map((c) => c.front.split('\n')[0]));

  it('has English basics for Vietnamese, Spanish, Portuguese and French speakers', () => {
    expect(basics.map((p) => p.speakers)).toEqual(['vi', 'es', 'pt', 'fr']);
    expect(new Set(basics.map((p) => p.name)).size).toBe(basics.length);
  });

  it('teaches the same words in every English basics, topic by topic', () => {
    for (const pack of basics) expect(words(pack)).toEqual(words(vietnamese));
  });

  it('shares one English side in the other languages, with nothing set in Vietnam', () => {
    const others = basics.filter((p) => p !== vietnamese);
    const fronts = (pack: Pack) => pack.decks.flatMap((d) => d.cards.map((c) => c.front));
    for (const pack of others) expect(fronts(pack)).toEqual(fronts(others[0]));
    const vietnam =
      /Viet|Ha ?noi|Hà Nội|Hue\b|Huế|Da Nang|Da Lat|Hoi An|Ho Chi Minh|Phu Quoc|Ha Long|Fansipan|Phong Nha|\bpho\b|\bdong\b|\bTet\b|\bLan\b/;
    const sides = others.flatMap((p) =>
      p.decks.flatMap((d) => d.cards.flatMap((c) => [c.front, c.back])),
    );
    expect(sides.filter((side) => vietnam.test(side))).toEqual([]);
  });

  describe.each(basics.map((p) => [p.name, p] as const))('%s', (_name, pack) => {
    const cards = pack.decks.flatMap((d) => d.cards);

    it('has 20 topics of 50 words, read in English and its language', () => {
      expect(pack.decks.map((d) => d.cards.length)).toEqual(new Array(20).fill(50));
      expect(pack.languages).toEqual({ front: 'en', back: pack.speakers });
      expect(pack.category).toBe('languages');
    });

    it('numbers its topics, so they list in learning order', () => {
      const names = pack.decks.map((d) => d.name);
      names.forEach((name, i) =>
        expect(name).toMatch(new RegExp(`^${String(i + 1).padStart(2, '0')} \\S`)),
      );
      expect([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))).toEqual(
        names,
      );
    });

    it('shows the word and an English example on the front', () => {
      for (const card of cards) expect(card.front).toMatch(/^[^\n]+\n\n[^\n]+[.!?]$/);
    });

    it('has each word once', () => {
      const words = cards.map((c) => c.front.split('\n')[0].toLowerCase());
      expect(new Set(words).size).toBe(words.length);
    });

    it('has meanings short enough to type, so every card gets the typed check', () => {
      const typeable = (back: string) => isTypeable(back, pack.languages!.back);
      expect(cards.filter((c) => !typeable(c.back)).map((c) => c.back)).toEqual([]);
    });
  });

  it('World capitals has all 193 UN members', () => {
    const capitals = PACKS.find((p) => p.id === 'capitals')!;
    expect(packCardCount(capitals)).toBe(193);
    for (const deck of capitals.decks) {
      for (const card of deck.cards) expect(card.front).toMatch(/^Capital of \S/);
    }
  });

  it.each(PACKS.map((p) => [p.name, p] as const))('%s is well formed', (_name, pack) => {
    expect(pack.decks.length).toBeGreaterThan(0);
    const fronts = pack.decks.flatMap((d) => d.cards.map((c) => c.front.toLowerCase()));
    expect(new Set(fronts).size).toBe(fronts.length); // no word twice in a pack
    expect(new Set(pack.decks.map((d) => d.name)).size).toBe(pack.decks.length);
    for (const deck of pack.decks) {
      expect(deck.cards.length).toBeGreaterThan(0);
      for (const card of deck.cards) {
        expect(card.front.trim()).toBe(card.front);
        expect(card.front.length).toBeGreaterThan(0);
        expect(card.back).toMatch(FORMAT[pack.id]);
      }
    }
  });
});

describe('math on ready-made cards', () => {
  // Prices like "$500" in the TOEIC pack must stay text (the dollar rule in lib/math/parse.ts).
  it('finds none in the Library', () => {
    const sides = PACKS.flatMap((p) =>
      p.decks.flatMap((d) => d.cards.flatMap((c) => [c.front, c.back])),
    );
    expect(sides.filter((side) => side.includes('$')).length).toBeGreaterThan(0);
    expect(sides.filter(hasMath)).toEqual([]);
  });
});
