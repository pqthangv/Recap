// One sync between this device and its account's files (roadmap Phase 6.2–6.5), written against
// two small interfaces so it runs the same on the phone, on the website and in tests:
//   1. read what other devices sent since the last sync (see ./files.ts),
//   2. merge it by the backup import's rules (planMerge); a card studied on both sides gets its
//      schedule rebuilt from both sides' answers,
//   3. send this device's own changes as the next change files. If another device took the next
//      number first, start over from 1,
//   4. now and then fold the change files into a snapshot.
// Stopping halfway loses nothing: what was merged stays merged, and whatever wasn't sent is sent
// next time. Rows can arrive twice; merging is the same either way.
import type { CardRow, ReviewLogRow } from '@/db/schema';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackup,
  parseBackup,
  planMerge,
  type ExistingVersions,
  type MergePlan,
} from '../backup';
import { replayCard, scheduleIncludes } from '../scheduler';
import {
  buildSnapshot,
  changeName,
  changeNumbers,
  combine,
  latestChange,
  pages,
  planReads,
  rowCount,
  unneeded,
  type Head,
  type SyncRows,
} from './files';

/** The account's files, through the sync server (a fake in tests). */
export interface SyncStore {
  /** The head (null until the first snapshot), every file's name, and the server's clock. */
  list(): Promise<{ head: Head | null; names: string[]; now: number }>;
  /** A file's text, or null if it's gone (folded away meanwhile). */
  read(name: string): Promise<string | null>;
  /** Writes a new file; false if that name is taken. */
  create(name: string, text: string): Promise<boolean>;
  /** Makes `head` current if the current one's base is still `base` (null: none yet). */
  swapHead(base: number | null, head: Head): Promise<boolean>;
  remove(names: readonly string[]): Promise<void>;
}

/** This device's data (the database on the phone and website, a fake in tests). */
export interface SyncDevice {
  /**
   * Rows changed at or after `since` (on this device's clock), or every row when it's null.
   * Never this device's own settings (DEVICE_SETTING_KEYS, sync's progress among them): they
   * change during a sync, and would look like changes still to send.
   */
  changes(since: number | null): SyncRows;
  versions(): ExistingVersions;
  /** These cards (those that exist) and all their review logs. */
  cardsWithLogs(ids: readonly string[]): { cards: CardRow[]; logs: ReviewLogRow[] };
  retention(): number;
  /** Writes merged rows, in one transaction. */
  write(plan: MergePlan): void;
  /** Sync's own progress, kept on this device only (null before the first sync). */
  loadState(): SyncState | null;
  saveState(state: SyncState): void;
}

export type SyncState = {
  /** The last change file merged into this device. */
  cursor: number;
  /** This device's clock when it last sent everything; null before its first sync. */
  sentAt: number | null;
};

export type SyncResult = { read: number; sent: number; folded: boolean };

/** Why a sync stopped: other devices kept syncing at the same moment, or files are missing. */
export class SyncError extends Error {
  constructor(readonly reason: 'busy' | 'missing') {
    super(reason);
  }
}

/** Rows changed up to this long before the last send go again, in case the clock was adjusted. */
export const CLOCK_SLACK_MS = 60_000;
/** Times further ahead of the server's clock are moved back to it before sending. */
export const FUTURE_SLACK_MS = 60 * 60_000;
/** Fold once this many change files have piled up since the snapshot. */
export const FOLD_AFTER = 20;
const TRIES = 5;

const FRESH: SyncState = { cursor: 0, sentAt: null };

/**
 * planMerge, plus the cards whose merged schedule leaves out some of their answers (studied on
 * this device and another one since they last synced), with the schedule rebuilt from all of
 * them. A rebuilt card is stamped newer than both copies, so it wins on every device.
 */
export function mergeRows(device: SyncDevice, incoming: SyncRows, now: number): MergePlan {
  const plan = planMerge(device.versions(), {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: now,
    ...incoming,
  });
  const cardOfLog = new Map(incoming.review_logs.map((l) => [l.id, l.card_id]));
  const touched = new Set<string>();
  for (const card of plan.cards) touched.add(card.id);
  for (const log of plan.newLogs) touched.add(log.card_id);
  for (const t of plan.tombstones) {
    const id = cardOfLog.get(t.id);
    if (id) touched.add(id);
  }
  if (touched.size === 0) return plan;

  const local = device.cardsWithLogs([...touched]);
  const merged = new Map(local.cards.map((c) => [c.id, c]));
  for (const card of plan.cards) merged.set(card.id, card);
  const logs = new Map(local.logs.map((l) => [l.id, l]));
  for (const log of plan.newLogs) logs.set(log.id, log);
  for (const t of plan.tombstones) {
    const log = logs.get(t.id);
    if (log) logs.set(t.id, { ...log, deleted_at: t.deleted_at });
  }
  const answers = new Map<string, ReviewLogRow[]>();
  for (const log of logs.values()) {
    if (log.deleted_at != null) continue;
    const list = answers.get(log.card_id);
    if (list) list.push(log);
    else answers.set(log.card_id, [log]);
  }

  const cards = new Map(plan.cards.map((c) => [c.id, c]));
  const retention = device.retention();
  for (const id of touched) {
    const card = merged.get(id);
    const given = answers.get(id) ?? [];
    if (!card || scheduleIncludes(card, given)) continue;
    cards.set(id, {
      ...card,
      ...replayCard(id, card.created_at, given, retention),
      updated_at: Math.max(now, card.updated_at + 1),
    });
  }
  return { ...plan, cards: [...cards.values()] };
}

