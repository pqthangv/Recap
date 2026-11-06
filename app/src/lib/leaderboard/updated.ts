// "Updated 12 min ago" under the Everyone board (roadmap 6.8, 1.0.9): the Worker keeps that board
// for up to 30 minutes, so a new score can take that long to show. The Worker says how many
// minutes old the board was when it answered (so a wrong phone clock doesn't matter); the time
// since then is counted here, while the screen stays open.
import { t, tn } from '../i18n';

const MINUTE = 60_000;

/** Minutes since the board was worked out, or null if the answer didn't say (an older Worker). */
export function minutesSinceUpdate(
  minutesAgo: unknown,
  answeredAt: number,
  now: number,
): number | null {
  if (typeof minutesAgo !== 'number' || !Number.isFinite(minutesAgo) || minutesAgo < 0) {
    return null;
  }
  return Math.floor(minutesAgo) + Math.max(0, Math.floor((now - answeredAt) / MINUTE));
}

/** "Updated just now" / "Updated 12 min ago", or null when there's nothing to say. */
export function updatedText(minutesAgo: unknown, answeredAt: number, now: number): string | null {
  const minutes = minutesSinceUpdate(minutesAgo, answeredAt, now);
  if (minutes === null) return null;
  return minutes === 0 ? t('board.updatedJustNow') : tn('board.updatedMinutesAgo', minutes);
}
