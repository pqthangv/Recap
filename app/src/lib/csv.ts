// CSV export (RFC 4180). The first four columns (deck, front, back, tags) are what the CSV
// importer reads, so an exported file can be imported again; the rest is the schedule.
import type { CardRow, Deck } from '@/db/schema';

import { formatTags } from './format';
import { State } from './scheduler';

type Cell = string | number | null | undefined;

function escapeCell(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  const s = String(cell);
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text with CRLF line endings. */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

export const CARD_CSV_COLUMNS = [
  'deck',
  'front',
  'back',
  'tags',
  'state',
  'due',
  'stability',
  'difficulty',
  'reps',
  'lapses',
  'last_review',
  'created_at',
  'id',
  'deck_id',
] as const;

const STATE_NAMES: Record<number, string> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const iso = (ms: number | null) => (ms == null ? '' : new Date(ms).toISOString());
const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Cards → CSV. Starts with a UTF-8 byte-order mark so Excel shows accents (e.g. Vietnamese)
 * correctly. Times are ISO 8601 UTC.
 */
export function cardsToCsv(cards: readonly CardRow[], decks: readonly Deck[]): string {
  const deckNames = new Map(decks.map((d) => [d.id, d.name]));
  const rows = cards.map((c) => {
    const isNew = c.state === State.New;
    return [
      deckNames.get(c.deck_id) ?? '',
      c.front,
      c.back,
      formatTags(c.tags),
      STATE_NAMES[c.state] ?? String(c.state),
      isNew ? '' : iso(c.due),
      isNew ? '' : round(c.stability),
      isNew ? '' : round(c.difficulty),
      c.reps,
      c.lapses,
      iso(c.last_review),
      iso(c.created_at),
      c.id,
      c.deck_id,
    ];
  });
  return '﻿' + toCsv([CARD_CSV_COLUMNS, ...rows]);
}
