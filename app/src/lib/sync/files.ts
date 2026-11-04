// The files an account's synced data is kept in (roadmap Phase 6.2), and which of them a device
// needs. Every file is a JSON backup (src/lib/backup.ts) holding part of the data:
//   - change files, numbered 1, 2, 3 …: what one device sent in one sync (a big first sync is
//     split over several). The numbers decide what's new, so device clocks never do;
//   - now and then a snapshot: every change file up to its `base` folded into one cards file
//     (decks, cards, settings) and one reviews file per month. A month's file is only written
//     again when its reviews changed, so old months are downloaded once.
// A file's name never changes meaning: snapshot files carry the base they were written at, so two
// devices folding at once can't overwrite each other's, and the previous snapshot is kept (one bad
// upload can be undone). The head, the one file that is replaced, says which snapshot is current.
import type { CardRow, Deck, ReviewLogRow, SettingRow } from '@/db/schema';

import type { Backup } from '../backup';

export type SyncRows = Pick<Backup, 'decks' | 'cards' | 'review_logs' | 'settings'>;

export function noRows(): SyncRows {
  return { decks: [], cards: [], review_logs: [], settings: [] };
}

/** A month's reviews file: the snapshot it was written in, and how many logs (undone) it holds. */
export type MonthFile = { rev: number; logs: number; undone: number };

export type Snapshot = {
  /** The last change file folded in. */
  base: number;
  /** "2026-10" → that month's reviews file. */
  months: Record<string, MonthFile>;
};

/** The current snapshot, and the one before it (its files are kept). */
export type Head = Snapshot & { prev: Snapshot | null };

/** About how many rows go in one change file, and at most about how big it gets (JSON). */
export const PAGE_ROWS = 5000;
export const PAGE_BYTES = 2_000_000;

const pad = (n: number) => String(n).padStart(10, '0');

export const changeName = (n: number) => `changes/${pad(n)}.json`;
export const cardsName = (base: number) => `cards/${pad(base)}.json`;
export const monthName = (month: string, rev: number) => `reviews/${month}/${pad(rev)}.json`;

const CHANGE = /^changes\/(\d{10})\.json$/;
const SNAPSHOT_FILE = /^(cards\/\d{10}|reviews\/\d{4}-\d{2}\/\d{10})\.json$/;

