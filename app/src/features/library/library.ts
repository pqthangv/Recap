// Adding a Library pack to your decks.
import { createDeck, listDecks } from '@/db/decks';
import { importCards, type ImportSummary } from '@/db/import';
import { transaction } from '@/db/transaction';
import { DECK_PATH_SEPARATOR } from '@/lib/deckGroups';

import type { Pack } from './packs';

const lower = (name: string) => name.trim().toLowerCase();

/** The pack's deck names on the phone: "SAT vocabulary › Set 1", … */
export function packDeckNames(pack: Pack): string[] {
  return pack.decks.map((deck) => `${pack.name}${DECK_PATH_SEPARATOR}${deck.name}`);
}

export function packCardCount(pack: Pack): number {
  return pack.decks.reduce((n, deck) => n + deck.cards.length, 0);
}

/** True when all the pack's decks are on the phone (its button then opens them instead). */
export function isPackAdded(pack: Pack, decks: readonly { name: string }[]): boolean {
  const names = new Set(decks.map((d) => lower(d.name)));
  const wanted = packDeckNames(pack);
  return wanted.length > 0 && wanted.every((name) => names.has(lower(name)));
}

/**
 * Adds the pack's decks (in the pack's color) and its cards as new cards, in the pack's order.
 * Adding it again only brings back what's missing: cards already in a deck are skipped.
 */
export function addPack(pack: Pack, now = Date.now()): ImportSummary {
  const names = packDeckNames(pack);
  return transaction(() => {
    const existing = new Set(listDecks().map((d) => lower(d.name)));
    names.forEach((name, i) => {
      if (!existing.has(lower(name))) createDeck({ name, color: pack.color }, now + i);
    });
    const items = pack.decks.flatMap((deck, i) =>
      deck.cards.map((card) => ({ ...card, tags: [], deckName: names[i] })),
    );
    return importCards(items, { kind: 'fromFile', fallbackName: pack.name }, now);
  });
}
