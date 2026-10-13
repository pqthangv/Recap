// The only place that talks to ts-fsrs. Never write scheduling math by hand — call these.
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  GenSeedStrategyWithCardId,
  Rating,
  State,
  StrategyMode,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
  type RecordLogItem,
} from 'ts-fsrs';

import { dayKey, dayStart, nextDayStart } from './day';

export { Rating, State };
export type { Grade };

// 95% rather than FSRS's usual 90%: gaps grow more gently (10d → 19d → 48d → 97d …), which
// suits studying for exams. Users can choose 80–95% in Settings.
export const DEFAULT_RETENTION = 0.95;
export const MIN_RETENTION = 0.8;
export const MAX_RETENTION = 0.95;

/** Learning cards due within this window may be shown early when nothing else is left. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

/** The FSRS columns of a card row: ts-fsrs's `Card` with dates as epoch ms. */
export type FsrsFields = {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
};

/** A card the scheduler can work on. The id seeds the interval fuzz. */
export type SchedulableCard = FsrsFields & { id: string };

/** The FSRS columns of a review log row: ts-fsrs's `ReviewLog`, `review` stored as `reviewed_at`. */
export type LogFields = {
  rating: number;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reviewed_at: number;
};

export type ReviewResult = { card: FsrsFields; log: LogFields };

/** Grades for the two-button mode: Forgot → Again, Got it → Good. */
export const TWO_BUTTON_GRADES = [Rating.Again, Rating.Good] as const satisfies readonly Grade[];
export const FOUR_BUTTON_GRADES = [
  Rating.Again,
  Rating.Hard,
  Rating.Good,
  Rating.Easy,
] as const satisfies readonly Grade[];

export function clampRetention(retention: number): number {
  if (!Number.isFinite(retention)) return DEFAULT_RETENTION;
  return Math.min(MAX_RETENTION, Math.max(MIN_RETENTION, retention));
}

const schedulers = new Map<number, FSRS>();

// Fuzz is on, and seeded by card id + review count instead of the clock. That keeps the interval
// shown on a button identical to the one applied when it's tapped, and makes a review history
// replay to the same schedule on any device (useful for sync later).
function scheduler(retention: number): FSRS {
  const r = clampRetention(retention);
  let f = schedulers.get(r);
  if (!f) {
    f = fsrs(
      generatorParameters({ request_retention: r, enable_fuzz: true, enable_short_term: true }),
    ).useStrategy(StrategyMode.SEED, GenSeedStrategyWithCardId('id'));
    schedulers.set(r, f);
  }
  return f;
}

function toFsrs(card: SchedulableCard): FsrsCard & { id: string } {
  return {
    id: card.id,
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.last_review == null ? undefined : new Date(card.last_review),
  };
}

