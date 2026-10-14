// What the daily reminder says and when. Everything is worked out on the phone and handed to the
// system as plain notifications (no server): the app re-plans whenever it opens or goes to the
// background, so the text is right as long as nothing changed since, and studying always
// re-plans.
import { dayStart, dayStartOffset, ROLLOVER_HOUR } from './day';
import { t, tn } from './i18n';

/** How many days of reminders are planned ahead (iOS keeps at most 64 per app). */
export const REMINDER_DAYS = 14;

/** The streak's last call comes no earlier than this (minutes after midnight)… */
const LAST_CALL_EARLIEST = 21 * 60;
/** …at least this long after the daily reminder… */
const LAST_CALL_GAP = 90;
/** …and not later than this. Android may deliver it up to an hour late; the day ends at 4 AM. */
const LAST_CALL_LATEST = 23 * 60 + 30;

/** The next `count` times (epoch ms) at `minutes` after local midnight, strictly after `now`. */
export function reminderTimes(now: number, minutes: number, count = REMINDER_DAYS): number[] {
  const first = new Date(now);
  first.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (first.getTime() <= now) first.setDate(first.getDate() + 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d.getTime();
  });
}

/**
 * When the evening "your streak ends tonight" reminder goes, as minutes after midnight, for a
 * daily reminder at `minutes`; null if the daily reminder is itself that late (or after midnight).
 */
export function lastCallMinutes(minutes: number): number | null {
  if (minutes < ROLLOVER_HOUR * 60) return null;
  const at = Math.max(LAST_CALL_EARLIEST, minutes + LAST_CALL_GAP);
  return at <= LAST_CALL_LATEST ? at : null;
}

export function reminderText(dueCount: number): string {
  return t('reminder.body', { cards: tn('count.card', dueCount) });
}

/** "5-day streak! 8 new cards left today to keep it going." (or the evening's last call) */
export function streakText(days: number, newLeft: number, lastCall = false): string {
  if (newLeft > 0) {
    return t(lastCall ? 'reminder.lastCall' : 'reminder.streak', {
      n: days,
      cards: tn('count.newCard', newLeft),
    });
  }
  return t(lastCall ? 'reminder.lastCallAny' : 'reminder.streakAny', { n: days });
}

export type StreakState = {
  /** Days in a row with the goal met (up to yesterday until today's is met). */
  streak: number;
  goalMetToday: boolean;
};

/** Cards to study at a moment: in total, and new ones still needed for that day's goal. */
export type CountsAt = (at: number) => { total: number; new: number };

export type PlannedReminder = { at: number; body: string };

/**
 * The reminders for the next `days` days. Each day at `minutes`: the streak if it's at stake that
 * day, otherwise how many cards are due (days with nothing to study are skipped). The streak is
 * at stake today if it isn't kept yet, and tomorrow if today's is. Later days aren't known yet:
 * they say what's due, and the next time the app opens plans them again. On a day the streak is
 * at stake there is also a last call in the evening (see lastCallMinutes).
 */
export function planReminders({
  now,
  minutes,
  streak,
  countsAt,
  days = REMINDER_DAYS,
}: {
  now: number;
  minutes: number;
  streak: StreakState;
  countsAt: CountsAt;
  days?: number;
}): PlannedReminder[] {
  const today = dayStart(now);
  const tomorrow = dayStartOffset(now, 1);
  // The streak (in days) at stake on the study day that starts at `day`, or 0.
  const atStake = (day: number): number => {
    if (streak.streak <= 0) return 0;
    if (day === today) return streak.goalMetToday ? 0 : streak.streak;
    if (day === tomorrow) return streak.goalMetToday ? streak.streak : 0;
    return 0;
  };

  const plan: PlannedReminder[] = [];
  for (const at of reminderTimes(now, minutes, days)) {
    const counts = countsAt(at);
    if (counts.total === 0) continue;
    const run = atStake(dayStart(at));
    plan.push({ at, body: run ? streakText(run, counts.new) : reminderText(counts.total) });
  }

  const last = lastCallMinutes(minutes);
  if (last !== null) {
    for (const day of [today, tomorrow]) {
      const run = atStake(day);
      if (!run) continue;
      const at = new Date(day);
      at.setHours(Math.floor(last / 60), last % 60, 0, 0);
      const counts = countsAt(at.getTime());
      if (at.getTime() <= now || counts.total === 0) continue;
      plan.push({ at: at.getTime(), body: streakText(run, counts.new, true) });
    }
  }
  return plan.sort((a, b) => a.at - b.at);
}
