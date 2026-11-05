import { and, eq, gt, gte, isNull, sql } from 'drizzle-orm';

import { dayKey, dayStartOffset } from '@/lib/day';
import { streakUntil, weekOf, weekStart, type BoardScore } from '@/lib/leaderboard/score';
import { State } from '@/lib/scheduler';
import { lastDays, streak, type DayTotals } from '@/lib/stats';

import { db } from './client';
import { reviewLogs } from './schema';
import { getDailyGoal, type DailyGoal } from './study';

export type Stats = {
  /** Cards answered today, `newToday` of them for the first time. */
  reviewedToday: number;
  newToday: number;
  /** New cards learned today and today's goal; meeting the goal keeps the streak. */
  goal: DailyGoal;
  goalMetToday: boolean;
  /** Days in a row with the new-card goal met (up to yesterday until today's is met). */
  streak: number;
  /** Time spent answering (ms), today and ever. */
  timeToday: number;
  timeTotal: number;
  /** The last 7 study days, oldest first (the last is today). */
  lastWeek: DayTotals[];
};

const WEEK = 7;
const answered = and(gt(reviewLogs.rating, 0), isNull(reviewLogs.deleted_at));
// Reviews are added up per 15 minutes: every UTC offset is a multiple of 15 minutes, so no slot
// straddles the 4 AM rollover, and the study day of each slot is worked out in JS.
const slot = sql`${reviewLogs.reviewed_at} / 900000`;

/** When the new-card goal was met: one time per 15 minutes is enough to tell the days apart. */
function goalMetTimes(): number[] {
  return db
    .select({ t: sql<number>`max(${reviewLogs.reviewed_at})` })
    .from(reviewLogs)
    .where(and(answered, eq(reviewLogs.goal_met, 1)))
    .groupBy(slot)
    .all()
    .map((r) => r.t);
}

export function getStats(now = Date.now()): Stats {
  const days = goalMetTimes();
  const recent = db
    .select({
      t: sql<number>`max(${reviewLogs.reviewed_at})`,
      cards: sql<number>`count(*)`,
      // A log's state is the card's state before the answer, so New = seen for the first time.
      newCards: sql<number>`sum(case when ${reviewLogs.state} = ${State.New} then 1 else 0 end)`,
      ms: sql<number>`sum(${reviewLogs.duration_ms})`,
    })
    .from(reviewLogs)
    .where(and(answered, gte(reviewLogs.reviewed_at, dayStartOffset(now, 1 - WEEK))))
    .groupBy(slot)
    .all();
  const total = db
    .select({ ms: sql<number>`coalesce(sum(${reviewLogs.duration_ms}), 0)` })
    .from(reviewLogs)
    .where(answered)
    .get();
  const lastWeek = lastDays(recent, now, WEEK);
  const today = lastWeek[WEEK - 1];
  return {
    reviewedToday: today.cards,
    newToday: today.newCards,
    goal: getDailyGoal(now),
    goalMetToday: days.some((t) => dayKey(t) === dayKey(now)),
    streak: streak(days, now),
    timeToday: today.ms,
    timeTotal: total?.ms ?? 0,
    lastWeek,
  };
}

/** Statistics' streak on its own (days in a row with the new-card goal met). */
export function getStreak(now = Date.now()): number {
  return streak(goalMetTimes(), now);
}

/** What the leaderboard gets (lib/leaderboard/score.ts): the streak above and this week's cards. */
export function getBoardScore(now = Date.now()): BoardScore {
  const times = goalMetTimes();
  const inARow = streak(times, now);
  const week = db
    .select({ cards: sql<number>`count(*)` })
    .from(reviewLogs)
    .where(and(answered, gte(reviewLogs.reviewed_at, weekStart(now))))
    .get();
  return {
    streak: inARow,
    streakUntil: streakUntil(
      inARow,
      times.some((t) => dayKey(t) === dayKey(now)),
      now,
    ),
    week: weekOf(now),
    weekCards: week?.cards ?? 0,
  };
}
