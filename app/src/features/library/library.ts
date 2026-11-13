// The Library's list (which packs a chip shows, in what order) and adding a pack to your decks.
import { createDeck, listDecks } from '@/db/decks';
import { importCards, type ImportSummary } from '@/db/import';
import { transaction } from '@/db/transaction';
import { DECK_PATH_SEPARATOR } from '@/lib/deckGroups';
import type { Language } from '@/lib/i18n';

import { PACK_CATEGORIES, type Pack, type PackCategory, type PackDeck } from './packs';

const lower = (name: string) => name.trim().toLowerCase();

/** A Library chip: every pack, or one category. */
export type LibraryFilter = 'all' | PackCategory;

/** The categories that have a pack, in chip order. */
export function libraryCategories(packs: readonly Pack[]): PackCategory[] {
  return PACK_CATEGORIES.filter((category) => packs.some((p) => p.category === category));
}

/**
 * The packs a chip shows: those made for speakers of the app's language first, then those for
 * everyone, then those for speakers of other languages; otherwise in the packs' own order.
 */
export function libraryPacks(
  packs: readonly Pack[],
  filter: LibraryFilter,
  appLanguage: Language,
): Pack[] {
  const rank = (pack: Pack) => (!pack.speakers ? 1 : pack.speakers === appLanguage ? 0 : 2);
  return packs
    .map((pack, i) => ({ pack, i }))
    .filter(({ pack }) => filter === 'all' || pack.category === filter)
    .sort((a, b) => rank(a.pack) - rank(b.pack) || a.i - b.i)
    .map(({ pack }) => pack);
}

/** The pack's deck names on the phone: "SAT vocabulary › Set 1", … */
export function packDeckNames(pack: Pack): string[] {
  return pack.decks.map((deck) => `${pack.name}${DECK_PATH_SEPARATOR}${deck.name}`);
}

export function packCardCount(pack: Pack): number {
  return pack.decks.reduce((n, deck) => n + deck.count, 0);
}

/** True when all the pack's decks are on the phone (its button then opens them instead). */
export function isPackAdded(pack: Pack, decks: readonly { name: string }[]): boolean {
  const names = new Set(decks.map((d) => lower(d.name)));
  const wanted = packDeckNames(pack);
  return wanted.length > 0 && wanted.every((name) => names.has(lower(name)));
}

/**
 * Adds the pack's decks (in the pack's color, read aloud in its languages) and its cards as new
 * cards, in the pack's order. `decks`: its cards, from loadPackDecks (packCards.ts).
 * Adding it again only brings back what's missing: cards already in a deck are skipped.
 */
export function addPack(pack: Pack, decks: readonly PackDeck[], now = Date.now()): ImportSummary {
  const names = decks.map((deck) => `${pack.name}${DECK_PATH_SEPARATOR}${deck.name}`);
  return transaction(() => {
    const existing = new Set(listDecks().map((d) => lower(d.name)));
    names.forEach((name, i) => {
      if (!existing.has(lower(name))) {
        createDeck({ name, color: pack.color, languages: pack.languages }, now + i);
      }
    });
    const items = decks.flatMap((deck, i) =>
      deck.cards.map((card) => ({ ...card, tags: [], deckName: names[i] })),
    );
    return importCards(items, { kind: 'fromFile', fallbackName: pack.name }, now);
  });
}
