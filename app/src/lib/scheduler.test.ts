import { dayStart, nextDayStart } from './day';
import {
  buildQueue,
  DEFAULT_RETENTION,
  countReadyNow,
  isDueForStudy,
  LEARN_AHEAD_MS,
  newCard,
  previewIntervals,
  Rating,
  resetCard,
  review,
  State,
  TWO_BUTTON_GRADES,
  type Grade,
  type SchedulableCard,
} from './scheduler';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime(); // 11 Oct 2026, noon local

function fresh(id = 'card-1', now = NOW): SchedulableCard {
  return { id, ...newCard(now) };
}

/** Take a new card through its learning steps until it is a Review card. */
function graduated(id = 'card-1'): { card: SchedulableCard; now: number } {
  let card = fresh(id);
  let now = NOW;
  for (let i = 0; i < 10 && card.state !== State.Review; i++) {
    card = { id, ...review(card, Rating.Good, now, 0.9).card };
    now = Math.max(now, card.due);
  }
  expect(card.state).toBe(State.Review);
  return { card, now };
}

describe('scheduler', () => {
  it('creates new cards in the New state, due now', () => {
    const card = newCard(NOW);
    expect(card.state).toBe(State.New);
    expect(card.due).toBe(NOW);
    expect(card.reps).toBe(0);
    expect(card.last_review).toBeNull();
  });

  it('new card + Good is due in the future', () => {
    const { card, log } = review(fresh(), Rating.Good, NOW, 0.9);
    expect(card.due).toBeGreaterThan(NOW);
    expect(card.reps).toBe(1);
    expect(card.last_review).toBe(NOW);
    // The log records the state before the answer, which is how "new cards today" is counted.
    expect(log.state).toBe(State.New);
    expect(log.rating).toBe(Rating.Good);
    expect(log.reviewed_at).toBe(NOW);
  });

  it('Again on a review card increments lapses and relearns', () => {
    const { card, now } = graduated();
    const later = now + card.scheduled_days * DAY;
    const { card: after } = review(card, Rating.Again, later, 0.9);
    expect(after.lapses).toBe(card.lapses + 1);
    expect(after.state).toBe(State.Relearning);
    expect(after.due - later).toBeLessThan(DAY);
  });

  it('previews match actual review results', () => {
    const { card, now } = graduated();
    const at = now + 3 * DAY;
    const preview = previewIntervals(card, at, 0.9);
    for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
      const actual = review(card, grade, at, 0.9);
      expect(preview[grade].result).toEqual(actual);
      expect(preview[grade].intervalMs).toBe(actual.card.due - at);
    }
  });

  it('fuzz is seeded by card id, not the clock', () => {
    const { card, now } = graduated();
    const at = now + 5 * DAY;
    const a = review(card, Rating.Good, at, 0.9).card;
    const b = review(card, Rating.Good, at + 30 * 1000, 0.9).card; // tapped 30 s later
    expect(b.scheduled_days).toBe(a.scheduled_days);
  });

  it('higher target retention gives shorter intervals', () => {
    const { card, now } = graduated();
    const at = now + 10 * DAY;
    const low = review(card, Rating.Good, at, 0.8).card.scheduled_days;
    const high = review(card, Rating.Good, at, 0.95).card.scheduled_days;
    expect(high).toBeLessThan(low);
  });

  it('two-button mode maps Forgot → Again and Got it → Good', () => {
    expect(TWO_BUTTON_GRADES).toEqual([Rating.Again, Rating.Good]);
  });

  it('reset starts a card over and logs a Manual rating', () => {
    const { card, now } = graduated();
    const { card: reset, log } = resetCard(card, now);
    expect(reset.state).toBe(State.New);
    expect(reset.reps).toBe(0);
    expect(reset.lapses).toBe(0);
    expect(log.rating).toBe(Rating.Manual);
  });
});

describe('isDueForStudy', () => {
  it('counts a Review card due later today as due', () => {
    const laterToday = dayStart(NOW) + 20 * 60 * MIN; // 8 PM
    expect(isDueForStudy({ state: State.Review, due: laterToday }, NOW)).toBe(true);
    expect(isDueForStudy({ state: State.Review, due: nextDayStart(NOW) }, NOW)).toBe(false);
  });

  it('uses exact time (plus learn-ahead) for learning cards', () => {
    expect(isDueForStudy({ state: State.Learning, due: NOW + 5 * MIN }, NOW)).toBe(true);
    expect(isDueForStudy({ state: State.Learning, due: NOW + LEARN_AHEAD_MS + 1 }, NOW)).toBe(
      false,
    );
  });

  it('never counts new cards as due', () => {
    expect(isDueForStudy({ state: State.New, due: NOW - DAY }, NOW)).toBe(false);
  });
});

