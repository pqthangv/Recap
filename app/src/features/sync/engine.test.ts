// Signing in on a device that has another account's cards (1.0.9): the engine with the real test
// database, each account's files in memory, and no network.
import { clearTestDb, migrateTestDb, rawQuery } from '../../../test/db';
import { MemoryStore } from '../../../test/syncStore';

import { createCard, getCard } from '@/db/cards';
import { createDeck, deleteDeck, listDecks } from '@/db/decks';
import { getRawSetting, getSettings, setRawSetting } from '@/db/settings';
import { answerCard } from '@/db/study';
import { databaseDevice, loadSyncOwner } from '@/db/sync';
import { Rating, review } from '@/lib/scheduler';
import { SYNC_PICTURES_KEY } from '@/lib/settings';
import { toBase64url, type Account } from '@/lib/sync/account';
import { SyncHttpError } from '@/lib/sync/http';
import { sync, type SyncStore } from '@/lib/sync/round';

import { otherAccountCards, signIn, signOut, syncNow } from './engine';
import { getAccount } from './session';

// jest.mock factories can't use imports, so these need require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../../test/db').createTestClient());
jest.mock('./storage', () => {
  let saved: string | null = null;
  return {
    accountStorage: {
      read: () => saved,
      write: (value: string) => {
        saved = value;
      },
      remove: async () => {
        saved = null;
      },
    },
  };
});
jest.mock('./api', () => ({ SYNC_URL: 'http://sync.test', accountClient: {} }));
jest.mock('./pictures', () => ({ syncPictures: jest.fn(async () => undefined) }));
jest.mock('@/features/leaderboard/score', () => ({ sendScore: jest.fn(async () => undefined) }));

/** Each account's files, by account id (the token's sub). */
const mockStores = new Map<string, SyncStore>();
jest.mock('@/lib/sync/http', () => {
  const { tokenAccount } = jest.requireActual('@/lib/sync/account');
  return {
    ...jest.requireActual('@/lib/sync/http'),
    createHttpStore: ({ token }: { token: () => string }) => mockStores.get(tokenAccount(token())),
    createPictureStore: () => ({}),
  };
});

const A = '0a0a0a0a-0000-4000-8000-00000000000a';
const B = '0b0b0b0b-0000-4000-8000-00000000000b';
const COLOR = '#5A31D6';

const accountFor = (id: string): Account => ({
  token: `e30.${toBase64url(btoa(JSON.stringify({ sub: id, iat: 1 })))}.sig`,
  provider: 'email',
  email: `${id.slice(0, 2)}@example.com`,
});

let clock = Date.UTC(2026, 10, 6, 12);
const tick = () => {
  clock += 60_000;
  jest.setSystemTime(clock);
  return clock;
};

function answer(cardId: string) {
  tick();
  const result = review(getCard(cardId)!, Rating.Good, clock, getSettings().retention);
  answerCard(cardId, result, 2000, clock);
}

/** A deck with a studied card, made on this device. */
function makeDeck(name: string) {
  const deck = createDeck({ name, color: COLOR }, tick());
  const card = createCard(
    { deckId: deck.id, front: `${name} front`, back: 'back', tags: [], reverse: false },
    tick(),
  );
  answer(card.id);
  return { deck, card };
}

/** An account whose other device already synced a deck of its own. */
async function accountWithDeck(id: string, name: string): Promise<MemoryStore> {
  const store = new MemoryStore();
  mockStores.set(id, store);
  makeDeck(name);
  tick();
  await sync(store, databaseDevice);
  clearTestDb(); // back to this device, fresh
  return store;
}

function newAccount(id: string): MemoryStore {
  const store = new MemoryStore();
  mockStores.set(id, store);
  return store;
}

async function signInAndSync(account: Account, theirCards?: 'add' | 'remove') {
  tick();
  signIn(account, theirCards);
  await syncNow(); // joins the sync signIn started
}

/** A sync that's meant to fail says so in the log: not here. */
let warn: jest.SpyInstance | undefined;
const quietly = () => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
};

const deckNames = () =>
  listDecks()
    .map((d) => d.name)
    .sort();
const sentDeckNames = (store: MemoryStore) =>
  [...new Set(store.sent().decks.map((d) => d.name))].sort();

beforeAll(() => {
  jest.useFakeTimers({ now: clock });
  migrateTestDb();
});
afterAll(() => jest.useRealTimers());
afterEach(() => {
  warn?.mockRestore();
  warn = undefined;
});
beforeEach(() => {
  signOut({ accountGone: true });
  clearTestDb();
  mockStores.clear();
});

