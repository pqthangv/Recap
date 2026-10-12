import { clearTestDb, migrateTestDb, rawQuery } from '../../test/db';

import { createCard, deleteCards, getCardForEdit, updateCard } from './cards';
import { createDeck, deleteDeck, listDecks } from './decks';
import { importCards } from './import';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../test/db').createTestClient());

const NOW = new Date(2026, 9, 11, 12).getTime();

beforeAll(() => migrateTestDb());
beforeEach(() => clearTestDb());

const item = (front: string, back: string, extra = {}) => ({ front, back, tags: [], ...extra });

describe('importCards', () => {
  it('adds new cards to a new deck, in order, ready to study', () => {
    const summary = importCards(
      [item('a', '1'), item('b', '2')],
      { kind: 'new', name: 'Words' },
      NOW,
    );
    expect(summary).toMatchObject({ added: 2, skipped: 0 });
    expect(listDecks().map((d) => d.name)).toEqual(['Words']);
    expect(rawQuery('SELECT front, state, reps FROM cards ORDER BY created_at')).toEqual([
      { front: 'a', state: 0, reps: 0 },
      { front: 'b', state: 0, reps: 0 },
    ]);
  });

  it('reuses a deck with the same name and skips exact duplicates', () => {
    const deck = createDeck({ name: 'Spanish', color: '#000' }, NOW);
    createCard({ deckId: deck.id, front: 'hola', back: 'hello', tags: [], reverse: false }, NOW);
    const summary = importCards(
      [item('hola', 'hello'), item('adiós', 'bye'), item('adiós', 'bye'), item('', 'x')],
      { kind: 'new', name: '  spanish ' },
      NOW,
    );
    expect(summary).toEqual({
      added: 1,
      skipped: 3,
      decks: [{ id: deck.id, name: 'Spanish', added: 1 }],
      imageUris: [],
    });
    expect(listDecks()).toHaveLength(1);
  });

  it('puts cards into the decks named in the file', () => {
    const summary = importCards(
      [
        item('a', '1', { deckName: 'Geography' }),
        item('b', '2', { deckName: 'History' }),
        item('c', '3'),
      ],
      { kind: 'fromFile', fallbackName: 'My file' },
      NOW,
    );
    expect(summary.added).toBe(3);
    expect(listDecks().map((d) => d.name)).toEqual(['Geography', 'History', 'My file']);
  });

  it('adds to an existing deck chosen by id', () => {
    const deck = createDeck({ name: 'Target', color: '#000' }, NOW);
    importCards([item('q', 'a')], { kind: 'existing', deckId: deck.id }, NOW);
    expect(rawQuery('SELECT deck_id FROM cards')).toEqual([{ deck_id: deck.id }]);
  });

  it('keeps pictures, and a reverse card shows the picture on the other side', () => {
    importCards(
      [item('Which country?', 'Japan', { imageUri: 'file:///media/flag.png', imageSide: 'front' })],
      { kind: 'new', name: 'Flags' },
      NOW,
    );
    const [card] = rawQuery('SELECT id, image_uri, image_side, deck_id FROM cards') as {
      id: string;
      image_uri: string;
      image_side: string;
      deck_id: string;
    }[];
    expect(card).toMatchObject({ image_uri: 'file:///media/flag.png', image_side: 'front' });

    updateCard(card.id, {
      deckId: card.deck_id,
      front: 'Which country?',
      back: 'Japan',
      tags: [],
      reverse: true,
    });
    expect(getCardForEdit(card.id)?.hasReverse).toBe(true);
    expect(
      rawQuery('SELECT image_uri, image_side FROM cards WHERE reverse_of = ?', card.id),
    ).toEqual([{ image_uri: 'file:///media/flag.png', image_side: 'back' }]);
  });
});

