import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { buildBackup, planMerge, type Backup } from '@/lib/backup';
import { cardsToCsv } from '@/lib/csv';

import { db } from './client';
import { cards, decks, reviewLogs, settings } from './schema';
import { transaction } from './transaction';

/** Everything on the device, including deleted rows (so deletes carry over). */
export function exportBackup(now = Date.now()): Backup {
  return buildBackup(
    {
      decks: db.select().from(decks).all(),
      cards: db.select().from(cards).all(),
      review_logs: db.select().from(reviewLogs).all(),
      settings: db.select().from(settings).all(),
    },
    now,
  );
}

export type ImportResult = { decks: number; cards: number; reviews: number };

// Big imports are written in chunks to stay under SQLite's bound-parameter limit.
const CHUNK = 200;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** `SET col = excluded.col` for every column, for upserts. */
function excludedSet(rows: object[]): Record<string, SQL> {
  const columns = Object.keys(rows[0] ?? {});
  return Object.fromEntries(columns.map((c) => [c, sql.raw(`excluded.${c}`)]));
}

/** Merge a backup into the device by id (see src/lib/backup.ts for the rules). */
export function importBackup(backup: Backup): ImportResult {
  const versions = <T extends { id: string; updated_at: number }>(rows: T[]) =>
    new Map(rows.map((r) => [r.id, r.updated_at]));
  const plan = planMerge(
    {
      decks: versions(db.select({ id: decks.id, updated_at: decks.updated_at }).from(decks).all()),
      cards: versions(db.select({ id: cards.id, updated_at: cards.updated_at }).from(cards).all()),
      settings: new Map(
        db
          .select({ key: settings.key, updated_at: settings.updated_at })
          .from(settings)
          .all()
          .map((s) => [s.key, s.updated_at]),
      ),
      review_logs: new Map(
        db
          .select({ id: reviewLogs.id, deleted_at: reviewLogs.deleted_at })
          .from(reviewLogs)
          .all()
          .map((l) => [l.id, l.deleted_at]),
      ),
    },
    backup,
  );

  transaction(() => {
    for (const rows of chunks(plan.decks)) {
      db.insert(decks)
        .values(rows)
        .onConflictDoUpdate({ target: decks.id, set: excludedSet(rows) })
        .run();
    }
    for (const rows of chunks(plan.cards)) {
      db.insert(cards)
        .values(rows)
        .onConflictDoUpdate({ target: cards.id, set: excludedSet(rows) })
        .run();
    }
    for (const rows of chunks(plan.settings)) {
      db.insert(settings)
        .values(rows)
        .onConflictDoUpdate({ target: settings.key, set: excludedSet(rows) })
        .run();
    }
    for (const rows of chunks(plan.newLogs)) {
      db.insert(reviewLogs).values(rows).onConflictDoNothing().run();
    }
    for (const t of plan.tombstones) {
      db.update(reviewLogs)
        .set({ deleted_at: t.deleted_at })
        .where(and(eq(reviewLogs.id, t.id), isNull(reviewLogs.deleted_at)))
        .run();
    }
  });
  return { decks: plan.decks.length, cards: plan.cards.length, reviews: plan.newLogs.length };
}

/** All cards (not deleted) as CSV, grouped by deck. */
export function exportCardsCsv(): string {
  const liveDecks = db.select().from(decks).where(isNull(decks.deleted_at)).all();
  const deckIds = liveDecks.map((d) => d.id);
  const rows = deckIds.length
    ? db
        .select()
        .from(cards)
        .where(and(isNull(cards.deleted_at), inArray(cards.deck_id, deckIds)))
        .orderBy(asc(cards.deck_id), asc(cards.created_at), asc(cards.id))
        .all()
    : [];
  const order = new Map(
    [...liveDecks].sort((a, b) => a.name.localeCompare(b.name)).map((d, i) => [d.id, i] as const),
  );
  rows.sort((a, b) => (order.get(a.deck_id) ?? 0) - (order.get(b.deck_id) ?? 0));
  return cardsToCsv(rows, liveDecks);
}
