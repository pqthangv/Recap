import { dayKey, dayStartOffset } from './day';
import { isDueForStudy, State } from './scheduler';

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

/**
 * Cards due on each of the next `days` study days. Day 0 (today) includes everything due now,
 * including overdue cards. New cards aren't counted.
 */
export function forecast(
  cards: readonly { state: number; due: number }[],
  now: number,
  days = 7,
): number[] {
  const out = new Array<number>(days).fill(0);
  const starts = Array.from({ length: days + 1 }, (_, i) => dayStartOffset(now, i));
  for (const c of cards) {
    if (c.state === State.New) continue;
    if (isDueForStudy(c, now) || c.due < starts[1]) {
      out[0]++;
      continue;
    }
    for (let i = 1; i < days; i++) {
      if (c.due < starts[i + 1]) {
        out[i]++;
        break;
      }
    }
  }
  return out;
}
