// CSV/TSV import: parse the file, guess which columns are front/back/tags/deck, build cards.
import Papa from 'papaparse';

import { parseTags } from '../format';

export type Table = {
  /** Column titles: from the header row, or "Column 1", "Column 2", … */
  columns: string[];
  rows: string[][];
  hasHeader: boolean;
};

export type ColumnChoice = {
  front: number;
  back: number;
  /** -1 = none */
  tags: number;
  /** -1 = none. When set, cards go into decks named in this column. */
  deck: number;
};

export type TableCard = { front: string; back: string; tags: string[]; deckName?: string };

const HEADER_WORDS = {
  front: ['front', 'question', 'term', 'word', 'mặt trước', 'câu hỏi', 'từ'],
  back: ['back', 'answer', 'definition', 'meaning', 'mặt sau', 'câu trả lời', 'nghĩa'],
  tags: ['tags', 'tag', 'thẻ'],
  deck: ['deck', 'bộ thẻ'],
};

const norm = (s: string) => s.trim().toLowerCase();

function findColumn(header: string[], words: readonly string[]): number {
  return header.findIndex((h) => words.includes(norm(h)));
}

/** Parse CSV or TSV text (delimiter detected, or taken from Excel's optional "sep=;" line). */
export function parseTable(text: string): Table {
  const clean = text.replace(/^﻿/, '');
  const sep = /^sep=(.)\r?\n/i.exec(clean);
  const result = Papa.parse<string[]>(sep ? clean.slice(sep[0].length) : clean, {
    skipEmptyLines: 'greedy',
    delimiter: sep?.[1] ?? '',
  });
  const raw = result.data.map((row) => row.map((cell) => (cell ?? '').trim()));
  const width = raw.reduce((w, row) => Math.max(w, row.length), 0);
  const first = raw[0] ?? [];
  const hasHeader =
    findColumn(first, HEADER_WORDS.front) >= 0 && findColumn(first, HEADER_WORDS.back) >= 0;
  const columns = Array.from({ length: width }, (_, i) =>
    hasHeader && first[i] ? first[i] : `Column ${i + 1}`,
  );
  return { columns, rows: hasHeader ? raw.slice(1) : raw, hasHeader };
}

/** Best guess at which column is which. Recap's own CSV export is recognised exactly. */
export function guessColumns(table: Table): ColumnChoice {
  if (table.hasHeader) {
    const front = findColumn(table.columns, HEADER_WORDS.front);
    const back = findColumn(table.columns, HEADER_WORDS.back);
    return {
      front,
      back,
      tags: findColumn(table.columns, HEADER_WORDS.tags),
      deck: findColumn(table.columns, HEADER_WORDS.deck),
    };
  }
  // No header: front, back, then tags, as the import screen's example shows.
  const tags = table.columns.length >= 3 ? 2 : -1;
  return { front: 0, back: Math.min(1, table.columns.length - 1), tags, deck: -1 };
}

/** Rows → cards, skipping rows where front or back is empty. */
export function tableToCards(table: Table, choice: ColumnChoice): TableCard[] {
  const cards: TableCard[] = [];
  for (const row of table.rows) {
    const front = row[choice.front]?.trim() ?? '';
    const back = row[choice.back]?.trim() ?? '';
    if (!front || !back || choice.front === choice.back) continue;
    const card: TableCard = {
      front,
      back,
      tags: choice.tags >= 0 ? parseTags(row[choice.tags] ?? '') : [],
    };
    const deckName = choice.deck >= 0 ? row[choice.deck]?.trim() : '';
    if (deckName) card.deckName = deckName;
    cards.push(card);
  }
  return cards;
}
