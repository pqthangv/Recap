// Grouping decks by name: "SAT Vocab › Priority 1" and "SAT Vocab › Priority 2" are shown as one
// "SAT Vocab" group. Groups come only from deck names (no extra column), so renaming a deck moves
// it in or out of a group, and they sync like any other name. Anki imports name sub-decks this way.

import type { DeckSort } from './settings';
import { deckColors } from './theme';

/** Between the parts of a deck name ("Languages › Spanish"). */
export const DECK_PATH_SEPARATOR = ' › ';

type Named = { name: string };

export type DeckListItem<D extends Named> =
  { kind: 'deck'; deck: D } | { kind: 'group'; name: string; decks: D[] };

const groupKey = (deckName: string) => groupOf(deckName).toLowerCase();

/** "SAT Vocab › Priority 1" → "SAT Vocab"; a name without a separator is its own group. */
export function groupOf(deckName: string): string {
  return deckName.split(DECK_PATH_SEPARATOR)[0].trim();
}

/** The deck's name inside its group: "SAT Vocab › Priority 1" → "Priority 1". */
export function nameInGroup(deckName: string): string {
  const parts = deckName.split(DECK_PATH_SEPARATOR);
  return parts.length > 1 ? parts.slice(1).join(DECK_PATH_SEPARATOR).trim() : deckName.trim();
}

export function decksInGroup<D extends Named>(decks: readonly D[], group: string): D[] {
  const key = group.trim().toLowerCase();
  return decks.filter((d) => groupKey(d.name) === key);
}

/**
 * The home list: decks that share a first name part (at least two of them) become one group,
 * placed where its first deck would be. A lone "Languages › Spanish" stays a plain deck.
 */
export function groupDecks<D extends Named>(decks: readonly D[]): DeckListItem<D>[] {
  const byKey = new Map<string, D[]>();
  for (const deck of decks) {
    const members = byKey.get(groupKey(deck.name));
    if (members) members.push(deck);
    else byKey.set(groupKey(deck.name), [deck]);
  }
  const items: DeckListItem<D>[] = [];
  const placed = new Set<string>();
  for (const deck of decks) {
    const key = groupKey(deck.name);
    const members = byKey.get(key) ?? [];
    if (members.length < 2) items.push({ kind: 'deck', deck });
    else if (!placed.has(key)) {
      placed.add(key);
      items.push({ kind: 'group', name: groupOf(members[0].name), decks: members });
    }
  }
  return items;
}

type Counts = { due: number; new: number };

/**
 * A group's due and new counts. Per-deck new counts are already capped at today's allowance, so
 * the group total is capped again at the overall new count (`totalNew`).
 */
export function groupCounts(
  decks: readonly { id: string }[],
  byDeck: Record<string, Counts>,
  totalNew: number,
): Counts {
  let due = 0;
  let fresh = 0;
  for (const d of decks) {
    due += byDeck[d.id]?.due ?? 0;
    fresh += byDeck[d.id]?.new ?? 0;
  }
  return { due, new: Math.min(fresh, totalNew) };
}

/** A group's dot: the color of the deck named like the group, else of its first deck. */
export function groupColor(decks: readonly { name: string; color: string }[]): string {
  if (decks.length === 0) return deckColors[0];
  const key = groupKey(decks[0].name);
  return (decks.find((d) => d.name.trim().toLowerCase() === key) ?? decks[0]).color;
}

/** Position of a color in the deck palette; colors from elsewhere (imports) go last. */
export function colorRank(color: string): number {
  const index = deckColors.findIndex((c) => c.toLowerCase() === color.toLowerCase());
  return index === -1 ? deckColors.length : index;
}

const itemColor = <D extends Named & { color: string }>(item: DeckListItem<D>) =>
  item.kind === 'deck' ? item.deck.color : groupColor(item.decks);

/** By name (the order decks come in), or by color in palette order (then by name). */
export function sortDeckItems<D extends Named & { color: string }>(
  items: readonly DeckListItem<D>[],
  by: DeckSort,
): DeckListItem<D>[] {
  if (by === 'name') return [...items];
  // Array.prototype.sort is stable, so equal colors keep their name order.
  return [...items].sort((a, b) => colorRank(itemColor(a)) - colorRank(itemColor(b)));
}

export function sortDecks<D extends { color: string }>(decks: readonly D[], by: DeckSort): D[] {
  if (by === 'name') return [...decks];
  return [...decks].sort((a, b) => colorRank(a.color) - colorRank(b.color));
}
