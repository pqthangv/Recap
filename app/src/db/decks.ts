import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { newId } from '@/lib/id';

import { db } from './client';
import { cards, decks, type Deck } from './schema';
import { transaction } from './transaction';

export type DeckInput = { name: string; color: string };

const live = isNull(decks.deleted_at);

export function listDecks(): Deck[] {
  return db
    .select()
    .from(decks)
    .where(live)
    .orderBy(asc(sql`lower(${decks.name})`), asc(decks.created_at))
    .all();
}

export function getDeck(id: string): Deck | undefined {
  return db
    .select()
    .from(decks)
    .where(and(eq(decks.id, id), live))
    .get();
}

export function createDeck(input: DeckInput, now = Date.now()): Deck {
  const deck: Deck = {
    id: newId(),
    name: input.name.trim(),
    color: input.color,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  db.insert(decks).values(deck).run();
  return deck;
}

export function updateDeck(id: string, input: DeckInput, now = Date.now()): void {
  db.update(decks)
    .set({ name: input.name.trim(), color: input.color, updated_at: now })
    .where(eq(decks.id, id))
    .run();
}

/** Soft-deletes the deck and all its cards (the UI asks for confirmation first). */
export function deleteDeck(id: string, now = Date.now()): void {
  deleteDecks([id], now);
}

/** Soft-deletes several decks (a deck group) and their cards, all at once. */
export function deleteDecks(ids: readonly string[], now = Date.now()): void {
  if (ids.length === 0) return;
  transaction(() => {
    db.update(decks)
      .set({ deleted_at: now, updated_at: now })
      .where(inArray(decks.id, [...ids]))
      .run();
    db.update(cards)
      .set({ deleted_at: now, updated_at: now })
      .where(and(inArray(cards.deck_id, [...ids]), isNull(cards.deleted_at)))
      .run();
  });
}

/** How long deleted decks stay in "Recently deleted" (their tombstones stay for sync). */
export const RESTORE_DAYS = 30;
const RESTORE_MS = RESTORE_DAYS * 24 * 60 * 60 * 1000;

export type DeletedDeck = Deck & { deleted_at: number; cards: number };

/** Decks deleted in the last 30 days, newest first, with how many cards went with them. */
export function listDeletedDecks(now = Date.now()): DeletedDeck[] {
  const rows = db
    .select()
    .from(decks)
    .where(sql`${decks.deleted_at} >= ${now - RESTORE_MS}`)
    .orderBy(sql`${decks.deleted_at} desc`, asc(sql`lower(${decks.name})`))
    .all();
  return rows.map((deck) => ({
    ...deck,
    deleted_at: deck.deleted_at ?? now,
    // The cards deleted together with the deck (same moment), not ones deleted earlier.
    cards:
      db
        .select({ n: sql<number>`count(*)` })
        .from(cards)
        .where(and(eq(cards.deck_id, deck.id), eq(cards.deleted_at, deck.deleted_at ?? -1)))
        .get()?.n ?? 0,
  }));
}

/**
 * Brings deleted decks back with the cards that were deleted along with them. Cards someone had
 * deleted on their own before stay deleted.
 */
export function restoreDecks(ids: readonly string[], now = Date.now()): void {
  if (ids.length === 0) return;
  transaction(() => {
    const deleted = db
      .select({ id: decks.id, deleted_at: decks.deleted_at })
      .from(decks)
      .where(inArray(decks.id, [...ids]))
      .all();
    for (const deck of deleted) {
      if (deck.deleted_at === null) continue;
      db.update(cards)
        .set({ deleted_at: null, updated_at: now })
        .where(and(eq(cards.deck_id, deck.id), eq(cards.deleted_at, deck.deleted_at)))
        .run();
      db.update(decks)
        .set({ deleted_at: null, updated_at: now })
        .where(eq(decks.id, deck.id))
        .run();
    }
  });
}
