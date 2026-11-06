// Sync on the real database (roadmap 6.7, part 4): three installs take turns on the test database
// (cleared in between, like a fresh install), syncing through an in-memory store.
import { clearTestDb, migrateTestDb, rawQuery } from '../../test/db';
import { MemoryStore } from '../../test/syncStore';

import { seedIfNeeded } from '@/features/onboarding/seed';
import { Rating, review, type Grade } from '@/lib/scheduler';
import { SETTING_KEYS, SYNC_LAST_KEY, SYNC_OWNER_KEY, TUTORIAL_DECK_KEY } from '@/lib/settings';
import { rowCount } from '@/lib/sync/files';
import { sync } from '@/lib/sync/round';

import { createCard, deleteCards, getCard, updateCard } from './cards';
import { createDeck, listDecks } from './decks';
import { getRawSetting, getSettings, setRawSetting, setSetting } from './settings';
import { answerCard } from './study';
import {
  changedAfter,
  changedRows,
  databaseDevice,
  dropUnusedTutorial,
  hasUnsentChanges,
  loadSyncOwner,
  removeSharedRows,
  saveSyncOwner,
  sharedCardCount,
} from './sync';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../test/db').createTestClient());

const NOW = Date.UTC(2026, 10, 4, 12);
let clock = NOW;
const tick = () => (clock += 60_000);

class Store extends MemoryStore {
  constructor() {
    super(() => clock);
  }
}

const syncWith = (store: Store) => sync(store, databaseDevice, () => clock);

function answer(cardId: string, rating: Grade = Rating.Good) {
  tick();
  const result = review(getCard(cardId)!, rating, clock, getSettings().retention);
  return answerCard(cardId, result, 2000, clock);
}

const rows = () => ({
  decks: rawQuery('SELECT id, name, deleted_at FROM decks ORDER BY id'),
  cards: rawQuery('SELECT id, front, due, reps, deleted_at FROM cards ORDER BY id'),
  logs: rawQuery('SELECT id, card_id, deleted_at FROM review_logs ORDER BY id'),
});

beforeAll(() => migrateTestDb());
beforeEach(() => {
  clearTestDb();
  clock = NOW;
});

describe('sync on the database', () => {
  it('brings a new install up to date, and its changes reach the next one', async () => {
    const store = new Store();

    // Phone A: the welcome deck, a deck of its own, an answer.
    seedIfNeeded(clock);
    const tutorial = getRawSetting(TUTORIAL_DECK_KEY) as string;
    const words = createDeck({ name: 'Words', color: '#5A31D6' }, tick());
    const cat = createCard(
      { deckId: words.id, front: 'cat', back: 'con mèo', tags: [], reverse: false },
      tick(),
    );
    const dog = createCard(
      { deckId: words.id, front: 'dog', back: 'con chó', tags: [], reverse: false },
      tick(),
    );
    answer(cat.id);
    tick();
    expect(await syncWith(store)).toMatchObject({ read: 0, sent: 1 });

    // The tutorial and this device's own settings stay here.
    const sent = store.sent();
    expect(sent.decks.map((d) => d.name)).toEqual(['Words']);
    expect(sent.cards.map((c) => c.front).sort()).toEqual(['cat', 'dog']);
    expect(sent.cards.some((c) => c.deck_id === tutorial)).toBe(false);
    expect(sent.review_logs).toHaveLength(1);
    expect(sent.settings.map((s) => s.key)).not.toContain('sync_state');
    expect(sent.settings.map((s) => s.key)).not.toContain(TUTORIAL_DECK_KEY);
    const onA = rows();
    expect(hasUnsentChanges()).toBe(false);

    // Phone B: a fresh install with its own tutorial, signing in to the account.
    clearTestDb();
    tick();
    seedIfNeeded(clock);
    expect(databaseDevice.loadState()).toBeNull();
    expect((await syncWith(store)).read).toBeGreaterThan(0);
    expect(dropUnusedTutorial()).toBe(true);
    const tutorialOnA = new Set(
      (onA.cards as { id: string }[])
        .filter((c) => !sent.cards.some((s) => s.id === c.id))
        .map((c) => c.id),
    );
    expect(rows()).toEqual({
      decks: onA.decks.filter((d) => d.id !== tutorial),
      cards: onA.cards.filter((c) => !tutorialOnA.has(c.id as string)),
      logs: onA.logs,
    });
    expect(listDecks().map((d) => d.name)).toEqual(['Words']);

    // B edits a card, deletes one, studies, and changes a setting.
    updateCard(
      cat.id,
      { deckId: words.id, front: 'cat (animal)', back: 'con mèo', tags: [], reverse: false },
      tick(),
    );
    deleteCards([dog.id], tick());
    answer(cat.id, Rating.Hard);
    setSetting('retention', 0.9, tick());
    expect(hasUnsentChanges()).toBe(true);
    tick();
    await syncWith(store);

    // Phone C, another fresh install, gets all of it.
    clearTestDb();
    tick();
    await syncWith(store);
    expect(getCard(cat.id)?.front).toBe('cat (animal)');
    expect(
      rawQuery('SELECT deleted_at FROM cards WHERE id = ?', dog.id)[0]!.deleted_at,
    ).not.toBeNull();
    expect(rawQuery('SELECT COUNT(*) AS n FROM review_logs')[0]!.n).toBe(2);
    expect(getCard(cat.id)?.reps).toBe(2);
    expect(getSettings().retention).toBe(0.9);
  });

  it('keeps a tutorial that was studied, and one on an account with nothing yet', async () => {
    seedIfNeeded(clock);
    const tutorial = getRawSetting(TUTORIAL_DECK_KEY) as string;
    const first = rawQuery('SELECT id FROM cards WHERE deck_id = ? LIMIT 1', tutorial)[0]!
      .id as string;
    answer(first);
    expect(dropUnusedTutorial()).toBe(false);
    expect(listDecks()).toHaveLength(1);

    // A brand-new account: its first sync reads nothing, so the engine leaves the tutorial.
    clearTestDb();
    seedIfNeeded(clock);
    expect((await syncWith(new Store())).read).toBe(0);
    expect(listDecks()).toHaveLength(1);
  });

  it("sends only what changed, never this device's own settings", async () => {
    const store = new Store();
    const deck = createDeck({ name: 'D', color: '#5A31D6' }, tick());
    expect(hasUnsentChanges()).toBe(true);
    tick();
    await syncWith(store);
    expect(hasUnsentChanges()).toBe(false);
    setRawSetting(SYNC_LAST_KEY, clock + 1);
    expect(hasUnsentChanges()).toBe(false);
    createCard({ deckId: deck.id, front: 'a', back: 'b', tags: [], reverse: false }, tick());
    expect(hasUnsentChanges()).toBe(true);
  });

  it('reads many cards with their answers in chunks', () => {
    const deck = createDeck({ name: 'Big', color: '#5A31D6' }, tick());
    const ids = Array.from(
      { length: 450 },
      (_, i) =>
        createCard(
          { deckId: deck.id, front: `q${i}`, back: 'a', tags: [], reverse: false },
          clock + i,
        ).id,
    );
    answer(ids[0]!);
    answer(ids[449]!);
    const found = databaseDevice.cardsWithLogs(ids);
    expect(found.cards).toHaveLength(450);
    expect(found.logs).toHaveLength(2);
  });
});

