import { clearTestDb, migrateTestDb, rawQuery } from '../../test/db';

import { exportBackup, exportCardsCsv, importBackup } from './backup';
import {
  countCards,
  createCard,
  deleteCards,
  getCardForEdit,
  keptPictureRefs,
  moveCards,
  normalizeStoredPictureRefs,
  pictureRefsInUse,
  restoreCards,
  updateCard,
} from './cards';
import {
  adoptDeckLanguages,
  createDeck,
  deleteDeck,
  deleteDecks,
  listDecks,
  listDeletedDecks,
  restoreDecks,
  updateDeck,
} from './decks';
import { setSetting } from './settings';
import { getStats } from './stats';
import {
  answerCard,
  getDailyGoal,
  getDueQueue,
  getNewDoneToday,
  getStudyCounts,
  resetDeckSchedule,
  undoAnswer,
} from './study';

import { parseBackup } from '@/lib/backup';
import { dayStart } from '@/lib/day';
import { setLanguage } from '@/lib/i18n';
import { previewIntervals, Rating, review, State } from '@/lib/scheduler';
import { seedIfNeeded, WELCOME_DECKS } from '@/features/onboarding/seed';
import { endTutorial, getTutorialDeckId } from '@/features/onboarding/tutorial';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../test/db').createTestClient());

const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => migrateTestDb());
beforeEach(() => clearTestDb());

function addDeck(name = 'Biology') {
  return createDeck({ name, color: '#5A31D6' }, NOW);
}

function addCards(deckId: string, n: number, reverse = false) {
  return Array.from({ length: n }, (_, i) =>
    createCard({ deckId, front: `Q${i}`, back: `A${i}`, tags: [], reverse }, NOW + i),
  );
}

/** Answer the first card in the queue the way the study screen does. */
function answerNext(rating: Rating.Again | Rating.Good, now: number, deckId?: string) {
  const [card] = getDueQueue(deckId, now);
  const preview = previewIntervals(card, now, 0.9);
  const logId = answerCard(card.id, preview[rating].result, 4000, now);
  return { card, logId };
}

describe('migrations and seed', () => {
  it('creates every table', () => {
    const tables = rawQuery("select name from sqlite_master where type = 'table'").map(
      (r) => r.name,
    );
    expect(tables).toEqual(expect.arrayContaining(['decks', 'cards', 'review_logs', 'settings']));
  });

  it('seeds the welcome decks once, and not again after they are deleted', () => {
    expect(seedIfNeeded(NOW)).toBe(true);
    expect(listDecks().map((d) => d.name)).toEqual(WELCOME_DECKS.en.map((d) => d.name));
    const total = WELCOME_DECKS.en.reduce((n, d) => n + d.cards.length, 0);
    expect(rawQuery('select count(*) as n from cards')[0].n).toBe(total);

    for (const d of listDecks()) deleteDeck(d.id, NOW);
    expect(seedIfNeeded(NOW)).toBe(false);
    expect(listDecks()).toHaveLength(0);
  });

  it('points the first-launch tip at "How to use Recap" until it is used or skipped', () => {
    expect(getTutorialDeckId()).toBeNull(); // installs from before the tip never see it
    seedIfNeeded(NOW);
    const howTo = listDecks().find((d) => d.name === WELCOME_DECKS.en[0].name);
    expect(getTutorialDeckId()).toBe(howTo?.id);
    endTutorial(NOW);
    expect(getTutorialDeckId()).toBeNull();
  });

  it('studies "How to use Recap" in the order written, even after the tip is gone', () => {
    seedIfNeeded(NOW);
    const howTo = getTutorialDeckId()!;
    const written = WELCOME_DECKS.en[0].cards.map(([front]) => front);
    expect(getDueQueue(howTo, NOW).map((c) => c.front)).toEqual(written);
    endTutorial(NOW);
    expect(getDueQueue(howTo, NOW).map((c) => c.front)).toEqual(written);
    // Studying everything at once: still in order among themselves.
    const another = addDeck('Other');
    addCards(another.id, 10);
    const mixed = getDueQueue(undefined, NOW).map((c) => c.front);
    expect(mixed.filter((f) => written.includes(f))).toEqual(written);
  });

  it('drops the tip when its deck is deleted', () => {
    seedIfNeeded(NOW);
    const id = getTutorialDeckId();
    deleteDeck(id!, NOW);
    expect(getTutorialDeckId()).toBeNull();
  });

  it("seeds the welcome deck in the phone's language", () => {
    setLanguage('vi');
    try {
      seedIfNeeded(NOW);
    } finally {
      setLanguage('en');
    }
    expect(listDecks().map((d) => d.name)).toEqual(['Cách dùng Recap']);
    const howTo = getTutorialDeckId()!;
    expect(getDueQueue(howTo, NOW).map((c) => c.front)).toEqual(
      WELCOME_DECKS.vi[0].cards.map(([front]) => front),
    );
  });
});

