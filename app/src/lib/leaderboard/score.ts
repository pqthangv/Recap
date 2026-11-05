// What this phone sends to the leaderboard (roadmap 6.8, sync/src/board.ts): the streak from
// Statistics (days in a row with the new-card goal met) and the cards answered this week. The
// board works out on its own when a streak ends, from `streakUntil`, so nothing has to be sent
// when a day ends. Scores go after a sync (the cards from the other devices are in by then) and
// only when they changed: a new streak or a new week right away, more cards at most hourly.
import { dayStartOffset } from '../day';

export type BoardScore = { streak: number; streakUntil: number; week: string; weekCards: number };

/** What this phone last sent, and whether the account is on the board (false: it wasn't then). */
export type Sent = { joined: boolean; at: number; score?: BoardScore };

const DAY_MS = 24 * 60 * 60 * 1000;
/** New cards this week are sent at most this often (a changed streak goes right away). */
export const SEND_GAP_MS = 60 * 60_000;
/** Not on the board: asked again after a day (joining on another phone puts this one on too). */
export const NOT_JOINED_GAP_MS = DAY_MS;

/**
 * Monday 00:00 UTC of the week holding `now`, e.g. "2026-11-02": the same for everyone. A copy of
 * weekOf in sync/src/board.ts (keep the two the same).
 */
export function weekOf(now: number): string {
  const day = Math.floor(now / DAY_MS);
  // 1970-01-01 was a Thursday.
  const monday = day - ((day + 3) % 7);
  return new Date(monday * DAY_MS).toISOString().slice(0, 10);
}

/** When this week started (ms): its answers are the week's cards. */
export const weekStart = (now: number) => Date.parse(weekOf(now));

/**
 * Until when a streak counts: the end of the day after its last day (tomorrow's, once today's goal
 * is met; else today's). 0 for no streak.
 */
export function streakUntil(streak: number, goalMetToday: boolean, now: number): number {
  if (streak === 0) return 0;
  return dayStartOffset(now, goalMetToday ? 2 : 1);
}

const same = (a: BoardScore, b: BoardScore) =>
  a.streak === b.streak &&
  a.streakUntil === b.streakUntil &&
  a.week === b.week &&
  a.weekCards === b.weekCards;

/**
 * Whether to send `score` now. `soon`: the Leaderboard screen is opening, or the names were just
 * saved, so anything new goes now.
 */
export function shouldSend(
  sent: Sent | null,
  score: BoardScore,
  now: number,
  soon = false,
): boolean {
  if (!sent) return true;
  if (!sent.joined) return soon || now - sent.at >= NOT_JOINED_GAP_MS;
  if (!sent.score) return true;
  if (same(sent.score, score)) return false;
  if (soon || score.streak !== sent.score.streak || score.week !== sent.score.week) return true;
  return now - sent.at >= SEND_GAP_MS;
}

/** A saved Sent, or null if it isn't one. */
export function parseSent(value: unknown): Sent | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<Sent>;
  if (typeof v.joined !== 'boolean' || typeof v.at !== 'number') return null;
  const s = v.score;
  const score =
    s &&
    typeof s.streak === 'number' &&
    typeof s.streakUntil === 'number' &&
    typeof s.week === 'string' &&
    typeof s.weekCards === 'number'
      ? s
      : undefined;
  return { joined: v.joined, at: v.at, ...(score ? { score } : {}) };
}