describe('importCards: duplicates', () => {
  const count = () => (rawQuery('SELECT count(*) AS n FROM cards')[0] as { n: number }).n;

  it('adds nothing when the same file is imported again', () => {
    const file = [item('a', '1', { deckName: 'X' }), item('b', '2', { deckName: 'Y' })];
    importCards(file, { kind: 'fromFile', fallbackName: 'File' }, NOW);
    const again = importCards(file, { kind: 'fromFile', fallbackName: 'File' }, NOW + 1000);
    expect(again).toEqual({ added: 0, skipped: 2, decks: [], imageUris: [] });
    expect(count()).toBe(2);
    expect(listDecks()).toHaveLength(2);
  });

  it('ignores spaces around the text, but not case or other differences', () => {
    const deck = createDeck({ name: 'Spanish', color: '#000' }, NOW);
    createCard({ deckId: deck.id, front: 'hola', back: 'hello', tags: [], reverse: false }, NOW);
    const summary = importCards(
      [item('  hola ', 'hello\n'), item('Hola', 'hello'), item('hola', 'hello!')],
      { kind: 'existing', deckId: deck.id },
      NOW,
    );
    expect(summary).toMatchObject({ added: 2, skipped: 1 });
  });

  it('treats a card already in another deck as new', () => {
    const a = createDeck({ name: 'A', color: '#000' }, NOW);
    const b = createDeck({ name: 'B', color: '#000' }, NOW);
    createCard({ deckId: a.id, front: 'q', back: 'a', tags: [], reverse: false }, NOW);
    expect(importCards([item('q', 'a')], { kind: 'existing', deckId: b.id }, NOW).added).toBe(1);
  });

  it('matches a reverse card already in the deck', () => {
    const deck = createDeck({ name: 'Words', color: '#000' }, NOW);
    createCard({ deckId: deck.id, front: 'cat', back: 'con mèo', tags: [], reverse: true }, NOW);
    const summary = importCards(
      [item('con mèo', 'cat')],
      { kind: 'existing', deckId: deck.id },
      NOW,
    );
    expect(summary).toMatchObject({ added: 0, skipped: 1 });
  });

  it('adds deleted cards back instead of treating them as duplicates', () => {
    const deck = createDeck({ name: 'Words', color: '#000' }, NOW);
    const card = createCard(
      { deckId: deck.id, front: 'q', back: 'a', tags: [], reverse: false },
      NOW,
    );
    deleteCards([card.id], NOW + 1);
    expect(
      importCards([item('q', 'a')], { kind: 'existing', deckId: deck.id }, NOW + 2).added,
    ).toBe(1);
  });

  it('makes a new deck rather than filling a deleted one with the same name', () => {
    const old = createDeck({ name: 'Biology', color: '#000' }, NOW);
    deleteDeck(old.id, NOW + 1);
    const summary = importCards([item('q', 'a')], { kind: 'new', name: 'Biology' }, NOW + 2);
    expect(summary.decks[0].id).not.toBe(old.id);
    expect(listDecks().map((d) => d.name)).toEqual(['Biology']);
  });

  it('matches deck names from the file ignoring case and spaces', () => {
    const summary = importCards(
      [
        item('a', '1', { deckName: 'Geography' }),
        item('b', '2', { deckName: ' geography ' }),
        item('c', '3', { deckName: '' }),
      ],
      { kind: 'fromFile', fallbackName: 'My file' },
      NOW,
    );
    expect(summary.added).toBe(3);
    expect(listDecks().map((d) => d.name)).toEqual(['Geography', 'My file']);
  });

  it('keeps same-text cards with different pictures, but not the same picture twice', () => {
    const bird = (uri: string) => item('Which bird?', 'Robin', { imageUri: uri });
    const summary = importCards(
      [bird('file:///robin1.jpg'), bird('file:///robin2.jpg'), bird('file:///robin1.jpg')],
      { kind: 'new', name: 'Birds' },
      NOW,
    );
    expect(summary).toMatchObject({ added: 2, skipped: 1 });
    expect(summary.imageUris).toEqual(['file:///robin1.jpg', 'file:///robin2.jpg']);
  });

  it('skips picture cards imported again, so their newly copied pictures can be deleted', () => {
    const flag = (uri: string) =>
      item('Which country?', 'Japan', { imageUri: uri, imageSide: 'front' });
    importCards([flag('file:///first-copy.png')], { kind: 'new', name: 'Flags' }, NOW);
    const again = importCards(
      [flag('file:///second-copy.png')],
      { kind: 'new', name: 'Flags' },
      NOW,
    );
    expect(again).toMatchObject({ added: 0, skipped: 1, imageUris: [] });
    expect(rawQuery('SELECT image_uri FROM cards')).toEqual([
      { image_uri: 'file:///first-copy.png' },
    ]);
  });
});
