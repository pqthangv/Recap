// One definition of "today" for the whole app: the new-card limit, "reviewed today", the streak,
// the due cutoff and the 7-day forecast all use these functions.
//
// A study day starts at 4 AM local time, so a late-night session still counts as the same day.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ROLLOVER_HOUR = 4;

/** Start (epoch ms) of the study day containing `now`. */
export function dayStart(now: number): number {
  const d = new Date(now);
  d.setHours(ROLLOVER_HOUR, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** Start of the study day `offset` days after the one containing `now` (DST-safe). */
export function dayStartOffset(now: number, offset: number): number {
  const d = new Date(dayStart(now));
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

/** Start of the next study day. */
export function nextDayStart(now: number): number {
  return dayStartOffset(now, 1);
}

export function isSameStudyDay(a: number, b: number): boolean {
  return dayStart(a) === dayStart(b);
}

/** Stable key for a study day, e.g. "2026-10-11". */
export function dayKey(now: number): string {
  const d = new Date(dayStart(now));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
