import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Conventions (so a sync service can be added later without a data migration):
// - Every row has a UUID `id` generated on the device.
// - All times are integer milliseconds since the Unix epoch (UTC).
// - Rows are never hard-deleted; `deleted_at` marks a tombstone and `updated_at` drives
//   last-write-wins merging (see src/lib/backup.ts).
// - No foreign-key constraints, so merged/synced rows can be applied in any order.
// - Column names are snake_case and the FSRS columns match ts-fsrs field names exactly, so rows
//   map 1:1 to ts-fsrs objects, the JSON backup and the CSV export.

const timestamps = {
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
  deleted_at: integer('deleted_at'),
};

export const decks = sqliteTable('decks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  // The language each side is read aloud in (a code from CARD_LANGUAGES, src/lib/language.ts);
  // null = Auto, guessed from the text. Reverse cards swap them.
  front_lang: text('front_lang'),
  back_lang: text('back_lang'),
  ...timestamps,
});

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    deck_id: text('deck_id').notNull(),
    front: text('front').notNull(),
    back: text('back').notNull(),
    image_uri: text('image_uri'),
    // Which side shows the picture (imported decks can have it on either side).
    image_side: text('image_side').$type<'front' | 'back'>(),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    // Set on the second card created by "Also create reverse card"; points at the original.
    reverse_of: text('reverse_of'),
    // FSRS memory state: exactly the fields of ts-fsrs's `Card`.
    due: integer('due').notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    elapsed_days: integer('elapsed_days').notNull(),
    scheduled_days: integer('scheduled_days').notNull(),
    learning_steps: integer('learning_steps').notNull(),
    reps: integer('reps').notNull(),
    lapses: integer('lapses').notNull(),
    state: integer('state').notNull(),
    last_review: integer('last_review'),
    ...timestamps,
  },
  (t) => [
    index('cards_deck_idx').on(t.deck_id),
    index('cards_due_idx').on(t.state, t.due),
    index('cards_reverse_idx').on(t.reverse_of),
  ],
);

// Append-only: one row per answer, never edited. Undoing an answer sets `deleted_at` (a tombstone)
// instead of removing the row, so the undo can be synced too. Together with each card's creation
// time, these rows are enough to replay a card's whole schedule with ts-fsrs `reschedule()`.
export const reviewLogs = sqliteTable(
  'review_logs',
  {
    id: text('id').primaryKey(),
    card_id: text('card_id').notNull(),
    // ts-fsrs Rating: 0 Manual (schedule reset), 1 Again, 2 Hard, 3 Good, 4 Easy.
    rating: integer('rating').notNull(),
    // The rest of ts-fsrs's `ReviewLog`; its `review` field is stored as `reviewed_at`.
    state: integer('state').notNull(),
    due: integer('due').notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    elapsed_days: integer('elapsed_days').notNull(),
    last_elapsed_days: integer('last_elapsed_days').notNull(),
    scheduled_days: integer('scheduled_days').notNull(),
    learning_steps: integer('learning_steps').notNull(),
    reviewed_at: integer('reviewed_at').notNull(),
    duration_ms: integer('duration_ms').notNull(),
    // 1 if that study day's new-card goal was met by this answer or an earlier one that day: those
    // days count for the streak. Saved when answering, so changing "New cards per day" later doesn't
    // rewrite past days.
    goal_met: integer('goal_met').notNull().default(0),
    deleted_at: integer('deleted_at'),
  },
  (t) => [
    index('review_logs_card_idx').on(t.card_id),
    index('review_logs_reviewed_idx').on(t.reviewed_at),
  ],
);

// Values are JSON-encoded. `updated_at` lets settings merge like every other row.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: integer('updated_at').notNull(),
});

export type Deck = typeof decks.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type NewCardRow = typeof cards.$inferInsert;
export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
