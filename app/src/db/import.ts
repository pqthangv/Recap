// Saving imported cards (from a pasted list, a CSV file or an Anki deck).
import { and, eq, isNull } from 'drizzle-orm';

import { newCard } from '@/lib/scheduler';
import { newId } from '@/lib/id';
import { deckColors } from '@/lib/theme';

import { db } from './client';
import { createDeck, listDecks } from './decks';
import { cards, type CardRow, type Deck } from './schema';
import { transaction } from './transaction';

export type ImportItem = {
  front: string;
  back: string;
  tags: string[];
  /** Used when the target is "decks from the file". */
  deckName?: string;
  imageUri?: string | null;
  imageSide?: 'front' | 'back' | null;
};

export type ImportTarget =
  | { kind: 'existing'; deckId: string }
  | { kind: 'new'; name: string }
  /** Each card goes to the deck named in the file (created if needed); `fallbackName` otherwise. */
  | { kind: 'fromFile'; fallbackName: string };

export type ImportSummary = {
  added: number;
  /** Cards already in the deck (same front and back), not added again. */
  skipped: number;
  decks: { id: string; name: string; added: number }[];
  /** Pictures the added cards use (copied pictures not in here can be deleted). */
  imageUris: string[];
};

const CHUNK = 200;
const key = (front: string, back: string) => `${front}\u0000${back}`;

/**
 * Adds cards as new cards. Decks are matched by name (ignoring case) so importing into "Spanish"
 * twice doesn't make two Spanish decks, and duplicates are skipped: cards whose front and back
 * are already in the deck (so importing a file again adds nothing), and repeats within the file.
 * Within the file the picture counts too, so "Which bird?" with two different photos stays two
 * cards. Against the deck only the text counts: pictures saved before 1.0.3 have other names, so
 * comparing them would add those cards again.
 */
export function importCards(
  items: readonly ImportItem[],
  target: ImportTarget,
  now = Date.now(),
): ImportSummary {
  const existing = listDecks();
  const byName = new Map(existing.map((d) => [d.name.trim().toLowerCase(), d]));
  let colorIndex = existing.length;

  const deckNamed = (name: string): Deck => {
    const clean = name.trim() || 'Imported';
    const found = byName.get(clean.toLowerCase());
    if (found) return found;
    const deck = createDeck(
      { name: clean, color: deckColors[colorIndex++ % deckColors.length] },
      now,
    );
    byName.set(clean.toLowerCase(), deck);
    return deck;
  };

  const inDeck = new Map<string, Set<string>>();
  const alreadyInDeck = (deckId: string) => {
    let set = inDeck.get(deckId);
    if (!set) {
      set = new Set(
        db
          .select({ front: cards.front, back: cards.back })
          .from(cards)
          .where(and(eq(cards.deck_id, deckId), isNull(cards.deleted_at)))
          .all()
          .map((c) => key(c.front, c.back)),
      );
      inDeck.set(deckId, set);
    }
    return set;
  };
  const addedNow = new Set<string>();

  return transaction(() => {
    const fixed =
      target.kind === 'existing'
        ? existing.find((d) => d.id === target.deckId)
        : target.kind === 'new'
          ? deckNamed(target.name)
          : undefined;
    if (target.kind === 'existing' && !fixed) throw new Error('Deck not found');

    const rows: CardRow[] = [];
    const counts = new Map<string, { id: string; name: string; added: number }>();
    let skipped = 0;
    items.forEach((item, i) => {
      const front = item.front.trim();
      const back = item.back.trim();
      if (!front || !back) {
        skipped++;
        return;
      }
      const deck =
        fixed ??
        deckNamed(item.deckName?.trim() || (target.kind === 'fromFile' ? target.fallbackName : ''));
      const imageUri = item.imageUri ?? null;
      const fileKey = `${deck.id}\u0000${key(front, back)}\u0000${imageUri ?? ''}`;
      if (alreadyInDeck(deck.id).has(key(front, back)) || addedNow.has(fileKey)) {
        skipped++;
        return;
      }
      addedNow.add(fileKey);
      // Stagger creation times so cards keep the file's order.
      const at = now + i;
      rows.push({
        id: newId(),
        deck_id: deck.id,
        front,
        back,
        image_uri: imageUri,
        image_side: imageUri ? (item.imageSide ?? 'front') : null,
        tags: item.tags,
        reverse_of: null,
        ...newCard(at),
        created_at: at,
        updated_at: at,
        deleted_at: null,
      });
      const count = counts.get(deck.id) ?? { id: deck.id, name: deck.name, added: 0 };
      count.added++;
      counts.set(deck.id, count);
    });
    for (let i = 0; i < rows.length; i += CHUNK) {
      db.insert(cards)
        .values(rows.slice(i, i + CHUNK))
        .run();
    }
    const imageUris = [...new Set(rows.flatMap((r) => (r.image_uri ? [r.image_uri] : [])))];
    return { added: rows.length, skipped, decks: [...counts.values()], imageUris };
  });
}
