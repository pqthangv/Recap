import { clearTestDb, migrateTestDb, rawQuery } from '../../test/db';

import { exportBackup, exportCardsCsv, importBackup } from './backup';
import { createCard, deleteCards, getCardForEdit, restoreCards, updateCard } from './cards';
import { createDeck, deleteDeck, listDecks } from './decks';
import { setSetting } from './settings';
import { getStats } from './stats';
import {
  answerCard,
  getDueQueue,
  getNewDoneToday,
  getStudyCounts,
  resetDeckSchedule,
  undoAnswer,
} from './study';

import { parseBackup } from '@/lib/backup';
import { previewIntervals, Rating, review, State } from '@/lib/scheduler';
import { seedIfNeeded, WELCOME_DECKS } from '@/features/onboarding/seed';

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
    expect(listDecks().map((d) => d.name)).toEqual(WELCOME_DECKS.map((d) => d.name));
    const total = WELCOME_DECKS.reduce((n, d) => n + d.cards.length, 0);
    expect(rawQuery('select count(*) as n from cards')[0].n).toBe(total);

    for (const d of listDecks()) deleteDeck(d.id, NOW);
    expect(seedIfNeeded(NOW)).toBe(false);
    expect(listDecks()).toHaveLength(0);
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
  it('counts today, the streak and the next 7 days', () => {
    // One card per deck, so each day's answer is a different (new) card.
    for (const daysAgo of [2, 1, 0]) {
      const deck = addDeck(`Deck ${daysAgo}`);
      addCards(deck.id, 1);
      answerNext(Rating.Good, NOW - daysAgo * DAY, deck.id);
    }
    const stats = getStats(NOW);
    expect(stats.reviewedToday).toBe(1);
    expect(stats.streak).toBe(3);
    expect(stats.forecast).toHaveLength(7);
    expect(stats.forecast[0].count).toBe(3); // all three are learning cards due today
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

  it('rejects files that are not Recap backups', () => {
    expect(() => parseBackup('hello')).toThrow('Not a JSON file');
    expect(() => parseBackup('{"format":"other"}')).toThrow('Not a Recap backup');
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