/** Leaves out rows exactly as they are in `known` (other devices already have them). */
function without(rows: SyncRows, known: SyncRows): SyncRows {
  const versions = new Set([
    ...known.decks.map((d) => `d${d.id}@${d.updated_at}`),
    ...known.cards.map((c) => `c${c.id}@${c.updated_at}`),
    ...known.settings.map((s) => `s${s.key}@${s.updated_at}`),
    ...known.review_logs.map((l) => `l${l.id}@${l.deleted_at}`),
  ]);
  return {
    decks: rows.decks.filter((d) => !versions.has(`d${d.id}@${d.updated_at}`)),
    cards: rows.cards.filter((c) => !versions.has(`c${c.id}@${c.updated_at}`)),
    settings: rows.settings.filter((s) => !versions.has(`s${s.key}@${s.updated_at}`)),
    review_logs: rows.review_logs.filter((l) => !versions.has(`l${l.id}@${l.deleted_at}`)),
  };
}

/**
 * Rows stamped far ahead of the server's clock (a device set to the wrong date) get the server's
 * time instead, before anyone else sees them, so they can't win every merge until that date. The
 * returned plan writes the same fix on this device.
 */
function clampFuture(rows: SyncRows, serverNow: number): { rows: SyncRows; fix: MergePlan } {
  const fix: MergePlan = { decks: [], cards: [], settings: [], newLogs: [], tombstones: [] };
  const clamp = <T extends { updated_at: number }>(list: T[], fixed: T[]) =>
    list.map((row) => {
      if (row.updated_at <= serverNow + FUTURE_SLACK_MS) return row;
      const moved = { ...row, updated_at: serverNow };
      fixed.push(moved);
      return moved;
    });
  return {
    rows: {
      decks: clamp(rows.decks, fix.decks),
      cards: clamp(rows.cards, fix.cards),
      settings: clamp(rows.settings, fix.settings),
      review_logs: rows.review_logs,
    },
    fix,
  };
}

/** Syncs once: brings this device up to date, then sends its own changes. */
export async function sync(
  store: SyncStore,
  device: SyncDevice,
  clock: () => number = Date.now,
): Promise<SyncResult> {
  let read = 0;
  let sent = 0;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const listing = await store.list();
    let state = device.loadState() ?? FRESH;
    // A cursor past the account's newest file means the account was emptied: start over.
    if (state.cursor > latestChange(listing.head, listing.names)) state = FRESH;
    const plan = planReads(listing.head, listing.names, state.cursor);
    if (!plan) throw new SyncError('missing');
    const texts = await Promise.all(plan.names.map((name) => store.read(name)));
    if (texts.some((text) => text === null)) continue;
    read += texts.length;

    // From here to the first upload nothing waits, so nothing can change on the device meanwhile.
    const incoming = combine(texts.map((text) => parseBackup(text!)));
    const now = clock();
    device.write(mergeRows(device, incoming, now));
    state = { ...state, cursor: plan.cursor };
    device.saveState(state);

    const since =
      state.sentAt === null || now < state.sentAt - CLOCK_SLACK_MS
        ? null
        : state.sentAt - CLOCK_SLACK_MS;
    const { rows: outgoing, fix } = clampFuture(
      without(device.changes(since), incoming),
      listing.now,
    );
    device.write(fix);

    let taken = false;
    for (const page of pages(outgoing)) {
      const n = state.cursor + 1;
      if (!(await store.create(changeName(n), JSON.stringify(buildBackup(page, now))))) {
        taken = true;
        break;
      }
      sent++;
      state = { ...state, cursor: n };
      device.saveState(state);
    }
    if (taken) continue;
    state = { ...state, sentAt: now };
    device.saveState(state);

    // Changed while sending (beyond what came in and went out)? Then it isn't a moment to fold.
    const unfolded = changeNumbers(listing.names).filter(
      (n) => n > (listing.head?.base ?? 0),
    ).length;
    const settled = rowCount(without(without(device.changes(now), incoming), outgoing)) === 0;
    const folded =
      unfolded + sent >= FOLD_AFTER &&
      settled &&
      (await fold(store, device.changes(null), state.cursor, listing.head, listing.names, now));
    return { read, sent, folded };
  }
  throw new SyncError('busy');
}

/**
 * Folds everything into a new snapshot. Only called while the device has nothing left to send, so
 * its rows are exactly the account's change files up to `base`. Best effort: if it fails or
 * another device folds first, the change files stay and a later sync folds them.
 */
async function fold(
  store: SyncStore,
  all: SyncRows,
  base: number,
  head: Head | null,
  names: readonly string[],
  now: number,
): Promise<boolean> {
  const snapshot = buildSnapshot(all, base, head);
  try {
    for (const file of snapshot.files) {
      await store.create(file.name, JSON.stringify(buildBackup(file.rows, now)));
    }
    if (!(await store.swapHead(head?.base ?? null, snapshot.head))) return false;
    await store.remove(unneeded(names, snapshot.head));
    return true;
  } catch {
    return false;
  }
}
