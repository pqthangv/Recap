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
