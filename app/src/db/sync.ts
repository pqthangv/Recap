// This device's side of sync (lib/sync/round.ts SyncDevice) on the real database: what changed
// since the last send, what's here to merge against, and writing what came in. The "How to use
// Recap" deck stays on each device (user decision 2026-11-04): its deck, cards and answers are
// never sent, and a device that signs in to an account with cards drops it if it was never studied.
import { and, eq, gte, inArray, notInArray, or, type SQL } from 'drizzle-orm';

import {
  DEVICE_SETTING_KEYS,
  SYNC_STATE_KEY,
  TUTORIAL_DECK_KEY,
  TUTORIAL_TIP_DONE_KEY,
} from '@/lib/settings';
import { rowCount, type SyncRows } from '@/lib/sync/files';
import type { SyncDevice, SyncState } from '@/lib/sync/round';

import { existingVersions, writeMergePlan } from './backup';
import { db } from './client';
import { cards, decks, reviewLogs, settings, type CardRow, type ReviewLogRow } from './schema';
import { getRawSetting, getSettings, setRawSetting } from './settings';
import { transaction } from './transaction';

// Big id lists are read in chunks, under SQLite's bound-parameter limit.
const CHUNK = 200;

function tutorialDeck(): string | null {
  const id = getRawSetting(TUTORIAL_DECK_KEY);
  return typeof id === 'string' ? id : null;
}

function tutorialCards(deckId: string | null): Set<string> {
  if (!deckId) return new Set();
  const rows = db.select({ id: cards.id }).from(cards).where(eq(cards.deck_id, deckId)).all();
  return new Set(rows.map((r) => r.id));
}

/** Rows changed at or after `since` (every row when null), without the tutorial or device settings. */
export function changedRows(since: number | null): SyncRows {
  const after = (column: Parameters<typeof gte>[0]): SQL | undefined =>
    since === null ? undefined : gte(column, since);
  const tutorial = tutorialDeck();
  const skipped = tutorialCards(tutorial);
  const logsSince =
    since === null
      ? undefined
      : or(gte(reviewLogs.reviewed_at, since), gte(reviewLogs.deleted_at, since));
  return {
    decks: db
      .select()
      .from(decks)
      .where(after(decks.updated_at))
      .all()
      .filter((d) => d.id !== tutorial),
    cards: db
      .select()
      .from(cards)
      .where(after(cards.updated_at))
      .all()
      .filter((c) => !skipped.has(c.id)),
    review_logs: db
      .select()
      .from(reviewLogs)
      .where(logsSince)
      .all()
      .filter((l) => !skipped.has(l.card_id)),
    settings: db
      .select()
      .from(settings)
      .where(and(after(settings.updated_at), notInArray(settings.key, [...DEVICE_SETTING_KEYS])))
      .all(),
  };
}

export const databaseDevice: SyncDevice = {
  changes: changedRows,
  versions: existingVersions,
  cardsWithLogs(ids) {
    const found: { cards: CardRow[]; logs: ReviewLogRow[] } = { cards: [], logs: [] };
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = [...ids.slice(i, i + CHUNK)];
      found.cards.push(...db.select().from(cards).where(inArray(cards.id, chunk)).all());
      found.logs.push(
        ...db.select().from(reviewLogs).where(inArray(reviewLogs.card_id, chunk)).all(),
      );
    }
    return found;
  },
  retention: () => getSettings().retention,
  write: writeMergePlan,
  loadState(): SyncState | null {
    const saved = getRawSetting(SYNC_STATE_KEY) as Partial<SyncState> | undefined;
    return saved && typeof saved.cursor === 'number'
      ? { cursor: saved.cursor, sentAt: typeof saved.sentAt === 'number' ? saved.sentAt : null }
      : null;
  },
  saveState(state) {
    setRawSetting(SYNC_STATE_KEY, state);
  },
};

/** Whether anything changed here since the last send (always, before the first sync). */
export function hasUnsentChanges(): boolean {
  const state = databaseDevice.loadState();
  if (!state || state.sentAt === null) return true;
  return rowCount(changedRows(state.sentAt)) > 0;
}

/** Forgets sync's progress (signing out, or a new account): the next sync starts from scratch. */
export function forgetSyncState(): void {
  db.delete(settings).where(eq(settings.key, SYNC_STATE_KEY)).run();
}

/**
 * Drops the "How to use Recap" deck if it was never studied: for a device that just signed in to
 * an account that already has cards. It never syncs, so it's removed outright (with its cards);
 * true if it was.
 */
export function dropUnusedTutorial(): boolean {
  const deckId = tutorialDeck();
  if (!deckId) return false;
  const ids = [...tutorialCards(deckId)];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const studied = db
      .select({ id: reviewLogs.id })
      .from(reviewLogs)
      .where(inArray(reviewLogs.card_id, ids.slice(i, i + CHUNK)))
      .limit(1)
      .all();
    if (studied.length > 0) return false;
  }
  transaction(() => {
    db.delete(cards).where(eq(cards.deck_id, deckId)).run();
    db.delete(decks).where(eq(decks.id, deckId)).run();
    setRawSetting(TUTORIAL_TIP_DONE_KEY, true);
  });
  return true;
}