describe('cards', () => {
  it('creates, edits and removes a reverse card with its main card', () => {
    const deck = addDeck();
    const [card] = addCards(deck.id, 1, true);
    const reverse = rawQuery('select * from cards where reverse_of = ?', card.id)[0];
    expect(reverse).toMatchObject({ front: 'A0', back: 'Q0' });

    // Opening the reverse card edits the main one.
    expect(getCardForEdit(reverse.id as string)).toMatchObject({
      card: { id: card.id },
      hasReverse: true,
    });

    updateCard(
      card.id,
      { deckId: deck.id, front: 'Cell', back: 'Unit of life', tags: ['bio'], reverse: true },
      NOW,
    );
    expect(rawQuery('select front, back from cards where id = ?', reverse.id as string)[0]).toEqual(
      {
        front: 'Unit of life',
        back: 'Cell',
      },
    );

    updateCard(
      card.id,
      { deckId: deck.id, front: 'Cell', back: 'Unit of life', tags: [], reverse: false },
      NOW,
    );
    expect(getCardForEdit(card.id)?.hasReverse).toBe(false);
  });

  it('deletes a card and its reverse together, with undo', () => {
    const deck = addDeck();
    const [card] = addCards(deck.id, 1, true);
    const deleted = deleteCards([card.id], NOW);
    expect(deleted).toHaveLength(2);
    expect(getStudyCounts(NOW).total).toBe(0);
    restoreCards(deleted, NOW);
    expect(getStudyCounts(NOW).total).toBe(2);
  });

  it('keeps a picture with its text: the reverse card shows it on the other side', () => {
    const deck = addDeck();
    const picture = { ref: 'media/abc.webp', side: 'front' as const };
    const card = createCard(
      { deckId: deck.id, front: 'Which bird?', back: 'Robin', tags: [], reverse: true, picture },
      NOW,
    );
    const sides = () =>
      rawQuery('select front, image_uri, image_side from cards order by reverse_of is not null');
    expect(sides()).toEqual([
      { front: 'Which bird?', image_uri: 'media/abc.webp', image_side: 'front' },
      { front: 'Robin', image_uri: 'media/abc.webp', image_side: 'back' },
    ]);

    const input = { deckId: deck.id, front: 'Which bird?', back: 'Robin', tags: [], reverse: true };
    updateCard(card.id, input, NOW + 1); // no `picture`: kept as it was
    expect(sides()[1]).toMatchObject({ image_uri: 'media/abc.webp', image_side: 'back' });

    updateCard(card.id, { ...input, picture: { ref: 'media/new.webp', side: 'back' } }, NOW + 2);
    expect(sides()).toEqual([
      { front: 'Which bird?', image_uri: 'media/new.webp', image_side: 'back' },
      { front: 'Robin', image_uri: 'media/new.webp', image_side: 'front' },
    ]);

    updateCard(card.id, { ...input, picture: null }, NOW + 3);
    expect(sides().map((r) => [r.image_uri, r.image_side])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('knows which pictures are still needed', () => {
    const deck = addDeck();
    const make = (ref: string) =>
      createCard(
        {
          deckId: deck.id,
          front: ref,
          back: 'A',
          tags: [],
          reverse: false,
          picture: { ref, side: 'front' },
        },
        NOW,
      );
    make('media/live.webp');
    const undoable = make('media/just-deleted.webp');
    const old = make('media/deleted-long-ago.webp');
    deleteCards([old.id], NOW - 40 * DAY);
    deleteCards([undoable.id], NOW);

    // Kept on the phone: live cards, and deleted ones that can still come back.
    expect(keptPictureRefs(NOW).sort()).toEqual(['media/just-deleted.webp', 'media/live.webp']);
    // In use at all (deleted cards too), so nothing is deleted under Undo.
    expect(
      pictureRefsInUse(['media/live.webp', 'media/deleted-long-ago.webp', 'media/never.webp']),
    ).toEqual(new Set(['media/live.webp', 'media/deleted-long-ago.webp']));
  });

  it('rewrites full picture paths from older versions, without counting it as an edit', () => {
    const deck = addDeck();
    const old = 'file:///data/user/0/com.recapcards.app/files/media/1f2e3d.webp';
    const card = createCard(
      {
        deckId: deck.id,
        front: 'Q',
        back: 'A',
        tags: [],
        reverse: true,
        picture: { ref: old, side: 'front' },
      },
      NOW,
    );
    expect(normalizeStoredPictureRefs()).toBe(1);
    expect(rawQuery('select image_uri, updated_at from cards')).toEqual([
      { image_uri: 'media/1f2e3d.webp', updated_at: NOW },
      { image_uri: 'media/1f2e3d.webp', updated_at: NOW },
    ]);
    expect(normalizeStoredPictureRefs()).toBe(0);
    expect(getCardForEdit(card.id)?.card.image_uri).toBe('media/1f2e3d.webp');
  });

  it('hides cards of a deleted deck everywhere', () => {
    const deck = addDeck();
    addCards(deck.id, 3);
    deleteDeck(deck.id, NOW);
    expect(getDueQueue(undefined, NOW)).toHaveLength(0);
    expect(exportCardsCsv().trim().split('\r\n')).toHaveLength(1); // header only
  });
});

describe('study', () => {
  it('counts new cards up to the daily limit', () => {
    const deck = addDeck();
    addCards(deck.id, 30);
    expect(getStudyCounts(NOW)).toMatchObject({ due: 0, new: 20, total: 20 });
    setSetting('newPerDay', 5, NOW);
    expect(getStudyCounts(NOW).byDeck[deck.id]).toEqual({ due: 0, new: 5 });
    expect(getDueQueue(deck.id, NOW)).toHaveLength(5);
  });

  it('answering uses up the new-card allowance; undo gives it back', () => {
    const deck = addDeck();
    addCards(deck.id, 3);
    setSetting('newPerDay', 2, NOW);

    const first = answerNext(Rating.Good, NOW);
    expect(getNewDoneToday(NOW)).toBe(1);
    const card = rawQuery('select state, reps from cards where id = ?', first.card.id)[0];
    expect(card).toEqual({ state: State.Learning, reps: 1 });

    undoAnswer(first.card, first.logId, NOW + 1000);
    expect(getNewDoneToday(NOW)).toBe(0);
    expect(rawQuery('select state, reps from cards where id = ?', first.card.id)[0]).toEqual({
      state: State.New,
      reps: 0,
    });
    // The log is tombstoned, never removed.
    expect(rawQuery('select deleted_at from review_logs')).toEqual([{ deleted_at: NOW + 1000 }]);
  });

  it('brings a forgotten card back in the same session', () => {
    const deck = addDeck();
    addCards(deck.id, 1);
    const { card } = answerNext(Rating.Again, NOW);
    const queue = getDueQueue(deck.id, NOW + 1000);
    expect(queue.map((c) => c.id)).toEqual([card.id]);
  });

  it('a graduated card is due again on its day, not before', () => {
    const deck = addDeck();
    addCards(deck.id, 1);
    let now = NOW;
    for (let i = 0; i < 10; i++) {
      const [c] = getDueQueue(deck.id, now);
      if (!c) break;
      const res = review(c, Rating.Good, now, 0.9);
      answerCard(c.id, res, 1000, now);
      if (res.card.state === State.Review) break;
      now = res.card.due;
    }
    const [row] = rawQuery('select state, due from cards') as { state: number; due: number }[];
    expect(row.state).toBe(State.Review);
    expect(getStudyCounts(now).due).toBe(0);
    expect(getStudyCounts(now, row.due).due).toBe(1);
  });

  it('resets a deck schedule and logs it', () => {
    const deck = addDeck();
    addCards(deck.id, 2);
    answerNext(Rating.Good, NOW);
    expect(resetDeckSchedule(deck.id, NOW + 1000)).toBe(1);
    expect(rawQuery('select count(*) as n from cards where state = 0')[0].n).toBe(2);
    expect(rawQuery('select rating from review_logs order by reviewed_at')).toEqual([
      { rating: Rating.Good },
      { rating: Rating.Manual },
    ]);
  });
});

describe('stats', () => {
  it('counts today, the streak, study time and the last 7 days', () => {
    // One card per deck, so each day's answer is a different (new) card.
    for (const daysAgo of [2, 1, 0]) {
      const deck = addDeck(`Deck ${daysAgo}`);
      addCards(deck.id, 1);
      answerNext(Rating.Good, NOW - daysAgo * DAY, deck.id);
    }
    const stats = getStats(NOW);
    expect(stats.reviewedToday).toBe(1);
    expect(stats.streak).toBe(3);
    // Each answer took 4 seconds (see answerNext).
    expect(stats.timeToday).toBe(4000);
    expect(stats.timeTotal).toBe(12000);
    expect(stats.lastWeek.map((d) => d.cards)).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(stats.newToday).toBe(1); // each was a new card
    expect(stats.lastWeek.map((d) => d.newCards)).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(stats.lastWeek.map((d) => d.ms)).toEqual([0, 0, 0, 0, 4000, 4000, 4000]);
    expect(stats.lastWeek.at(-1)?.day).toBe(dayStart(NOW)); // the last one is today
  });

  it("counts a streak day only once that day's new-card goal is met", () => {
    setSetting('newPerDay', 2, NOW - 2 * DAY);
    const deck = addDeck();
    addCards(deck.id, 5);
    answerNext(Rating.Good, NOW - DAY, deck.id); // yesterday: 1 of 2 new cards
    expect(getStats(NOW).streak).toBe(0);

    // Today: keep studying until 2 new cards are done (yesterday's card comes back first).
    let last = answerNext(Rating.Good, NOW, deck.id);
    for (let i = 1; getDailyGoal(NOW + i).done < 2 && i < 6; i++) {
      expect(getStats(NOW + i).goalMetToday).toBe(false);
      last = answerNext(Rating.Good, NOW + i * 1000, deck.id);
    }
    let stats = getStats(NOW + 10_000);
    expect(stats.goal).toEqual({ done: 2, goal: 2 });
    expect(stats.goalMetToday).toBe(true);
    expect(stats.streak).toBe(1);

    // Raising the goal later doesn't take the day back; undoing the answer that met it does.
    setSetting('newPerDay', 4, NOW + 20_000);
    stats = getStats(NOW + 30_000);
    expect(stats.goal).toEqual({ done: 2, goal: 4 });
    expect(stats.streak).toBe(1);
    undoAnswer(last.card, last.logId, NOW + 40_000);
    expect(getStats(NOW + 50_000).streak).toBe(0);
  });

  it('counts any answer when no new cards are left', () => {
    const deck = addDeck();
    addCards(deck.id, 1);
    answerNext(Rating.Good, NOW - DAY, deck.id); // the only new card: goal 1 of 1
    answerNext(Rating.Good, NOW, deck.id); // no new cards left: goal 0
    const stats = getStats(NOW);
    expect(stats.goal).toEqual({ done: 0, goal: 0 });
    expect(stats.streak).toBe(2);
  });
});

describe('backup', () => {
  it('round-trips everything through JSON and merges idempotently', () => {
    const deck = addDeck();
    addCards(deck.id, 2, true);
    answerNext(Rating.Good, NOW);
    setSetting('retention', 0.85, NOW);
    const backup = parseBackup(JSON.stringify(exportBackup(NOW)));

    clearTestDb();
    expect(importBackup(backup)).toEqual({ decks: 1, cards: 4, reviews: 1 });
    expect(exportBackup(NOW)).toEqual(backup);
    expect(importBackup(backup)).toEqual({ decks: 0, cards: 0, reviews: 0 });
  });

  it('keeps whichever copy of a card was changed last', () => {
    const deck = addDeck();
    const [card] = addCards(deck.id, 1);
    const backup = exportBackup(NOW);
    updateCard(
      card.id,
      { deckId: deck.id, front: 'Newer on device', back: 'A', tags: [], reverse: false },
      NOW + DAY,
    );
    importBackup(backup);
    expect(rawQuery('select front from cards')[0].front).toBe('Newer on device');

    backup.cards[0] = { ...backup.cards[0], front: 'Newer in file', updated_at: NOW + 2 * DAY };
    importBackup(backup);
    expect(rawQuery('select front from cards')[0].front).toBe('Newer in file');
  });

  it('carries deletes and undos across', () => {
    const deck = addDeck();
    const [card] = addCards(deck.id, 1);
    const { logId } = answerNext(Rating.Good, NOW);
    const before = exportBackup(NOW);

    deleteCards([card.id], NOW + 1000);
    undoAnswer({ ...before.cards[0] }, logId, NOW + 1000);
    const after = exportBackup(NOW + 2000);

    clearTestDb();
    importBackup(before);
    importBackup(after);
    expect(getStudyCounts(NOW).total).toBe(0);
    expect(rawQuery('select deleted_at from review_logs')[0].deleted_at).toBe(NOW + 1000);
  });

  it('reads old picture paths as "media/<name>", and drops ones that point elsewhere', () => {
    const deck = addDeck();
    createCard(
      {
        deckId: deck.id,
        front: 'Q',
        back: 'A',
        tags: [],
        reverse: false,
        picture: { ref: 'media/x.webp', side: 'back' },
      },
      NOW,
    );
    const backup = exportBackup(NOW);
    const card = backup.cards[0];
    const read = (image_uri: string | null, image_side: string | null) =>
      parseBackup(JSON.stringify({ ...backup, cards: [{ ...card, image_uri, image_side }] }))
        .cards[0];

    expect(
      read('file:///var/mobile/Containers/Data/Application/1/Documents/media/x.webp', 'back'),
    ).toMatchObject({ image_uri: 'media/x.webp', image_side: 'back' });
    expect(read('media/..', 'front')).toMatchObject({ image_uri: null, image_side: null });
    expect(read('media/x.webp', 'sideways')).toMatchObject({ image_side: 'front' });
  });

  it('rejects files that are not Recap backups', () => {
    expect(() => parseBackup('hello')).toThrow('Not a JSON file');
    expect(() => parseBackup('{"format":"other"}')).toThrow('Not a Recap backup');
  });

  it("carries a deck's languages; older files and unknown languages are Auto", () => {
    createDeck({ name: 'German', color: '#5A31D6', languages: { front: 'de', back: 'vi' } }, NOW);
    const backup = parseBackup(JSON.stringify(exportBackup(NOW)));
    expect(backup.decks[0]).toMatchObject({ front_lang: 'de', back_lang: 'vi' });

    const deck = backup.decks[0] as Record<string, unknown>;
    const { front_lang: _front, back_lang: _back, ...older } = deck;
    expect(parseBackup(JSON.stringify({ ...backup, decks: [older] })).decks[0]).toMatchObject({
      front_lang: null,
      back_lang: null,
    });
    expect(
      parseBackup(JSON.stringify({ ...backup, decks: [{ ...deck, front_lang: 'xx' }] })).decks[0],
    ).toMatchObject({ front_lang: null, back_lang: 'vi' });
  });
});

describe('deck languages', () => {
  const langs = (id: string) =>
    rawQuery(`select front_lang, back_lang from decks where id = '${id}'`)[0];

  it('are set when a deck is made or edited, and kept when an edit leaves them out', () => {
    const deck = createDeck(
      { name: 'Spanish', color: '#5A31D6', languages: { front: 'es', back: 'en' } },
      NOW,
    );
    expect(langs(deck.id)).toEqual({ front_lang: 'es', back_lang: 'en' });
    updateDeck(deck.id, { name: 'Spanish 1', color: '#5A31D6' }, NOW + 1);
    expect(langs(deck.id)).toEqual({ front_lang: 'es', back_lang: 'en' });
    updateDeck(
      deck.id,
      { name: 'Spanish 1', color: '#5A31D6', languages: { front: 'es', back: null } },
      NOW + 2,
    );
    expect(langs(deck.id)).toEqual({ front_lang: 'es', back_lang: null });
    expect(addDeck('Plain').front_lang).toBeNull();
  });

  it("come from AI cards' languages only while the deck is on Auto", () => {
    const deck = addDeck('Words');
    expect(adoptDeckLanguages(deck.id, { front: null, back: null }, NOW)).toBe(false);
    expect(adoptDeckLanguages(deck.id, { front: 'de', back: 'vi' }, NOW)).toBe(true);
    expect(langs(deck.id)).toEqual({ front_lang: 'de', back_lang: 'vi' });
    // The deck has its own now: later cards in other languages don't change it.
    expect(adoptDeckLanguages(deck.id, { front: 'fr', back: 'en' }, NOW)).toBe(false);
    expect(langs(deck.id)).toEqual({ front_lang: 'de', back_lang: 'vi' });
  });
});

describe('csv export', () => {
  it('writes a header, one row per card and escapes text', () => {
    const deck = addDeck('Words, "quoted"');
    createCard(
      {
        deckId: deck.id,
        front: 'Line 1\nLine 2',
        back: 'Tiếng Việt',
        tags: ['a', 'b'],
        reverse: false,
      },
      NOW,
    );
    const csv = exportCardsCsv();
    expect(csv.startsWith('﻿deck,front,back,tags,state,')).toBe(true);
    expect(csv).toContain('"Words, ""quoted""","Line 1\nLine 2",Tiếng Việt,"a, b",new,');
  });
});

describe('deck groups', () => {
  it('studies, counts and deletes several decks together', () => {
    const a = addDeck('SAT › Priority 1');
    const b = addDeck('SAT › Priority 2');
    const other = addDeck('Biology');
    addCards(a.id, 2);
    addCards(b.id, 3);
    addCards(other.id, 4);

    const queue = getDueQueue([a.id, b.id], NOW);
    expect(queue).toHaveLength(5);
    expect(new Set(queue.map((c) => c.deck_id))).toEqual(new Set([a.id, b.id]));
    expect(getDueQueue([], NOW)).toEqual([]);
    expect(countCards([a.id, b.id])).toBe(5);

    deleteDecks([a.id, b.id], NOW + 1);
    expect(listDecks().map((d) => d.name)).toEqual(['Biology']);
    expect(getDueQueue(undefined, NOW + 2).every((c) => c.deck_id === other.id)).toBe(true);
    // Soft deletes: the rows stay (with a tombstone) so the delete can sync.
    expect(rawQuery('SELECT count(*) AS n FROM cards WHERE deleted_at = ?', NOW + 1)).toEqual([
      { n: 5 },
    ]);
  });
});

describe('moving cards', () => {
  it('moves cards with their reverse cards, keeps their schedule, and can be undone', () => {
    const from = addDeck('Spanish');
    const to = addDeck('Vocabulary');
    const pair = createCard(
      { deckId: from.id, front: 'hola', back: 'hello', tags: [], reverse: true },
      NOW,
    );
    const [single] = addCards(from.id, 1);
    const reverse = rawQuery('SELECT id FROM cards WHERE reverse_of = ?', pair.id)[0] as {
      id: string;
    };
    answerNext(Rating.Good, NOW + 1000, from.id);
    const before = rawQuery('SELECT id, due, state, reps FROM cards ORDER BY id');

    // Selecting only the reverse card still moves the pair together.
    const moved = moveCards([reverse.id, single.id], to.id, NOW + 5000);
    expect(new Set(moved)).toEqual(new Set([pair.id, reverse.id, single.id]));
    expect(rawQuery('SELECT DISTINCT deck_id, updated_at FROM cards')).toEqual([
      { deck_id: to.id, updated_at: NOW + 5000 },
    ]);
    expect(rawQuery('SELECT id, due, state, reps FROM cards ORDER BY id')).toEqual(before);

    moveCards(moved, from.id, NOW + 6000); // undo
    expect(rawQuery('SELECT DISTINCT deck_id FROM cards')).toEqual([{ deck_id: from.id }]);
    expect(moveCards([], to.id)).toEqual([]);
  });
});

describe('recently deleted decks', () => {
  it('lists decks deleted in the last 30 days and restores them with their cards', () => {
    const deck = addDeck('Spanish');
    const [keep, alreadyGone] = addCards(deck.id, 2);
    deleteCards([alreadyGone.id], NOW + 1); // deleted on its own, earlier
    deleteDeck(deck.id, NOW + 2);
    expect(listDecks()).toEqual([]);

    const [deleted] = listDeletedDecks(NOW + 3);
    expect(deleted).toMatchObject({ id: deck.id, name: 'Spanish', cards: 1, deleted_at: NOW + 2 });

    restoreDecks([deck.id], NOW + 4);
    expect(listDecks().map((d) => d.name)).toEqual(['Spanish']);
    expect(rawQuery('SELECT id FROM cards WHERE deleted_at IS NULL')).toEqual([{ id: keep.id }]);
    expect(listDeletedDecks(NOW + 5)).toEqual([]);
    restoreDecks([deck.id], NOW + 6); // restoring twice changes nothing
    expect(listDecks()).toHaveLength(1);
  });

  it('hides decks deleted more than 30 days ago (their tombstones stay for sync)', () => {
    const deck = addDeck('Old');
    deleteDeck(deck.id, NOW);
    expect(listDeletedDecks(NOW + 29 * DAY)).toHaveLength(1);
    expect(listDeletedDecks(NOW + 31 * DAY)).toHaveLength(0);
    expect(rawQuery('SELECT deleted_at FROM decks')).toEqual([{ deleted_at: NOW }]);
  });
});
