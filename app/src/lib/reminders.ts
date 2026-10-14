import { t, tn } from './i18n';

/** The next `count` times (epoch ms) at `minutes` after local midnight, strictly after `now`. */
export function reminderTimes(now: number, minutes: number, count = 7): number[] {
  const first = new Date(now);
  first.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (first.getTime() <= now) first.setDate(first.getDate() + 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d.getTime();
  });
}

export function reminderText(dueCount: number): string {
  return t('reminder.body', { cards: tn('count.card', dueCount) });
}