describe('signing in with cards from another account', () => {
  it('asks first, and "Remove" leaves only the new account\'s cards here', async () => {
    const storeB = await accountWithDeck(B, 'Bao');
    const storeA = newAccount(A);
    makeDeck('Lan');

    // Cards made with no account join the first account without a question.
    expect(otherAccountCards(accountFor(A))).toBeNull();
    await signInAndSync(accountFor(A));
    expect(loadSyncOwner()?.account).toBe(A);
    signOut();
    expect(loadSyncOwner()?.account).toBe(A);

    // Someone else signs in on this device.
    expect(otherAccountCards(accountFor(B))).toEqual({ unsent: false });
    await signInAndSync(accountFor(B), 'remove');
    expect(getAccount()).toEqual(accountFor(B));
    expect(deckNames()).toEqual(['Bao']);
    expect(rawQuery('SELECT COUNT(*) AS n FROM review_logs')[0]!.n).toBe(1); // Bao's
    expect(sentDeckNames(storeB)).toEqual(['Bao']);
    // Nothing was deleted from the first account.
    expect(storeA.sent().decks.every((d) => d.deleted_at === null)).toBe(true);
    expect(sentDeckNames(storeA)).toEqual(['Lan']);
    expect(loadSyncOwner()?.account).toBe(B);
  });

  it('"Add" puts them in the new account, as before', async () => {
    const storeB = await accountWithDeck(B, 'Bao');
    newAccount(A);
    makeDeck('Lan');
    await signInAndSync(accountFor(A));
    setRawSetting(SYNC_PICTURES_KEY, { sent: ['0123456789abcdef0123456789abcdef.webp'] });
    signOut();

    await signInAndSync(accountFor(B), 'add');
    expect(deckNames()).toEqual(['Bao', 'Lan']);
    expect(sentDeckNames(storeB)).toEqual(['Bao', 'Lan']);
    // The pictures sent were sent to the first account: the new one gets them too.
    expect(getRawSetting(SYNC_PICTURES_KEY)).toBeNull();
  });

  it('warns when changes made here never reached the first account', async () => {
    newAccount(B);
    newAccount(A);
    const { card } = makeDeck('Lan');
    await signInAndSync(accountFor(A));
    signOut();
    answer(card.id); // studied after signing out
    expect(otherAccountCards(accountFor(B))).toEqual({ unsent: true });
  });

  it('never asks about the same account', async () => {
    const storeA = newAccount(A);
    makeDeck('Lan');
    await signInAndSync(accountFor(A));
    signOut();
    makeDeck('Minh');
    expect(otherAccountCards(accountFor(A))).toBeNull();
    await signInAndSync(accountFor(A));
    expect(sentDeckNames(storeA)).toEqual(['Lan', 'Minh']);
  });

  it("treats a deleted or refused account's cards as this device's own", async () => {
    const storeB = newAccount(B);
    newAccount(A);
    makeDeck('Lan');
    await signInAndSync(accountFor(A));
    setRawSetting(SYNC_PICTURES_KEY, { sent: ['0123456789abcdef0123456789abcdef.webp'] });
    signOut({ accountGone: true }); // deleted here, or the server refused its token
    expect(loadSyncOwner()).toBeNull();
    // Its pictures were sent to files that may be gone: the next account gets them all.
    expect(getRawSetting(SYNC_PICTURES_KEY)).toBeNull();
    expect(otherAccountCards(accountFor(B))).toBeNull();
    await signInAndSync(accountFor(B));
    expect(sentDeckNames(storeB)).toEqual(['Lan']);
  });

  it('signs out and forgets the owner when the server refuses the token', async () => {
    const storeA = newAccount(A);
    makeDeck('Lan');
    await signInAndSync(accountFor(A));
    storeA.list = async () => {
      throw new SyncHttpError('signedOut');
    };
    quietly();
    await syncNow();
    expect(getAccount()).toBeNull();
    expect(loadSyncOwner()).toBeNull();
  });

  it("removes another account's leftovers without asking when no cards are left", async () => {
    const storeB = await accountWithDeck(B, 'Bao');
    newAccount(A);
    const { deck } = makeDeck('Lan');
    await signInAndSync(accountFor(A));
    deleteDeck(deck.id, tick()); // in Recently deleted, with its card and answer
    signOut();

    expect(otherAccountCards(accountFor(B))).toBeNull();
    await signInAndSync(accountFor(B));
    expect(rawQuery('SELECT name FROM decks')).toEqual([{ name: 'Bao' }]);
    expect(sentDeckNames(storeB)).toEqual(['Bao']);
  });

  it('only counts an account as the owner after a finished sync', async () => {
    newAccount(B);
    const storeA = newAccount(A);
    storeA.list = async () => {
      throw new SyncHttpError('offline');
    };
    quietly();
    makeDeck('Lan');
    await signInAndSync(accountFor(A));
    expect(loadSyncOwner()).toBeNull();
    signOut();
    // Never in the first account, so nothing to ask: they join the next one.
    expect(otherAccountCards(accountFor(B))).toBeNull();
  });
});
