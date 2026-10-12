// Due queue, counts and answering. Every count goes through scheduler.isDueForStudy and
// scheduler.buildQueue, so the home screen, deck rows, reminders and the session always agree.
import { and, eq, gt, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';

import { dayStart, isSameStudyDay, nextDayStart } from '@/lib/day';
import { newId } from '@/lib/id';
import {
  buildQueue,
  dueCutoff,
  isDueForStudy,
  newCardsRemaining,
  resetCard,
  State,
  type FsrsFields,
  type QueueLimits,
  type ReviewResult,
} from '@/lib/scheduler';

import { db } from './client';
import { cards, decks, reviewLogs, type CardRow } from './schema';
import { getSettings } from './settings';
import { transaction } from './transaction';

const liveDeckIds = db.select({ id: decks.id }).from(decks).where(isNull(decks.deleted_at));
const liveCard = and(isNull(cards.deleted_at), inArray(cards.deck_id, liveDeckIds));
/** What to study: one deck id, several (a deck group), or undefined for all decks. */
export type StudyScope = string | readonly string[] | undefined;

const inScope = (scope: StudyScope) =>
  scope === undefined
    ? undefined
    : typeof scope === 'string'
      ? eq(cards.deck_id, scope)
      : inArray(cards.deck_id, [...scope]);

/** New cards introduced (answered for the first time) during the current study day. */
export function getNewDoneToday(now: number): number {
  const row = db
    .select({ n: sql<number>`count(distinct ${reviewLogs.card_id})` })
    .from(reviewLogs)
    .where(
      and(
        gte(reviewLogs.reviewed_at, dayStart(now)),
        eq(reviewLogs.state, State.New),
        gt(reviewLogs.rating, 0),
        isNull(reviewLogs.deleted_at),
      ),
    )
    .get();
  return row?.n ?? 0;
}

/** Cards in live decks that have never been answered. */
function newCardsLeft(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(cards)
    .where(and(liveCard, eq(cards.state, State.New)))
    .get();
  return row?.n ?? 0;
}

export type DailyGoal = { done: number; goal: number };

/**
 * Today's new-card goal: "New cards per day", or every new card that's left if there are fewer.
 * A study day counts for the streak once it's met (see answerCard).
 */
export function getDailyGoal(now = Date.now()): DailyGoal {
  const done = getNewDoneToday(now);
  return { done, goal: Math.min(getSettings().newPerDay, done + newCardsLeft()) };
}

export function getLimits(now: number): QueueLimits {
  return { newPerDay: getSettings().newPerDay, newDoneToday: getNewDoneToday(now) };
}

const queueColumns = { id: cards.id, state: cards.state, due: cards.due };
export type QueueEntry = { id: string; state: number; due: number };

/**
 * The order to study cards in, as just id/state/due: cheap even with thousands of cards due, so
 * the session rebuilds it after every answer and loads only the card on screen.
 * `scope` limits it to one deck or a group of decks.
 */
export function getQueueOrder(scope: StudyScope, now = Date.now()): QueueEntry[] {
  if (Array.isArray(scope) && scope.length === 0) return [];
  const limits = getLimits(now);
  // New cards are shuffled across the whole deck, so all of them are candidates.
  const due = db
    .select(queueColumns)
    .from(cards)
    .where(and(liveCard, inScope(scope), ne(cards.state, State.New), lt(cards.due, dueCutoff(now))))
    .all();
  const fresh =
    newCardsRemaining(limits) > 0
      ? db
          .select(queueColumns)
          .from(cards)
          .where(and(liveCard, inScope(scope), eq(cards.state, State.New)))
          .all()
      : [];
  return buildQueue([...due, ...fresh], limits, now);
}

/** The cards to study next, in order, as full rows. */
export function getDueQueue(scope: StudyScope, now = Date.now()): CardRow[] {
  const order = getQueueOrder(scope, now).map((c) => c.id);
  const rows = new Map<string, CardRow>();
  for (let i = 0; i < order.length; i += 500) {
    const ids = order.slice(i, i + 500);
    for (const row of db.select().from(cards).where(inArray(cards.id, ids)).all()) {
      rows.set(row.id, row);
    }
  }
  return order.flatMap((id) => rows.get(id) ?? []);
}

export type DeckCounts = { due: number; new: number };
export type StudyCounts = DeckCounts & { total: number; byDeck: Record<string, DeckCounts> };

/** Due and new counts per deck and in total, as of `at`. */
export function getStudyCounts(now = Date.now(), at = now): StudyCounts {
  // The new-card allowance resets each study day; reminders ask about later days.
  const remaining = isSameStudyDay(now, at)
    ? newCardsRemaining(getLimits(now))
    : getSettings().newPerDay;
  const byDeck: Record<string, DeckCounts> = {};
  const deck = (id: string) => (byDeck[id] ??= { due: 0, new: 0 });

  let due = 0;
  const candidates = db
    .select({ deck_id: cards.deck_id, state: cards.state, due: cards.due })
    .from(cards)
    .where(and(liveCard, ne(cards.state, State.New), lt(cards.due, dueCutoff(at))))
    .all();
  const nextDay = nextDayStart(at);
  for (const c of candidates) {
    if (!isDueForStudy(c, at, nextDay)) continue;
    deck(c.deck_id).due++;
    due++;
  }

  let fresh = 0;
  const newCounts = db
    .select({ deck_id: cards.deck_id, n: sql<number>`count(*)` })
    .from(cards)
    .where(and(liveCard, eq(cards.state, State.New)))
    .groupBy(cards.deck_id)
    .all();
  for (const { deck_id, n } of newCounts) {
    deck(deck_id).new = Math.min(n, remaining);
    fresh += n;
  }
  fresh = Math.min(fresh, remaining);
  return { due, new: fresh, total: due + fresh, byDeck };
}

const fsrsColumns = (c: FsrsFields): FsrsFields => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review,
});

