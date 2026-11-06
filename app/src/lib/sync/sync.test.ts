// Roadmap 6.7: simulated devices edit offline, sync through a fake server, and end up identical.
// The fake devices change rows the way src/db does (updated_at bumps, soft deletes, append-only
// logs with undo tombstones); the fake server keeps files like R2 will (create-only names, a head
// swapped only if unchanged).
import type { CardRow, Deck, ReviewLogRow, SettingRow } from '@/db/schema';

import { buildBackup, type ExistingVersions, type MergePlan } from '../backup';
import { DEFAULT_RETENTION, newCard, Rating, replayCard, review, type Grade } from '../scheduler';
import { DEVICE_SETTING_KEYS, SETTING_KEYS } from '../settings';
import {
  buildSnapshot,
  cardsName,
  changeName,
  changeNumbers,
  combine,
  monthName,
  noRows,
  pages,
  planReads,
  unneeded,
  type Head,
  type SyncRows,
} from './files';
import {
  CLOCK_SLACK_MS,
  FOLD_AFTER,
  sync,
  SyncError,
  type SyncDevice,
  type SyncState,
  type SyncStore,
} from './round';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const T0 = Date.UTC(2026, 10, 3, 12);

let world = T0;
let lastId = 0;
const newId = (prefix: string) => `${prefix}-${String(++lastId).padStart(4, '0')}`;
const tick = (ms = MIN) => (world += ms);

class Server implements SyncStore {
  files = new Map<string, string>();
  head: Head | null = null;
  calls = 0;
  reads: string[] = [];
  /** Throws a network error on this call (1 = the first one). */
  failAt: number | null = null;
  /** Runs once, just before the next create: another device syncing at that moment. */
  beforeCreate: (() => Promise<unknown>) | null = null;

  private call() {
    this.calls++;
    if (this.calls === this.failAt) throw new Error('network');
  }
  async list() {
    this.call();
    const head = this.head && (JSON.parse(JSON.stringify(this.head)) as Head);
    return { head, names: [...this.files.keys()].sort(), now: world };
  }
  async read(name: string) {
    this.call();
    this.reads.push(name);
    return this.files.get(name) ?? null;
  }
  async create(name: string, text: string) {
    this.call();
    const hook = this.beforeCreate;
    this.beforeCreate = null;
    if (hook) await hook();
    if (this.files.has(name)) return false;
    this.files.set(name, text);
    return true;
  }
  async swapHead(base: number | null, head: Head) {
    this.call();
    if ((this.head?.base ?? null) !== base) return false;
    this.head = head;
    return true;
  }
  async remove(names: readonly string[]) {
    this.call();
    for (const name of names) this.files.delete(name);
  }
  changeFiles() {
    return changeNumbers([...this.files.keys()]);
  }
}

class Phone implements SyncDevice {
  decks = new Map<string, Deck>();
  cards = new Map<string, CardRow>();
  logs = new Map<string, ReviewLogRow>();
  settings = new Map<string, SettingRow>();
  state: SyncState | null = null;
  private lastAnswer: { before: CardRow; logId: string } | null = null;

  /** `offset`: how far this device's clock is from the real time. */
  constructor(
    readonly name: string,
    public offset = 0,
  ) {}

  now() {
    return world + this.offset;
  }
  sync(server: Server) {
    return sync(server, this, () => this.now());
  }

  // --- What the app does (as src/db does it) ---