function fromFsrs(card: FsrsCard): FsrsFields {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

function fromRecord(item: RecordLogItem): ReviewResult {
  const { log } = item;
  return {
    card: fromFsrs(item.card),
    log: {
      rating: log.rating,
      state: log.state,
      due: log.due.getTime(),
      stability: log.stability,
      difficulty: log.difficulty,
      elapsed_days: log.elapsed_days,
      last_elapsed_days: log.last_elapsed_days,
      scheduled_days: log.scheduled_days,
      learning_steps: log.learning_steps,
      reviewed_at: log.review.getTime(),
    },
  };
}

/** FSRS fields for a brand-new card, due now. */
export function newCard(now: number): FsrsFields {
  return fromFsrs(createEmptyCard(new Date(now)));
}

/** Apply an answer. Pass the same `now` that was used for `previewIntervals`. */
export function review(
  card: SchedulableCard,
  rating: Grade,
  now: number,
  retention: number,
): ReviewResult {
  return fromRecord(scheduler(retention).next(toFsrs(card), new Date(now), rating));
}

export type Preview = { result: ReviewResult; intervalMs: number };

/** What each grade would do, without saving anything. */
export function previewIntervals(
  card: SchedulableCard,
  now: number,
  retention: number,
): Record<Grade, Preview> {
  const preview = scheduler(retention).repeat(toFsrs(card), new Date(now));
  const out = {} as Record<Grade, Preview>;
  for (const grade of FOUR_BUTTON_GRADES) {
    const result = fromRecord(preview[grade]);
    out[grade] = { result, intervalMs: Math.max(0, result.card.due - now) };
  }
  return out;
}

/** Start a card over as new (keeps its id; the returned log records the reset). */
export function resetCard(card: SchedulableCard, now: number): ReviewResult {
  return fromRecord(scheduler(DEFAULT_RETENTION).forget(toFsrs(card), new Date(now), true));
}

/**
 * Is this (non-new) card ready to study? FSRS intervals are whole days, so a Review card is due for
 * the whole study day it falls on. Learning/relearning steps are minutes, so they use the exact
 * time, plus LEARN_AHEAD_MS so a session can finish its learning cards instead of stopping early.
 * Home counts, deck counts, reminders and the study queue all use this one rule.
 * `nextDay` is nextDayStart(now): pass it when checking many cards, it's slow to work out.
 */
export function isDueForStudy(
  card: Pick<FsrsFields, 'state' | 'due'>,
  now: number,
  nextDay = nextDayStart(now),
): boolean {
  if (card.state === State.New) return false;
  if (card.state === State.Review) return card.due < nextDay;
  return card.due <= now + LEARN_AHEAD_MS;
}

/** No card with `due` at or after this can be due for study at `now` (for SQL pre-filters). */
export function dueCutoff(now: number): number {
  return Math.max(nextDayStart(now), now + LEARN_AHEAD_MS + 1);
}

export type QueueLimits = {
  /** New cards allowed per study day. */
  newPerDay: number;
  /** New cards already introduced today. */
  newDoneToday: number;
};

export function newCardsRemaining(limits: QueueLimits): number {
  return Math.max(0, limits.newPerDay - limits.newDoneToday);
}

type QueueCard = Pick<FsrsFields, 'state' | 'due'> & { id: string };

/** 32-bit FNV-1a: a cheap, deterministic hash for shuffling. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Spread new cards evenly between reviews (R R N R R N R …) instead of saving them all for the
 * end, so a session mixes old and new material.
 */
function interleave<T>(reviews: readonly T[], fresh: readonly T[]): T[] {
  const out: T[] = [];
  const gap = (reviews.length + 1) / (fresh.length + 1);
  let r = 0;
  fresh.forEach((card, i) => {
    const before = Math.min(reviews.length, Math.floor(gap * (i + 1)));
    while (r < before) out.push(reviews[r++]);
    out.push(card);
  });
  while (r < reviews.length) out.push(reviews[r++]);
  return out;
}

/**
 * Order the cards to study next. FSRS decides *when* a card is due; this decides the order within
 * a session:
 *   1. learning/relearning cards due now, by exact due time (their steps are minutes long),
 *   2. review cards due today, most overdue day first and shuffled within a day, with
 *      new cards (shuffled, up to the daily limit) spread evenly between them,
 *   3. learning cards due within LEARN_AHEAD_MS, so a session can finish them.
 * The shuffle is seeded by the study day, so the order is stable while you study (the queue is
 * rebuilt after every answer) but different every day — cards never come in the order they were
 * added or learned.
 */
/**
 * Keeps some cards in the order they were written while everything else is shuffled: they fill
 * the places the shuffle gave them, in `orderOf` order. Used for the "How to use Recap" deck.
 */
function keepWrittenOrder<T>(list: T[], orderOf: (c: T) => number | undefined): T[] {
  const ordered = list
    .filter((c) => orderOf(c) !== undefined)
    .sort((a, b) => (orderOf(a) ?? 0) - (orderOf(b) ?? 0));
  if (ordered.length === 0) return list;
  let next = 0;
  return list.map((c) => (orderOf(c) === undefined ? c : ordered[next++]));
}

export function buildQueue<T extends QueueCard>(
  cards: T[],
  limits: QueueLimits,
  now: number,
  /** For new cards that must keep their written order: their place in it; else undefined. */
  writtenOrder: (c: T) => number | undefined = () => undefined,
): T[] {
  const learningNow: T[] = [];
  const reviews: T[] = [];
  const fresh: T[] = [];
  const learnAhead: T[] = [];
  const nextDay = nextDayStart(now);
  for (const c of cards) {
    if (c.state === State.New) fresh.push(c);
    else if (!isDueForStudy(c, now, nextDay)) continue;
    else if (c.state === State.Review) reviews.push(c);
    else if (c.due <= now) learningNow.push(c);
    else learnAhead.push(c);
  }
  const byDue = (a: T, b: T) => a.due - b.due || a.id.localeCompare(b.id);
  learningNow.sort(byDue);
  learnAhead.sort(byDue);
  // Sort keys are worked out once per card, not in every comparison: with thousands of cards due,
  // dates and hashes in the comparator made each answer in a 10,000-card deck take half a second.
  const seed = dayKey(now);
  const shuffle = (list: T[], dayOf: (c: T) => number) =>
    list
      .map((c) => ({ c, day: dayOf(c), mix: hash(`${seed}:${c.id}`) }))
      .sort((a, b) => a.day - b.day || a.mix - b.mix || a.c.id.localeCompare(b.c.id))
      .map(({ c }) => c);
  const reviewsInOrder = shuffle(reviews, (c) => dayStart(c.due));
  const freshInOrder = keepWrittenOrder(
    shuffle(fresh, () => 0),
    writtenOrder,
  ).slice(0, newCardsRemaining(limits));
  return [...learningNow, ...interleave(reviewsInOrder, freshInOrder), ...learnAhead];
}

/**
 * How many cards in a queue can be shown right now. Learning cards waiting out a short step
 * (shown early only when nothing else is left) aren't counted, so "N left" goes down as you
 * answer instead of staying put while a card waits 10 minutes.
 */
export function countReadyNow(queue: readonly Pick<FsrsFields, 'state' | 'due'>[], now: number) {
  return queue.filter((c) => c.state === State.New || c.state === State.Review || c.due <= now)
    .length;
}
