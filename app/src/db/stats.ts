import { and, gt, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';

import { dayStart, dayStartOffset } from '@/lib/day';
import { State } from '@/lib/scheduler';
import { forecast, streak } from '@/lib/stats';

import { db } from './client';
import { cards, decks, reviewLogs } from './schema';

export type Stats = {
  reviewedToday: number;
  streak: number;
  /** Cards due on each of the next 7 study days; `day` is when that day starts. */
  forecast: { day: number; count: number }[];
};

const FORECAST_DAYS = 7;
const answered = and(gt(reviewLogs.rating, 0), isNull(reviewLogs.deleted_at));

export function getStats(now = Date.now()): Stats {
  const today = db
    .select({ n: sql<number>`count(*)` })
    .from(reviewLogs)
    .where(and(answered, gte(reviewLogs.reviewed_at, dayStart(now))))
    .get();
  // One timestamp per 15 minutes is enough for the streak (every UTC offset is a multiple of 15
  // minutes, so no bucket straddles the 4 AM rollover); the study day is worked out in JS.
  const days = db
    .select({ t: sql<number>`max(${reviewLogs.reviewed_at})` })
    .from(reviewLogs)
    .where(answered)
    .groupBy(sql`${reviewLogs.reviewed_at} / 900000`)
    .all()
    .map((r) => r.t);
  const upcoming = db
    .select({ state: cards.state, due: cards.due })
    .from(cards)
    .where(
      and(
        isNull(cards.deleted_at),
        inArray(
          cards.deck_id,
          db.select({ id: decks.id }).from(decks).where(isNull(decks.deleted_at)),
        ),
        ne(cards.state, State.New),
        lt(cards.due, dayStartOffset(now, FORECAST_DAYS)),
      ),
    )
    .all();
  return {
    reviewedToday: today?.n ?? 0,
    streak: streak(days, now),
    forecast: forecast(upcoming, now, FORECAST_DAYS).map((count, i) => ({
      day: dayStartOffset(now, i),
      count,
    })),
  };
}