  addDeck(name: string): string {
    const now = this.now();
    const id = newId(`${this.name}-deck`);
    this.decks.set(id, {
      id,
      name,
      color: 'violet',
      front_lang: null,
      back_lang: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    return id;
  }
  addCard(deckId: string, front: string, back = 'answer'): string {
    const now = this.now();
    const id = newId(`${this.name}-card`);
    this.cards.set(id, {
      id,
      deck_id: deckId,
      front,
      back,
      image_uri: null,
      image_side: null,
      tags: [],
      reverse_of: null,
      ...newCard(now),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    return id;
  }
  editCard(id: string, front: string) {
    const card = this.cards.get(id)!;
    this.cards.set(id, { ...card, front, updated_at: this.now() });
  }
  answer(id: string, rating: Grade): string {
    const now = this.now();
    const before = this.cards.get(id)!;
    const result = review(before, rating, now, this.retention());
    const logId = newId(`${this.name}-log`);
    this.cards.set(id, { ...before, ...result.card, updated_at: now });
    this.logs.set(logId, {
      id: logId,
      card_id: id,
      ...result.log,
      duration_ms: 3000,
      goal_met: 0,
      deleted_at: null,
    });
    this.lastAnswer = { before, logId };
    return logId;
  }
  undo() {
    const { before, logId } = this.lastAnswer!;
    const now = this.now();
    this.cards.set(before.id, {
      ...this.cards.get(before.id)!,
      ...schedule(before),
      updated_at: now,
    });
    this.logs.set(logId, { ...this.logs.get(logId)!, deleted_at: now });
    this.lastAnswer = null;
  }
  deleteDeck(id: string) {
    const now = this.now();
    this.decks.set(id, { ...this.decks.get(id)!, deleted_at: now, updated_at: now });
    for (const card of this.cards.values()) {
      if (card.deck_id === id && card.deleted_at === null) {
        this.cards.set(card.id, { ...card, deleted_at: now, updated_at: now });
      }
    }
  }
  setSetting(key: string, value: unknown) {
    this.settings.set(key, { key, value: JSON.stringify(value), updated_at: this.now() });
  }

  // --- SyncDevice ---

  changes(since: number | null): SyncRows {
    const changed = (at: number | null) => since === null || (at !== null && at >= since);
    return {
      decks: [...this.decks.values()].filter((d) => changed(d.updated_at)),
      cards: [...this.cards.values()].filter((c) => changed(c.updated_at)),
      settings: [...this.settings.values()].filter(
        (s) => changed(s.updated_at) && !DEVICE_SETTING_KEYS.includes(s.key),
      ),
      review_logs: [...this.logs.values()].filter(
        (l) => changed(l.reviewed_at) || changed(l.deleted_at),
      ),
    };
  }
  versions(): ExistingVersions {
    const of = <T extends { updated_at: number }>(rows: Map<string, T>) =>
      new Map([...rows].map(([id, r]) => [id, r.updated_at]));
    return {
      decks: of(this.decks),
      cards: of(this.cards),
      settings: of(this.settings),
      review_logs: new Map([...this.logs].map(([id, l]) => [id, l.deleted_at])),
    };
  }
  cardsWithLogs(ids: readonly string[]) {
    const wanted = new Set(ids);
    return {
      cards: ids.map((id) => this.cards.get(id)).filter((c) => c !== undefined),
      logs: [...this.logs.values()].filter((l) => wanted.has(l.card_id)),
    };
  }
  retention() {
    return DEFAULT_RETENTION;
  }
  write(plan: MergePlan) {
    for (const d of plan.decks) this.decks.set(d.id, d);
    for (const c of plan.cards) this.cards.set(c.id, c);
    for (const s of plan.settings) this.settings.set(s.key, s);
    for (const l of plan.newLogs) if (!this.logs.has(l.id)) this.logs.set(l.id, l);
    for (const t of plan.tombstones) {
      const log = this.logs.get(t.id);
      if (log && log.deleted_at === null) this.logs.set(t.id, { ...log, deleted_at: t.deleted_at });
    }
  }
  loadState() {
    return this.state;
  }
  saveState(state: SyncState) {
    this.state = state;
  }

  /** Everything that syncs, in a fixed order, for comparing devices. */
  dump() {
    const sorted = <T>(rows: Iterable<T>, key: (r: T) => string) =>
      [...rows].sort((a, b) => key(a).localeCompare(key(b)));
    const deviceOnly = SETTING_KEYS.reminderEnabled;
    return {
      decks: sorted(this.decks.values(), (d) => d.id),
      cards: sorted(this.cards.values(), (c) => c.id),
      logs: sorted(this.logs.values(), (l) => l.id),
      settings: sorted(
        [...this.settings.values()].filter((s) => s.key !== deviceOnly),
        (s) => s.key,
      ),
    };
  }
}

function schedule(card: CardRow) {
  const { due, stability, difficulty, elapsed_days, scheduled_days, learning_steps } = card;
  const { reps, lapses, state, last_review } = card;
  return {
    due,
    stability,
    difficulty,
    elapsed_days,
    scheduled_days,
    learning_steps,
    reps,
    lapses,
    state,
    last_review,
  };
}

/** Syncs each device in turn, twice round, so everything has reached everyone. */
async function syncAll(server: Server, ...phones: Phone[]) {
  for (let round = 0; round < 2; round++) {
    for (const phone of phones) {
      tick();
      await phone.sync(server);
    }
  }
}

function expectSame(...phones: Phone[]) {
  for (const phone of phones.slice(1)) expect(phone.dump()).toEqual(phones[0].dump());
}

/** A device with one deck of `n` cards, a few of them answered. */
function phoneWithDeck(
  name: string,
  n = 3,
  offset = 0,
): { phone: Phone; deck: string; cards: string[] } {
  const phone = new Phone(name, offset);
  const deck = phone.addDeck(`${name}'s deck`);
  const cards = Array.from({ length: n }, (_, i) => phone.addCard(deck, `${name} ${i}`));
  tick();
  phone.answer(cards[0], Rating.Good);
  return { phone, deck, cards };
}

beforeEach(() => {
  world = T0;
  lastId = 0;
});

describe('sync', () => {
  it('gives a new device everything', async () => {
    const server = new Server();
    const { phone: a } = phoneWithDeck('a');
    a.setSetting(SETTING_KEYS.retention, 0.9);
    const b = new Phone('b');
    await syncAll(server, a, b);
    expectSame(a, b);
    expect(b.cards.size).toBe(3);
    expect(b.logs.size).toBe(1);
    expect(b.settings.get(SETTING_KEYS.retention)?.value).toBe('0.9');
  });

  it('keeps what both devices had before signing in', async () => {
    const server = new Server();
    const { phone: a } = phoneWithDeck('a', 2);
    const { phone: b } = phoneWithDeck('b', 4);
    await syncAll(server, a, b);
    expectSame(a, b);
    expect(a.decks.size).toBe(2);
    expect(a.cards.size).toBe(6);
    expect(a.logs.size).toBe(2);
  });

  it("keeps each device's own settings to itself", async () => {
    const server = new Server();
    const a = new Phone('a');
    const b = new Phone('b');
    a.setSetting(SETTING_KEYS.reminderEnabled, true);
    b.setSetting(SETTING_KEYS.reminderEnabled, false);
    await syncAll(server, a, b);
    expect(a.settings.get(SETTING_KEYS.reminderEnabled)?.value).toBe('true');
    expect(b.settings.get(SETTING_KEYS.reminderEnabled)?.value).toBe('false');
  });

  it('edits on both devices: each card keeps the later edit, everywhere', async () => {
    const server = new Server();
    const { phone: a, cards } = phoneWithDeck('a');
    const b = new Phone('b');
    await syncAll(server, a, b);

    tick();
    a.editCard(cards[0], 'edited on a');
    b.editCard(cards[1], 'edited on b first');
    tick();
    a.editCard(cards[1], 'edited on a later');
    b.editCard(cards[2], 'edited on b');
    await syncAll(server, a, b);
    expectSame(a, b);
    expect([...a.cards.values()].map((c) => c.front).sort()).toEqual([
      'edited on a',
      'edited on a later',
      'edited on b',
    ]);
  });

  it('a deck deleted on one device is deleted on the other, cards too', async () => {
    const server = new Server();
    const { phone: a, deck } = phoneWithDeck('a');
    const b = new Phone('b');
    await syncAll(server, a, b);

    tick();
    b.deleteDeck(deck);
    await syncAll(server, b, a);
    expectSame(a, b);
    expect(a.decks.get(deck)?.deleted_at).not.toBeNull();
    expect([...a.cards.values()].every((c) => c.deleted_at !== null)).toBe(true);
  });

  it('an answer undone on one device is undone on the other', async () => {
    const server = new Server();
    const { phone: a, cards } = phoneWithDeck('a');
    const b = new Phone('b');
    await syncAll(server, a, b);
    const before = schedule(b.cards.get(cards[1])!);

    tick();
    const logId = a.answer(cards[1], Rating.Again);
    await syncAll(server, a, b);
    expect(b.logs.get(logId)?.deleted_at).toBeNull();

    tick();
    a.undo();
    await syncAll(server, a, b);
    expectSame(a, b);
    expect(b.logs.get(logId)?.deleted_at).not.toBeNull();
    expect(schedule(b.cards.get(cards[1])!)).toEqual(before);
  });

  it('a card studied on both devices keeps both answers, and its schedule is rebuilt', async () => {
    const server = new Server();
    const { phone: a, cards } = phoneWithDeck('a');
    const b = new Phone('b');
    await syncAll(server, a, b);
    const card = cards[0];

    tick(DAY);
    const onA = a.answer(card, Rating.Good);
    tick(2 * DAY);
    const onB = b.answer(card, Rating.Again);
    await syncAll(server, a, b);
    expectSame(a, b);

    const answers = [...a.logs.values()].filter((l) => l.card_id === card);
    expect(answers.map((l) => l.id)).toEqual(expect.arrayContaining([onA, onB]));
    expect(answers).toHaveLength(3);
    const created = a.cards.get(card)!.created_at;
    expect(schedule(a.cards.get(card)!)).toEqual(
      replayCard(card, created, answers, DEFAULT_RETENTION),
    );
    expect(a.cards.get(card)!.reps).toBe(3);
  });

  it("doesn't send back what it just received", async () => {
    const server = new Server();
    const { phone: a } = phoneWithDeck('a');
    const b = new Phone('b');
    // (Rows changed in the last CLOCK_SLACK_MS before a send are sent once more, so wait first.)
    tick(2 * CLOCK_SLACK_MS);
    const sentByA = await a.sync(server);
    tick();
    const sentByB = await b.sync(server);
    expect(sentByA.sent).toBe(1);
    expect(sentByB).toMatchObject({ read: 1, sent: 0 });
    tick();
    expect(await a.sync(server)).toMatchObject({ read: 0, sent: 0 });
  });

  it('sends a big first sync as several change files', async () => {
    const server = new Server();
    const a = new Phone('a');
    const deck = a.addDeck('big');
    for (let i = 0; i < 6000; i++) a.addCard(deck, `card ${i}`);
    const b = new Phone('b');
    expect((await a.sync(server)).sent).toBe(2);
    await b.sync(server);
    expectSame(a, b);
  });

  it('starts over when another device takes the next change file first', async () => {
    const server = new Server();
    const { phone: a } = phoneWithDeck('a');
    const { phone: b } = phoneWithDeck('b');
    server.beforeCreate = () => b.sync(server);
    await a.sync(server);
    expect(server.changeFiles()).toEqual([1, 2]);
    await syncAll(server, a, b);
    expectSame(a, b);
    expect(a.cards.size).toBe(6);
  });

  it('gives up for now when other devices keep taking the next number', async () => {
    const server = new Server();
    const { phone: a } = phoneWithDeck('a');
    server.create = async (name) => {
      server.files.set(name, JSON.stringify(buildBackup(noRows(), world)));
      return false;
    };
    await expect(a.sync(server)).rejects.toThrow(SyncError);
    // What did come in is merged, and a's changes go next time.
    expect(a.state?.cursor).toBeGreaterThan(0);
    expect(a.state?.sentAt).toBeNull();
  });

  it('a sync cut off at any point loses nothing', async () => {
    // Count the server calls of one uninterrupted sync, then cut the connection at each of them.
    const scenario = async () => {
      world = T0;
      lastId = 0;
      const server = new Server();
      const { phone: a, cards } = phoneWithDeck('a');
      const { phone: b } = phoneWithDeck('b');
      await syncAll(server, a, b);
      tick();
      a.answer(cards[1], Rating.Easy);
      a.editCard(cards[2], 'edited');
      b.answer(cards[1], Rating.Hard);
      await b.sync(server);
      tick();
      server.calls = 0;
      return { server, a, b };
    };
    const { server: clean, a: first } = await scenario();
    await first.sync(clean);
    const calls = clean.calls;
    expect(calls).toBeGreaterThan(2);

    for (let cut = 1; cut <= calls; cut++) {
      const { server, a, b } = await scenario();
      server.failAt = cut;
      await expect(a.sync(server)).rejects.toThrow('network');
      server.failAt = null;
      await syncAll(server, a, b);
      expectSame(a, b);
      expect([...a.cards.values()].some((c) => c.front === 'edited')).toBe(true);
      expect([...b.logs.values()].filter((l) => l.rating === Rating.Easy)).toHaveLength(1);
    }
  });

  it("a device whose clock is a year ahead can't win every merge", async () => {
    const server = new Server();
    const { phone: a, cards } = phoneWithDeck('a');
    const b = new Phone('b', 365 * DAY);
    await syncAll(server, a, b);

    tick();
    b.editCard(cards[0], 'edited on b, clock wrong');
    await b.sync(server);
    expect(b.cards.get(cards[0])!.updated_at).toBe(world);
    tick();
    a.editCard(cards[0], 'edited on a, later');
    await syncAll(server, a, b);
    expectSame(a, b);
    expect(b.cards.get(cards[0])!.front).toBe('edited on a, later');
  });

  it('a device away for a month catches up from a snapshot, and its changes still arrive', async () => {
    const server = new Server();
    const { phone: a, deck, cards } = phoneWithDeck('a');
    const b = new Phone('b');
    await syncAll(server, a, b);
    tick();
    const fromB = b.addCard(deck, 'added on b while away');

    // a studies and syncs every day, folding twice (the first fold's change files are removed).
    for (let day = 0; day < 2 * FOLD_AFTER + 2; day++) {
      tick(DAY / 2);
      a.answer(cards[day % cards.length], Rating.Good);
      a.addCard(deck, `day ${day}`);
      await a.sync(server);
    }
    expect(server.head?.prev).not.toBeNull();
    expect(server.changeFiles()[0]).toBeGreaterThan(server.head!.prev!.base);
    expect(server.files.has(cardsName(server.head!.base))).toBe(true);

    tick();
    server.reads = [];
    await b.sync(server);
    const base = server.head!.base;
    expect(server.reads).toEqual(expect.arrayContaining([cardsName(base), changeName(base + 1)]));
    expect(server.reads).not.toContain(changeName(2));
    await syncAll(server, a, b);
    expectSame(a, b);
    expect(a.cards.get(fromB)?.front).toBe('added on b while away');
  });
});

describe('sync files', () => {
  const log = (id: string, card: string, at: number, deleted: number | null = null) =>
    ({ id, card_id: card, reviewed_at: at, deleted_at: deleted }) as ReviewLogRow;
  const card = (id: string, at = T0) => ({ id, updated_at: at }) as CardRow;

  it('keeps a card and its answers in the same change file', () => {
    const rows: SyncRows = {
      decks: [],
      settings: [],
      cards: ['x', 'y', 'z'].map((id) => card(id)),
      review_logs: [log('1', 'x', T0), log('2', 'y', T0), log('3', 'y', T0), log('4', 'z', T0)],
    };
    const split = pages(rows, 3);
    expect(split.length).toBeGreaterThan(1);
    for (const page of split) {
      const here = new Set(page.cards.map((c) => c.id));
      expect(page.review_logs.every((l) => here.has(l.card_id))).toBe(true);
    }
    expect(combine(split)).toEqual(rows);
    expect(pages({ decks: [], cards: [], review_logs: [], settings: [] })).toEqual([]);
  });

  it('also starts a new change file before one gets too big', () => {
    const long = (id: string) => ({ ...card(id), front: 'x'.repeat(600) }) as CardRow;
    const rows: SyncRows = {
      decks: [],
      settings: [],
      cards: ['a', 'b', 'c', 'd', 'e'].map(long),
      review_logs: [log('1', 'a', T0), log('2', 'c', T0)],
    };
    const split = pages(rows, 5000, 1500);
    expect(split.length).toBeGreaterThan(2);
    for (const page of split) expect(JSON.stringify(page).length).toBeLessThan(1500 + 700);
    expect(combine(split)).toEqual(rows);
  });

  it('combines files into the newest copy of each row, keeping undos', () => {
    const merged = combine([
      { decks: [], settings: [], cards: [card('x', 2)], review_logs: [log('1', 'x', T0, 5)] },
      { decks: [], settings: [], cards: [card('x', 1)], review_logs: [log('1', 'x', T0)] },
    ]);
    expect(merged.cards).toEqual([card('x', 2)]);
    expect(merged.review_logs[0].deleted_at).toBe(5);
  });

  it('reads change files while they last, then the snapshot', () => {
    const names = [3, 4, 5].map(changeName);
    const head: Head = {
      base: 2,
      months: {
        '2026-10': { rev: 1, logs: 4, undone: 0 },
        '2026-11': { rev: 2, logs: 1, undone: 0 },
      },
      prev: null,
    };
    expect(planReads(head, names, 3)).toEqual({ names: [4, 5].map(changeName), cursor: 5 });
    expect(planReads(head, names, 5)).toEqual({ names: [], cursor: 5 });
    expect(planReads(head, names, 1)).toEqual({
      names: [cardsName(2), monthName('2026-11', 2), ...names],
      cursor: 5,
    });
    expect(planReads(null, [], 0)).toEqual({ names: [], cursor: 0 });
    expect(planReads(head, [changeName(5)], 1)).toBeNull();
  });

  it('a snapshot rewrites only the months that changed, and keeps the one before', () => {
    const october = Date.UTC(2026, 9, 10);
    const all = (undone: number | null): SyncRows => ({
      decks: [],
      settings: [],
      cards: [card('x')],
      review_logs: [log('1', 'x', october), log('2', 'x', T0, undone)],
    });
    const first = buildSnapshot(all(null), 20, null);
    expect(first.files.map((f) => f.name)).toEqual([
      cardsName(20),
      monthName('2026-10', 20),
      monthName('2026-11', 20),
    ]);
    const second = buildSnapshot(all(T0 + DAY), 40, first.head);
    expect(second.files.map((f) => f.name)).toEqual([cardsName(40), monthName('2026-11', 40)]);
    expect(second.head.months['2026-10'].rev).toBe(20);
    expect(second.head.prev?.base).toBe(20);

    const names = [
      ...first.files.map((f) => f.name),
      ...second.files.map((f) => f.name),
      cardsName(7),
      ...[15, 20, 21, 40, 41].map(changeName),
      'pictures/abc',
    ];
    expect(unneeded(names, second.head).sort()).toEqual(
      [cardsName(7), changeName(15), changeName(20)].sort(),
    );
  });
});
