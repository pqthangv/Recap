import { and, asc, eq, gte, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';

import { newId } from '@/lib/id';
import { normalizePictureRef } from '@/lib/pictures';
import { newCard } from '@/lib/scheduler';

import { db } from './client';
import { RESTORE_DAYS } from './decks';
import { cards, type CardRow } from './schema';
import { transaction } from './transaction';

export type PictureSide = 'front' | 'back';
export type CardPicture = { ref: string; side: PictureSide };

export type CardInput = {
  deckId: string;
  front: string;
  back: string;
  tags: string[];
  /** Also keep a second, linked card with front and back swapped. */
  reverse: boolean;
  /** A picture ("media/<name>", see lib/pictures.ts) and the side it shows on. */
  picture?: CardPicture | null;
};

const flip = (side: PictureSide): PictureSide => (side === 'back' ? 'front' : 'back');

/** The card's picture as stored in its row (the reverse card shows it on the other side). */
function pictureColumns(picture: CardPicture | null | undefined, reverse = false) {
  if (!picture) return { image_uri: null, image_side: null };
  return { image_uri: picture.ref, image_side: reverse ? flip(picture.side) : picture.side };
}

/** The picture of a card row, for the editor. */
export function cardPicture(card: Pick<CardRow, 'image_uri' | 'image_side'>): CardPicture | null {
  return card.image_uri ? { ref: card.image_uri, side: card.image_side ?? 'front' } : null;
}

const live = isNull(cards.deleted_at);

function buildCard(
  fields: Pick<CardRow, 'deck_id' | 'front' | 'back' | 'tags' | 'reverse_of'> &
    Partial<Pick<CardRow, 'image_uri' | 'image_side'>>,
  now: number,
): CardRow {
  return {
    id: newId(),
    image_uri: null,
    image_side: null,
    ...fields,
    ...newCard(now),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

/** Creates a card, plus its reverse card when asked. Returns the main card. */
export function createCard(input: CardInput, now = Date.now()): CardRow {
  const card = buildCard(
    {
      deck_id: input.deckId,
      front: input.front.trim(),
      back: input.back.trim(),
      tags: input.tags,
      reverse_of: null,
      ...pictureColumns(input.picture),
    },
    now,
  );
  transaction(() => {
    db.insert(cards).values(card).run();
    if (input.reverse) db.insert(cards).values(reverseOf(card, now)).run();
  });
  return card;
}

function reverseOf(card: CardRow, now: number): CardRow {
  return buildCard(
    {
      deck_id: card.deck_id,
      front: card.back,
      back: card.front,
      tags: card.tags,
      reverse_of: card.id,
      // A picture stays with its text, so it moves to the other side on the reverse card.
      image_uri: card.image_uri,
      image_side: card.image_uri ? flip(card.image_side ?? 'front') : null,
    },
    now,
  );
}

export function getCard(id: string): CardRow | undefined {
  return db
    .select()
    .from(cards)
    .where(and(eq(cards.id, id), live))
    .get();
}

function liveReverse(primaryId: string): CardRow | undefined {
  return db
    .select()
    .from(cards)
    .where(and(eq(cards.reverse_of, primaryId), live))
    .get();
}

/**
 * The card to show in the editor. Opening a reverse card edits its main card, so the pair is
 * always edited together.
 */
export function getCardForEdit(id: string): { card: CardRow; hasReverse: boolean } | undefined {
  const opened = getCard(id);
  if (!opened) return undefined;
  const card = (opened.reverse_of && getCard(opened.reverse_of)) || opened;
  return { card, hasReverse: card.id !== opened.id || liveReverse(card.id) !== undefined };
}

/**
 * Updates the text and picture of a card (and its reverse). Scheduling is untouched. Leaving
 * `picture` out keeps the card's picture as it is.
 */
export function updateCard(id: string, input: CardInput, now = Date.now()): void {
  const main = getCard(id);
  if (!main) return;
  const front = input.front.trim();
  const back = input.back.trim();
  const picture = input.picture === undefined ? cardPicture(main) : input.picture;
  const reverse = liveReverse(id);
  transaction(() => {
    db.update(cards)
      .set({
        deck_id: input.deckId,
        front,
        back,
        tags: input.tags,
        ...pictureColumns(picture),
        updated_at: now,
      })
      .where(eq(cards.id, id))
      .run();
    if (input.reverse && reverse) {
      db.update(cards)
        .set({
          deck_id: input.deckId,
          front: back,
          back: front,
          tags: input.tags,
          ...pictureColumns(picture, true),
          updated_at: now,
        })
        .where(eq(cards.id, reverse.id))
        .run();
    } else if (input.reverse) {
      const updated = {
        ...main,
        deck_id: input.deckId,
        front,
        back,
        tags: input.tags,
        ...pictureColumns(picture),
      };
      db.insert(cards).values(reverseOf(updated, now)).run();
    } else if (reverse) {
      db.update(cards)
        .set({ deleted_at: now, updated_at: now })
        .where(eq(cards.id, reverse.id))
        .run();
    }
  });
}

/**
 * Soft-deletes cards. Deleting a main card also deletes its reverse card.
 * Returns every id that was deleted, for "Undo".
 */
export function deleteCards(ids: string[], now = Date.now()): string[] {
  if (ids.length === 0) return [];
  const reverses = db
    .select({ id: cards.id })
    .from(cards)
    .where(and(inArray(cards.reverse_of, ids), live))
    .all()
    .map((r) => r.id);
  const all = [...new Set([...ids, ...reverses])];
  db.update(cards)
    .set({ deleted_at: now, updated_at: now })
    .where(and(inArray(cards.id, all), live))
    .run();
  return all;
}

export function restoreCards(ids: string[], now = Date.now()): void {
  if (ids.length === 0) return;
  db.update(cards).set({ deleted_at: null, updated_at: now }).where(inArray(cards.id, ids)).run();
}

const CHUNK = 500;

/**
 * Moves cards to another deck, keeping each card and its reverse card together. Scheduling and
 * history are untouched. Returns every id that moved, so "Undo" can move them back.
 */
export function moveCards(ids: readonly string[], deckId: string, now = Date.now()): string[] {
  if (ids.length === 0) return [];
  const all = new Set(ids);
  transaction(() => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const partners = db
        .select({ id: cards.id, reverse_of: cards.reverse_of })
        .from(cards)
        .where(and(or(inArray(cards.reverse_of, chunk), inArray(cards.id, chunk)), live))
        .all();
      for (const p of partners) {
        all.add(p.id);
        if (p.reverse_of) all.add(p.reverse_of);
      }
    }
    const moving = [...all];
    for (let i = 0; i < moving.length; i += CHUNK) {
      db.update(cards)
        .set({ deck_id: deckId, updated_at: now })
        .where(and(inArray(cards.id, moving.slice(i, i + CHUNK)), live))
        .run();
    }
  });
  return [...all];
}

/** Cards in one deck, or in several (a deck group). */
export function countCards(deckIds: string | readonly string[]): number {
  const ids = typeof deckIds === 'string' ? [deckIds] : [...deckIds];
  if (ids.length === 0) return 0;
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(cards)
    .where(and(inArray(cards.deck_id, ids), live))
    .get();
  return row?.n ?? 0;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Cards in a deck, optionally filtered by text. Returns a query (`.all()` runs it). */
export function deckCardsQuery(deckId: string, search: string) {
  const term = search.trim();
  const pattern = `%${escapeLike(term)}%`;
  const matches = term
    ? or(
        like(cards.front, sql`${pattern} ESCAPE '\\'`),
        like(cards.back, sql`${pattern} ESCAPE '\\'`),
      )
    : undefined;
  return db
    .select({
      id: cards.id,
      front: cards.front,
      back: cards.back,
      reverse_of: cards.reverse_of,
      state: cards.state,
    })
    .from(cards)
    .where(and(eq(cards.deck_id, deckId), live, matches))
    .orderBy(asc(cards.created_at), asc(cards.id));
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Pictures that must stay on the phone: those of live cards, and of cards deleted recently enough
 * to come back ("Recently deleted" decks, with a day to spare).
 */
export function keptPictureRefs(now = Date.now()): string[] {
  const since = now - (RESTORE_DAYS + 1) * DAY;
  return db
    .selectDistinct({ ref: cards.image_uri })
    .from(cards)
    .where(
      and(isNotNull(cards.image_uri), or(isNull(cards.deleted_at), gte(cards.deleted_at, since))),
    )
    .all()
    .flatMap((r) => (r.ref ? [r.ref] : []));
}

/** Which of these pictures any card uses, deleted cards included (Undo can bring those back). */
export function pictureRefsInUse(refs: readonly string[]): Set<string> {
  const used = new Set<string>();
  for (let i = 0; i < refs.length; i += CHUNK) {
    db.selectDistinct({ ref: cards.image_uri })
      .from(cards)
      .where(inArray(cards.image_uri, refs.slice(i, i + CHUNK)))
      .all()
      .forEach((r) => r.ref && used.add(r.ref));
  }
  return used;
}

/**
 * Cards from before 1.0.3 stored their picture's full path, which changes on iPhone when the app
 * is updated. Rewrites those to "media/<name>" (run at start-up). The picture is the same, only
 * written differently, so `updated_at` stays; backups are rewritten the same way when read.
 */
export function normalizeStoredPictureRefs(): number {
  const old = db
    .selectDistinct({ ref: cards.image_uri })
    .from(cards)
    .where(like(cards.image_uri, 'file:%'))
    .all();
  let changed = 0;
  transaction(() => {
    for (const { ref } of old) {
      const normalized = normalizePictureRef(ref);
      if (!ref || !normalized) continue;
      db.update(cards).set({ image_uri: normalized }).where(eq(cards.image_uri, ref)).run();
      changed++;
    }
  });
  return changed;
}
