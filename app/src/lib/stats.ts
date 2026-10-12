import { dayKey, dayStartOffset } from './day';

/**
 * Consecutive study days with at least one review, ending today. If nothing has been reviewed
 * today yet, the streak still counts up to yesterday (it isn't broken until the day is over).
 */
export function streak(reviewTimes: readonly number[], now: number): number {
  const days = new Set(reviewTimes.map(dayKey));
  let offset = days.has(dayKey(now)) ? 0 : -1;
  let count = 0;
  while (days.has(dayKey(dayStartOffset(now, offset)))) {
    count++;
    offset--;
  }
  return count;
}

/** One study day: cards answered (`newCards` of them for the first time) and time spent. */
export type DayTotals = { day: number; cards: number; newCards: number; ms: number };

/**
 * Totals for each of the last `days` study days, oldest first (the last is today); `day` is when
 * that day starts. `reviews` are single answers or answers already added up per time slot, with
 * `t` = when; anything outside those days is ignored.
 */
export function lastDays(
  reviews: readonly ({ t: number } & Omit<DayTotals, 'day'>)[],
  now: number,
  days = 7,
): DayTotals[] {
  const starts = Array.from({ length: days + 1 }, (_, i) => dayStartOffset(now, i - days + 1));
  const out = starts.slice(0, days).map((day) => ({ day, cards: 0, newCards: 0, ms: 0 }));
  for (const { t, cards, newCards, ms } of reviews) {
    for (let i = 0; i < days; i++) {
      if (t >= starts[i] && t < starts[i + 1]) {
        out[i].cards += cards;
        out[i].newCards += newCards;
        out[i].ms += ms;
        break;
      }
    }
  }
  return out;
}
