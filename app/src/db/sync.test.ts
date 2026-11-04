// Sync on the real database (roadmap 6.7, part 4): three installs take turns on the test database
// (cleared in between, like a fresh install), syncing through an in-memory store.
import { clearTestDb, migrateTestDb, rawQuery } from '../../test/db';

import { seedIfNeeded } from '@/features/onboarding/seed';
import { parseBackup } from '@/lib/backup';
import { Rating, review, type Grade } from '@/lib/scheduler';
import { SYNC_LAST_KEY, TUTORIAL_DECK_KEY } from '@/lib/settings';
import type { Head } from '@/lib/sync/files';
import { sync, type SyncStore } from '@/lib/sync/round';

import { createCard, deleteCards, getCard, updateCard } from './cards';
import { createDeck, listDecks } from './decks';
import { getRawSetting, getSettings, setRawSetting, setSetting } from './settings';
import { answerCard } from './study';
import { databaseDevice, dropUnusedTutorial, hasUnsentChanges } from './sync';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../test/db').createTestClient());

const NOW = Date.UTC(2026, 10, 4, 12);
let clock = NOW;
const tick = () => (clock += 60_000);

/** The account's files, like R2 behind the Worker: create-only names, a head swapped if unchanged. */
class Store implements SyncStore {
  files = new Map<string, string>();
  head: Head | null = null;
  async list() {
    return { head: this.head, names: [...this.files.keys()].sort(), now: clock };
  }
  async read(name: string) {
    return this.files.get(name) ?? null;
  }
  async create(name: string, text: string) {
    if (this.files.has(name)) return false;
    this.files.set(name, text);
    return true;
  }
  async swapHead(base: number | null, head: Head) {
    if ((this.head?.base ?? null) !== base) return false;
    this.head = head;
    return true;
  }
  async remove(names: readonly string[]) {
    for (const name of names) this.files.delete(name);
  }
  /** Every row sent so far, from all change files. */
  sent() {
    const backups = [...this.files.values()].map((text) => parseBackup(text));
    return {
      decks: backups.flatMap((b) => b.decks),
      cards: backups.flatMap((b) => b.cards),
      review_logs: backups.flatMap((b) => b.review_logs),
      settings: backups.flatMap((b) => b.settings),
    };
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
