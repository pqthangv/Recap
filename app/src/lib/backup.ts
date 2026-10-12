// JSON backup format and the merge rules for importing one. The same rules are meant for sync:
//   - decks, cards, settings: last write wins by `updated_at` (ties keep what's on the device),
//   - review logs: append-only; a log is added if missing, and an undo tombstone (`deleted_at`)
//     is copied onto a live log, never the other way round.
// Deleted rows are exported too, so deleting something on one device deletes it on the other.
import type { CardRow, Deck, ReviewLogRow, SettingRow } from '@/db/schema';

import { DEVICE_SETTING_KEYS } from './settings';

export const BACKUP_FORMAT = 'recap-backup';
export const BACKUP_VERSION = 1;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: number;
  decks: Deck[];
  cards: CardRow[];
  review_logs: ReviewLogRow[];
  settings: SettingRow[];
};

export class BackupError extends Error {}

export function buildBackup(
  data: Omit<Backup, 'format' | 'version' | 'exported_at'>,
  now: number,
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: now,
    decks: data.decks,
    cards: data.cards,
    review_logs: data.review_logs,
    settings: data.settings.filter((s) => !DEVICE_SETTING_KEYS.includes(s.key)),
  };
}

// --- Validation: only known columns with the right types get through. ---

// 'flag' is 0 or 1, and 0 when missing (older backups).
type Kind = 'string' | 'string?' | 'number' | 'number?' | 'flag' | 'tags';
type Spec = Record<string, Kind>;

const TIMESTAMPS = { created_at: 'number', updated_at: 'number', deleted_at: 'number?' } as const;

const DECK_SPEC = { id: 'string', name: 'string', color: 'string', ...TIMESTAMPS } as const;
const CARD_SPEC = {
  id: 'string',
  deck_id: 'string',
  front: 'string',
  back: 'string',
  image_uri: 'string?',
  image_side: 'string?',
  tags: 'tags',
  reverse_of: 'string?',
  due: 'number',
  stability: 'number',
  difficulty: 'number',
  elapsed_days: 'number',
  scheduled_days: 'number',
  learning_steps: 'number',
  reps: 'number',
  lapses: 'number',
  state: 'number',
  last_review: 'number?',
  ...TIMESTAMPS,
} as const;
const LOG_SPEC = {
  id: 'string',
  card_id: 'string',
  rating: 'number',
  state: 'number',
  due: 'number',
  stability: 'number',
  difficulty: 'number',
  elapsed_days: 'number',
  last_elapsed_days: 'number',
  scheduled_days: 'number',
  learning_steps: 'number',
  reviewed_at: 'number',
  duration_ms: 'number',
  goal_met: 'flag',
  deleted_at: 'number?',
} as const;
const SETTING_SPEC = { key: 'string', value: 'string', updated_at: 'number' } as const;

function checkRow(raw: unknown, spec: Spec, table: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new BackupError(`Bad row in ${table}`);
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [col, kind] of Object.entries(spec)) {
    const v = src[col];
    const optional = kind.endsWith('?');
    if (optional && (v === null || v === undefined)) {
      out[col] = null;
    } else if (kind === 'flag') {
      if (v !== undefined && v !== null && v !== 0 && v !== 1 && typeof v !== 'boolean') {
        throw new BackupError(`Bad ${col} in ${table}`);
      }
      out[col] = v === 1 || v === true ? 1 : 0;
    } else if (kind === 'tags') {
      if (!Array.isArray(v) || !v.every((t) => typeof t === 'string')) {
        throw new BackupError(`Bad ${col} in ${table}`);
      }
      out[col] = v;
    } else if (kind.startsWith('string') ? typeof v === 'string' : Number.isFinite(v)) {
      out[col] = v;
    } else {
      throw new BackupError(`Bad ${col} in ${table}`);
    }
  }
  return out;
}

function checkTable<T>(raw: unknown, spec: Spec, table: string): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new BackupError(`Bad ${table}`);
  return raw.map((r) => checkRow(r, spec, table) as T);
}

/** Parse and validate a backup file. Throws BackupError if it isn't a Recap backup. */
export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new BackupError('Not a JSON file');
  }
  if (typeof json !== 'object' || json === null) throw new BackupError('Not a Recap backup');
  const b = json as Record<string, unknown>;
  if (b.format !== BACKUP_FORMAT) throw new BackupError('Not a Recap backup');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new BackupError('This backup is from a newer version of Recap');
  }
  return {
    format: BACKUP_FORMAT,
    version: b.version,
    exported_at: typeof b.exported_at === 'number' ? b.exported_at : 0,
    decks: checkTable<Deck>(b.decks, DECK_SPEC, 'decks'),
    cards: checkTable<CardRow>(b.cards, CARD_SPEC, 'cards'),
    review_logs: checkTable<ReviewLogRow>(b.review_logs, LOG_SPEC, 'review_logs'),
    settings: checkTable<SettingRow>(b.settings, SETTING_SPEC, 'settings').filter(
      (s) => !DEVICE_SETTING_KEYS.includes(s.key),
    ),
  };
}

// --- Merge ---

export type ExistingVersions = {
  decks: ReadonlyMap<string, number>; // id → updated_at
  cards: ReadonlyMap<string, number>;
  settings: ReadonlyMap<string, number>; // key → updated_at
  review_logs: ReadonlyMap<string, number | null>; // id → deleted_at
};

/** Rows to write: everything in `incoming` that is new or newer than the device's copy. */
export type MergePlan = {
  decks: Deck[];
  cards: CardRow[];
  settings: SettingRow[];
  newLogs: ReviewLogRow[];
  /** Logs that exist on the device but were undone on the other side. */
  tombstones: { id: string; deleted_at: number }[];
};

export function planMerge(existing: ExistingVersions, incoming: Backup): MergePlan {
  const newer = <T>(
    rows: T[],
    map: ReadonlyMap<string, number>,
    key: (r: T) => string,
    at: (r: T) => number,
  ) =>
    rows.filter((r) => {
      const mine = map.get(key(r));
      return mine === undefined || at(r) > mine;
    });
  const newLogs: ReviewLogRow[] = [];
  const tombstones: MergePlan['tombstones'] = [];
  for (const log of incoming.review_logs) {
    if (!existing.review_logs.has(log.id)) newLogs.push(log);
    else if (log.deleted_at != null && existing.review_logs.get(log.id) == null) {
      tombstones.push({ id: log.id, deleted_at: log.deleted_at });
    }
  }
  return {
    decks: newer(
      incoming.decks,
      existing.decks,
      (d) => d.id,
      (d) => d.updated_at,
    ),
    cards: newer(
      incoming.cards,
      existing.cards,
      (c) => c.id,
      (c) => c.updated_at,
    ),
    settings: newer(
      incoming.settings,
      existing.settings,
      (s) => s.key,
      (s) => s.updated_at,
    ),
    newLogs,
    tombstones,
  };
}