describe("another account's cards (1.0.9)", () => {
  it("removes what sync shares, keeping the tutorial and this device's own settings", () => {
    seedIfNeeded(clock);
    const tutorial = getRawSetting(TUTORIAL_DECK_KEY) as string;
    const tutorialCard = rawQuery('SELECT id FROM cards WHERE deck_id = ? LIMIT 1', tutorial)[0]!
      .id as string;
    answer(tutorialCard);
    const tutorialCards = rawQuery('SELECT COUNT(*) AS n FROM cards')[0]!.n;

    const words = createDeck({ name: 'Words', color: '#5A31D6' }, tick());
    const cat = createCard(
      { deckId: words.id, front: 'cat', back: 'con mèo', tags: [], reverse: true },
      tick(),
    );
    const dog = createCard(
      { deckId: words.id, front: 'dog', back: 'con chó', tags: [], reverse: false },
      tick(),
    );
    answer(cat.id);
    deleteCards([dog.id], tick());
    setSetting('retention', 0.9, tick());
    setSetting('language', 'vi', tick());
    saveSyncOwner({ account: 'a', sentAt: clock });

    // The deck, cat and its reverse; not dog (deleted) or the tutorial.
    expect(sharedCardCount()).toBe(3);

    removeSharedRows();
    expect(sharedCardCount()).toBe(0);
    expect(rowCount(changedRows(null))).toBe(0);
    expect(listDecks().map((d) => d.id)).toEqual([tutorial]);
    expect(rawQuery('SELECT COUNT(*) AS n FROM cards')[0]!.n).toBe(tutorialCards);
    expect(rawQuery('SELECT card_id FROM review_logs')).toEqual([{ card_id: tutorialCard }]);
    expect(getSettings().retention).not.toBe(0.9);
    expect(getRawSetting(SETTING_KEYS.retention)).toBeUndefined();
    expect(getSettings().language).toBe('vi');
    expect(getRawSetting(TUTORIAL_DECK_KEY)).toBe(tutorial);
    expect(loadSyncOwner()).toEqual({ account: 'a', sentAt: clock });
  });

  it('removes everything without a tutorial', () => {
    const deck = createDeck({ name: 'D', color: '#5A31D6' }, tick());
    const card = createCard(
      { deckId: deck.id, front: 'a', back: 'b', tags: [], reverse: false },
      tick(),
    );
    answer(card.id);
    removeSharedRows();
    expect(rows()).toEqual({ decks: [], cards: [], logs: [] });
  });

  it('knows what changed after the last send', async () => {
    const deck = createDeck({ name: 'D', color: '#5A31D6' }, tick());
    const card = createCard(
      { deckId: deck.id, front: 'a', back: 'b', tags: [], reverse: false },
      tick(),
    );
    tick();
    await syncWith(new Store());
    const sentAt = databaseDevice.loadState()!.sentAt!;
    expect(sentAt).toBe(clock);
    expect(changedAfter(sentAt)).toBe(false);
    expect(changedAfter(null)).toBe(true);

    // A row stamped with the send's own time went in that send (rebuilt cards are).
    updateCard(
      card.id,
      { deckId: deck.id, front: 'a2', back: 'b', tags: [], reverse: false },
      sentAt,
    );
    expect(changedAfter(sentAt)).toBe(false);

    answer(card.id);
    expect(changedAfter(sentAt)).toBe(true);
  });

  it('keeps the owner on this device only', () => {
    expect(loadSyncOwner()).toBeNull();
    saveSyncOwner({ account: 'a', sentAt: null });
    expect(loadSyncOwner()).toEqual({ account: 'a', sentAt: null });
    expect(changedRows(null).settings.map((s) => s.key)).not.toContain(SYNC_OWNER_KEY);
    saveSyncOwner(null);
    expect(loadSyncOwner()).toBeNull();
    setRawSetting(SYNC_OWNER_KEY, { account: '' });
    expect(loadSyncOwner()).toBeNull();
    setRawSetting(SYNC_OWNER_KEY, 'garbage');
    expect(loadSyncOwner()).toBeNull();
  });
});