/** Saves an answer: the card's new schedule plus one review log row. Returns the log id. */
export function answerCard(
  cardId: string,
  result: ReviewResult,
  durationMs: number,
  now = Date.now(),
): string {
  const logId = newId();
  transaction(() => {
    db.update(cards)
      .set({ ...fsrsColumns(result.card), updated_at: now })
      .where(eq(cards.id, cardId))
      .run();
    // Does this answer meet today's new-card goal? (Logs are never edited, so it's decided now.)
    const firstTime = result.log.state === State.New && result.log.rating > 0;
    const done = getNewDoneToday(now) + (firstTime ? 1 : 0);
    const goal = Math.min(getSettings().newPerDay, done + newCardsLeft());
    db.insert(reviewLogs)
      .values({
        id: logId,
        card_id: cardId,
        ...result.log,
        duration_ms: Math.max(0, Math.round(durationMs)),
        goal_met: done >= goal ? 1 : 0,
        deleted_at: null,
      })
      .run();
  });
  return logId;
}

/**
 * Undo an answer: put the card's schedule back exactly as it was and tombstone the log
 * (review logs are never edited or removed).
 */
export function undoAnswer(before: CardRow, logId: string, now = Date.now()): void {
  transaction(() => {
    db.update(cards)
      .set({ ...fsrsColumns(before), updated_at: now })
      .where(eq(cards.id, before.id))
      .run();
    db.update(reviewLogs).set({ deleted_at: now }).where(eq(reviewLogs.id, logId)).run();
  });
}

/** Start every card in a deck over as new. Each reset is logged (rating 0, "Manual"). */
export function resetDeckSchedule(deckId: string, now = Date.now()): number {
  const rows = db
    .select()
    .from(cards)
    .where(and(eq(cards.deck_id, deckId), isNull(cards.deleted_at)))
    .all()
    .filter((c) => c.state !== State.New || c.reps > 0);
  transaction(() => {
    for (const card of rows) {
      const { card: next, log } = resetCard(card, now);
      db.update(cards)
        .set({ ...fsrsColumns(next), updated_at: now })
        .where(eq(cards.id, card.id))
        .run();
      db.insert(reviewLogs)
        .values({ id: newId(), card_id: card.id, ...log, duration_ms: 0, deleted_at: null })
        .run();
    }
  });
  return rows.length;
}