describe('buildQueue', () => {
  const card = (id: string, state: State, due: number) => ({ id, state, due });
  const ids = (cards: { id: string }[]) => cards.map((c) => c.id);
  const unlimited = { newPerDay: 1000, newDoneToday: 0 };

  it('respects the daily new-card limit', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(`n${i}`, State.New, NOW));
    expect(buildQueue(cards, { newPerDay: 20, newDoneToday: 0 }, NOW)).toHaveLength(20);
    expect(buildQueue(cards, { newPerDay: 20, newDoneToday: 15 }, NOW)).toHaveLength(5);
    expect(buildQueue(cards, { newPerDay: 20, newDoneToday: 25 }, NOW)).toHaveLength(0);
  });

  it('keeps cards with a written order in that order, and still mixes the rest', () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`n${i}`, State.New, NOW));
    const order = (c: { id: string }) => {
      const n = Number(c.id.slice(1));
      return n < 5 ? n : undefined; // n0…n4 are the tutorial
    };
    const queue = ids(buildQueue(cards, unlimited, NOW, order));
    expect(queue.filter((id) => Number(id.slice(1)) < 5)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
    expect(queue).not.toEqual(ids(cards)); // the others are still shuffled
    expect(ids(buildQueue(cards.slice(0, 5), unlimited, NOW, order))).toEqual(
      ['n0', 'n1', 'n2', 'n3', 'n4'], // studying just that deck: fully in order
    );
  });

  it('puts learning cards first, mixes new cards into reviews, learn-ahead last', () => {
    const cards = [
      card('new', State.New, NOW),
      card('ahead', State.Learning, NOW + 5 * MIN),
      card('review-late', State.Review, NOW - DAY),
      card('review-later-today', State.Review, NOW + 60 * MIN),
      card('learning', State.Relearning, NOW - MIN),
      card('not-due', State.Review, NOW + 3 * DAY),
    ];
    expect(ids(buildQueue(cards, unlimited, NOW))).toEqual([
      'learning',
      'review-late',
      'new',
      'review-later-today',
      'ahead',
    ]);
  });

  it('shuffles new cards instead of showing them in the order they were added', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(`card-${i}`, State.New, NOW));
    const today = ids(buildQueue(cards, unlimited, NOW));
    expect(today).not.toEqual(ids(cards));
    expect([...today].sort()).toEqual(ids(cards).sort());
    // Stable while you study today (the queue is rebuilt after every answer)…
    expect(ids(buildQueue(cards, unlimited, NOW + 60 * MIN))).toEqual(today);
    // …but a different order tomorrow.
    expect(ids(buildQueue(cards, unlimited, NOW + DAY))).not.toEqual(today);
  });

  it('shuffles reviews due on the same day, most overdue day first', () => {
    const sameDay = Array.from({ length: 20 }, (_, i) =>
      card(`review-${i}`, State.Review, dayStart(NOW) + i * MIN),
    );
    const overdue = card('overdue', State.Review, NOW - 3 * DAY);
    const queue = ids(buildQueue([...sameDay, overdue], unlimited, NOW));
    expect(queue[0]).toBe('overdue');
    expect(queue.slice(1)).not.toEqual(ids(sameDay));
  });

  it('spreads new cards evenly between reviews', () => {
    const reviews = Array.from({ length: 6 }, (_, i) => card(`r${i}`, State.Review, NOW - DAY));
    const fresh = [card('n0', State.New, NOW), card('n1', State.New, NOW)];
    const pattern = buildQueue([...reviews, ...fresh], unlimited, NOW).map((c) =>
      c.state === State.New ? 'N' : 'R',
    );
    expect(pattern.join('')).toBe('RRNRRNRR');
  });
});

describe('spaced repetition over time', () => {
  /** Answer `rating` exactly when the card is due. */
  const answerWhenDue = (card: SchedulableCard, rating: Grade): SchedulableCard => ({
    id: card.id,
    ...review(card, rating, card.due, 0.9).card,
  });

  it('the default retention keeps gaps gentle (no jump past a year in 8 reviews)', () => {
    let card: SchedulableCard = { id: 'gentle', ...newCard(NOW) };
    const days: number[] = [];
    for (let i = 0; i < 9; i++) {
      card = { id: card.id, ...review(card, Rating.Good, card.due, DEFAULT_RETENTION).card };
      if (card.scheduled_days > 0) days.push(card.scheduled_days);
    }
    expect(DEFAULT_RETENTION).toBe(0.95);
    expect(days.every((d, i) => i === 0 || d > days[i - 1])).toBe(true);
    expect(Math.max(...days)).toBeLessThan(400);
  });

  it('waits longer after every successful review', () => {
    let { card } = graduated();
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      card = answerWhenDue(card, Rating.Good);
      intervals.push(card.scheduled_days);
    }
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
    expect(intervals[intervals.length - 1]).toBeGreaterThan(30); // a month+ after 6 reviews
  });

  it('Easy waits longer than Good, Good longer than Hard, Hard longer than Again', () => {
    const { card } = graduated();
    const p = previewIntervals(card, card.due, 0.9);
    expect(p[Rating.Easy].intervalMs).toBeGreaterThan(p[Rating.Good].intervalMs);
    expect(p[Rating.Good].intervalMs).toBeGreaterThan(p[Rating.Hard].intervalMs);
    expect(p[Rating.Hard].intervalMs).toBeGreaterThan(p[Rating.Again].intervalMs);
  });

  it('a forgotten card comes back soon, then restarts from a shorter interval', () => {
    let { card } = graduated();
    for (let i = 0; i < 3; i++) card = answerWhenDue(card, Rating.Good);
    const before = card.scheduled_days;
    const lapsed = answerWhenDue(card, Rating.Again);
    expect(lapsed.due - card.due).toBeLessThan(60 * MIN);
    expect(lapsed.lapses).toBe(card.lapses + 1);
    const relearned = answerWhenDue(lapsed, Rating.Good);
    expect(relearned.state).toBe(State.Review);
    expect(relearned.scheduled_days).toBeLessThan(before);
  });
});

describe('countReadyNow', () => {
  it('leaves out learning cards that are still waiting', () => {
    const queue = [
      { state: State.New, due: NOW },
      { state: State.Review, due: NOW + 60 * MIN },
      { state: State.Learning, due: NOW - MIN },
      { state: State.Learning, due: NOW + 10 * MIN },
    ];
    expect(countReadyNow(queue, NOW)).toBe(3);
  });
});
