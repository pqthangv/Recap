import { language, localeTag, t, tn } from './i18n';

export { count } from './i18n';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Label for the main home-screen button, e.g. "Study · 12 due". */
export function studyButtonLabel(dueCount: number): string {
  return t('home.study', { n: dueCount });
}

/** 2.5 → "2.5" ("2,5" in Vietnamese); whole numbers without a decimal. */
function oneDecimal(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (Number.isInteger(r)) return String(r);
  const text = r.toFixed(1);
  return language() === 'vi' ? text.replace('.', ',') : text;
}

/** Short interval for a grade button: "1m", "10m", "3h", "4d", "2.5mo", "1.2y". */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return t('interval.underMinute');
  if (ms < HOUR) return t('interval.minutes', { n: Math.round(ms / MINUTE) });
  if (ms < DAY) return t('interval.hours', { n: Math.round(ms / HOUR) });
  if (ms < MONTH) return t('interval.days', { n: Math.round(ms / DAY) });
  if (ms < YEAR) return t('interval.months', { n: oneDecimal(ms / MONTH) });
  return t('interval.years', { n: oneDecimal(ms / YEAR) });
}

/** Time spent studying: "<1 min", "12 min", "1 h 5 min", "3 h". */
export function formatStudyTime(ms: number): string {
  if (ms <= 0) return t('time.studyNone');
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 1) return t('time.studyUnderMinute');
  if (minutes < 60) return t('time.studyMinutes', { m: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t('time.studyHoursMinutes', { h, m }) : t('time.studyHours', { h });
}

/** The same in words, for screen readers: "1 hour 5 minutes". */
export function formatStudyTimeLong(ms: number): string {
  if (ms <= 0) return t('time.noTime');
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 1) return t('time.underMinute');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? tn('count.hour', h) : '', m ? tn('count.minute', m) : ''].filter(Boolean).join(' ');
}

/** The same interval in words, for screen readers: "in 4 days". */
export function formatIntervalLong(ms: number): string {
  if (ms < MINUTE) return t('time.inUnderMinute');
  const time =
    ms < HOUR
      ? tn('count.minute', Math.round(ms / MINUTE))
      : ms < DAY
        ? tn('count.hour', Math.round(ms / HOUR))
        : ms < MONTH
          ? tn('count.day', Math.round(ms / DAY))
          : ms < YEAR
            ? t('time.months', { n: oneDecimal(ms / MONTH) })
            : t('time.years', { n: oneDecimal(ms / YEAR) });
  return t('time.in', { time });
}

/** "8:00 PM" (or "20:00", following the device's locale) for minutes after midnight. */
export function formatTimeOfDay(minutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  // English follows the phone's own clock style; Vietnamese uses its own (20:00).
  return d.toLocaleTimeString(language() === 'en' ? undefined : localeTag(), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "2026-10-11" for file names. */
export function fileDate(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Tags typed as "biology, chapter 1" → ["biology", "chapter 1"] (trimmed, no duplicates). */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export function formatTags(tags: readonly string[]): string {
  return tags.join(', ');
}

/** "today", "yesterday", "3 days ago" (by calendar day). */
export function daysAgo(at: number, now: number): string {
  const day = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((day(now) - day(at)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  return t('time.daysAgo', { n: days });
}

/** Short weekday under a chart bar: "Mon" ("T2" in Vietnamese). */
export function weekdayShort(at: number): string {
  return t(`weekday.${new Date(at).getDay()}` as `weekday.${0 | 1 | 2 | 3 | 4 | 5 | 6}`);
}
