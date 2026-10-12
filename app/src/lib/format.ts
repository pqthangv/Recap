const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** 7936 → "7,936". English separators, like the rest of the app's text. */
export function count(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Label for the main home-screen button, e.g. "Study · 12 due". */
export function studyButtonLabel(dueCount: number): string {
  return `Study · ${count(dueCount)} due`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

function oneDecimal(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Short interval for a grade button: "1m", "10m", "3h", "4d", "2.5mo", "1.2y". */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1m';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  if (ms < MONTH) return `${Math.round(ms / DAY)}d`;
  if (ms < YEAR) return `${oneDecimal(ms / MONTH)}mo`;
  return `${oneDecimal(ms / YEAR)}y`;
}

/** Time spent studying: "<1 min", "12 min", "1 h 5 min", "3 h". */
export function formatStudyTime(ms: number): string {
  if (ms <= 0) return '0 min';
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${count(h)} h ${m} min` : `${count(h)} h`;
}

/** The same in words, for screen readers: "1 hour 5 minutes". */
export function formatStudyTimeLong(ms: number): string {
  if (ms <= 0) return 'no time';
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 1) return 'less than a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? plural(h, 'hour') : '', m ? plural(m, 'minute') : ''].filter(Boolean).join(' ');
}

/** The same interval in words, for screen readers: "in 4 days". */
export function formatIntervalLong(ms: number): string {
  if (ms < MINUTE) return 'in less than a minute';
  if (ms < HOUR) return `in ${plural(Math.round(ms / MINUTE), 'minute')}`;
  if (ms < DAY) return `in ${plural(Math.round(ms / HOUR), 'hour')}`;
  if (ms < MONTH) return `in ${plural(Math.round(ms / DAY), 'day')}`;
  if (ms < YEAR) return `in ${oneDecimal(ms / MONTH)} months`;
  return `in ${oneDecimal(ms / YEAR)} years`;
}

/** "8:00 PM" (or "20:00", following the device's locale) for minutes after midnight. */
export function formatTimeOfDay(minutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
  const day = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((day(now) - day(at)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