/** The numbers of the change files among these names, in order. */
export function changeNumbers(names: readonly string[]): number[] {
  return names
    .map((name) => CHANGE.exec(name))
    .filter((m) => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

/** The newest change file, folded or not (0 for a new account). */
export function latestChange(head: Head | null, names: readonly string[]): number {
  return Math.max(head?.base ?? 0, changeNumbers(names).at(-1) ?? 0);
}

/** The month a review was given in, the same on every device (UTC). */
export function monthOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

export type ReadPlan = { names: string[]; cursor: number };

/**
 * The files a device must read to catch up when it has merged everything up to change file
 * `cursor`, and its cursor afterwards: the change files after `cursor` while they're all still
 * there. Otherwise (a new device, or one away long enough that its files were folded and removed)
 * the current snapshot's cards file, its months written since `cursor`, and the change files after
 * the snapshot. Null if files are missing, which a working account never has.
 */
export function planReads(
  head: Head | null,
  names: readonly string[],
  cursor: number,
): ReadPlan | null {
  const changes = changeNumbers(names);
  const latest = latestChange(head, names);
  const from = (start: number) => {
    const after = changes.filter((n) => n > start);
    return after.every((n, i) => n === start + 1 + i) && start + after.length === latest
      ? after.map(changeName)
      : null;
  };
  const changesOnly = from(cursor);
  if (changesOnly) return { names: changesOnly, cursor: latest };
  const rest = head ? from(head.base) : null;
  if (!head || !rest) return null;
  const months = Object.entries(head.months)
    .filter(([, file]) => file.rev > cursor)
    .map(([month, file]) => monthName(month, file.rev));
  return { names: [cardsName(head.base), ...months, ...rest], cursor: latest };
}

/** Several files' rows as one set: the newest copy of each row, and an undone log stays undone. */
export function combine(files: readonly SyncRows[]): SyncRows {
  const decks = new Map<string, Deck>();
  const cards = new Map<string, CardRow>();
  const settings = new Map<string, SettingRow>();
  const logs = new Map<string, ReviewLogRow>();
  const keepNewest = <T extends { updated_at: number }>(
    map: Map<string, T>,
    key: string,
    row: T,
  ) => {
    const have = map.get(key);
    if (!have || row.updated_at > have.updated_at) map.set(key, row);
  };
  for (const file of files) {
    for (const d of file.decks) keepNewest(decks, d.id, d);
    for (const c of file.cards) keepNewest(cards, c.id, c);
    for (const s of file.settings) keepNewest(settings, s.key, s);
    for (const l of file.review_logs) {
      const have = logs.get(l.id);
      if (!have || (have.deleted_at == null && l.deleted_at != null)) logs.set(l.id, l);
    }
  }
  return {
    decks: [...decks.values()],
    cards: [...cards.values()],
    review_logs: [...logs.values()],
    settings: [...settings.values()],
  };
}

export function rowCount(rows: SyncRows): number {
  return rows.decks.length + rows.cards.length + rows.review_logs.length + rows.settings.length;
}

/**
 * Rows to send, split into change files of about `size` rows. A card and its logs always share a
 * file, so a device that only gets some of the files never sees an answer without its schedule.
 */
export function pages(rows: SyncRows, size = PAGE_ROWS, maxBytes = PAGE_BYTES): SyncRows[] {
  if (rowCount(rows) === 0) return [];
  const logsOf = new Map<string, ReviewLogRow[]>();
  for (const log of rows.review_logs) {
    const list = logsOf.get(log.card_id);
    if (list) list.push(log);
    else logsOf.set(log.card_id, [log]);
  }
  const out: SyncRows[] = [{ ...noRows(), decks: rows.decks, settings: rows.settings }];
  const sizeOf = (row: object) => JSON.stringify(row).length + 1;
  let bytes = [...rows.decks, ...rows.settings].reduce((sum, row) => sum + sizeOf(row), 0);
  const add = (card: CardRow | undefined, logs: ReviewLogRow[]) => {
    let page = out[out.length - 1];
    const adding = (card ? sizeOf(card) : 0) + logs.reduce((sum, log) => sum + sizeOf(log), 0);
    const full = rowCount(page) + logs.length + 1 > size || bytes + adding > maxBytes;
    if (rowCount(page) > 0 && full) {
      page = noRows();
      out.push(page);
      bytes = 0;
    }
    if (card) page.cards.push(card);
    page.review_logs.push(...logs);
    bytes += adding;
  };
  for (const card of rows.cards) {
    add(card, logsOf.get(card.id) ?? []);
    logsOf.delete(card.id);
  }
  // Logs whose card didn't change (an answer undone after its card was sent, say).
  for (const logs of logsOf.values()) add(undefined, logs);
  return out;
}

export type SnapshotFile = { name: string; rows: SyncRows };

/**
 * A new snapshot of everything on a device that has merged every change file up to `base` and
 * has nothing left to send. Months whose counts match the current snapshot keep their file: logs
 * are only ever added or undone, and such a device has everything the snapshot has, so the same
 * counts mean the same logs.
 */
export function buildSnapshot(
  all: SyncRows,
  base: number,
  head: Head | null,
): { head: Head; files: SnapshotFile[] } {
  const byMonth = new Map<string, ReviewLogRow[]>();
  for (const log of all.review_logs) {
    const month = monthOf(log.reviewed_at);
    const list = byMonth.get(month);
    if (list) list.push(log);
    else byMonth.set(month, [log]);
  }
  const files: SnapshotFile[] = [{ name: cardsName(base), rows: { ...all, review_logs: [] } }];
  const months: Record<string, MonthFile> = {};
  for (const [month, logs] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) {
    const undone = logs.filter((l) => l.deleted_at != null).length;
    const old = head?.months[month];
    if (old && old.logs === logs.length && old.undone === undone) {
      months[month] = old;
    } else {
      months[month] = { rev: base, logs: logs.length, undone };
      files.push({ name: monthName(month, base), rows: { ...noRows(), review_logs: logs } });
    }
  }
  const prev = head ? { base: head.base, months: head.months } : null;
  return { head: { base, months, prev }, files };
}

/**
 * The files `names` holds that are no longer needed once `head` is current: snapshot files of
 * neither it nor the one before it, and change files the one before it already folded in.
 */
export function unneeded(names: readonly string[], head: Head): string[] {
  const keep = new Set<string>();
  for (const snapshot of [head, head.prev]) {
    if (!snapshot) continue;
    keep.add(cardsName(snapshot.base));
    for (const [month, file] of Object.entries(snapshot.months)) {
      keep.add(monthName(month, file.rev));
    }
  }
  const folded = head.prev?.base ?? 0;
  return names.filter((name) => {
    if (keep.has(name)) return false;
    const change = CHANGE.exec(name);
    if (change) return Number(change[1]) <= folded;
    return SNAPSHOT_FILE.test(name);
  });
}
