// Reading cards out of an Anki collection (the SQLite database inside an .apkg file).
// Only the file format is used here: notes, note types and decks. Cards are imported as new;
// review history isn't carried over.
import { DECK_PATH_SEPARATOR } from '../deckGroups';
import { t } from '../i18n';

import { extractImages, htmlToText } from './html';

export class AnkiImportError extends Error {}

/** Minimal read-only SQL access, so the app (expo-sqlite) and tests (node:sqlite) share code. */
export type SqlReader = { all<T>(sql: string): T[] };

export type AnkiCard = {
  front: string;
  back: string;
  tags: string[];
  deckName: string;
  /** A picture used by the card (file name inside the package) and the side it belongs to. */
  image?: { name: string; side: 'front' | 'back' };
};

export type AnkiReadResult = {
  cards: AnkiCard[];
  /** Cards that couldn't be turned into text (e.g. audio-only). */
  skipped: number;
};

type Template = { ord: number; name: string; qfmt: string; afmt: string };
type Model = { name: string; cloze: boolean; fields: string[]; templates: Template[] };

const FIELD_SEPARATOR = '\x1f';

// --- Collection structure ------------------------------------------------------------------

function tableNames(db: SqlReader): Set<string> {
  return new Set(
    db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name),
  );
}

function parseJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string' || !text.trim().startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Older collections (schema 11) keep note types and decks as JSON in the `col` table. */
function readSchema11(
  db: SqlReader,
): { models: Map<string, Model>; decks: Map<string, string> } | null {
  const col = db.all<{ models: string; decks: string }>('SELECT models, decks FROM col LIMIT 1')[0];
  const modelsJson = parseJson(col?.models);
  const decksJson = parseJson(col?.decks);
  if (!modelsJson || Object.keys(modelsJson).length === 0) return null;
  const models = new Map<string, Model>();
  for (const [id, raw] of Object.entries(modelsJson)) {
    const m = raw as {
      name?: string;
      type?: number;
      flds?: { name: string; ord: number }[];
      tmpls?: { name?: string; ord: number; qfmt?: string; afmt?: string }[];
    };
    const fields = [...(m.flds ?? [])].sort((a, b) => a.ord - b.ord).map((f) => f.name);
    const templates = (m.tmpls ?? []).map((t) => ({
      ord: t.ord,
      name: t.name ?? '',
      qfmt: t.qfmt ?? '',
      afmt: t.afmt ?? '',
    }));
    models.set(id, { name: m.name ?? '', cloze: m.type === 1, fields, templates });
  }
  const decks = new Map<string, string>();
  for (const [id, raw] of Object.entries(decksJson ?? {})) {
    decks.set(id, String((raw as { name?: string }).name ?? ''));
  }
  return { models, decks };
}

// Newer collections (schema 18) use separate tables, with template text stored as protobuf.
// We read just two strings from it; if that fails, cards fall back to "first field → back".

function readVarint(bytes: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (pos < bytes.length) {
    const b = bytes[pos++];
    result += (b & 0x7f) * 2 ** shift;
    if (b < 0x80) return [result, pos];
    shift += 7;
  }
  throw new Error('Bad varint');
}

/** Every top-level field of a protobuf message, in order (repeated fields appear many times). */
export function protobufFields(bytes: Uint8Array): [number, number | Uint8Array][] {
  const out: [number, number | Uint8Array][] = [];
  let pos = 0;
  while (pos < bytes.length) {
    const [key, afterKey] = readVarint(bytes, pos);
    pos = afterKey;
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) {
      const [value, next] = readVarint(bytes, pos);
      out.push([field, value]);
      pos = next;
    } else if (wire === 2) {
      const [len, start] = readVarint(bytes, pos);
      out.push([field, bytes.subarray(start, start + len)]);
      pos = start + len;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else throw new Error('Unsupported protobuf wire type');
  }
  return out;
}

/** Top-level fields of a protobuf message: numbers for varints, bytes for length-delimited. */
export function readProtobuf(bytes: Uint8Array): Map<number, number | Uint8Array> {
  return new Map(protobufFields(bytes));
}

const utf8 = new TextDecoder();

/** Blobs can come from another JS realm (tests), so check for any typed-array view. */
function asBytes(value: unknown): Uint8Array | null {
  if (!ArrayBuffer.isView(value)) return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function protoString(config: unknown, field: number): string {
  const bytes = asBytes(config);
  if (!bytes) return '';
  try {
    const value = readProtobuf(bytes).get(field);
    return value instanceof Uint8Array ? utf8.decode(value) : '';
  } catch {
    return '';
  }
}

function protoNumber(config: unknown, field: number): number {
  const bytes = asBytes(config);
  if (!bytes) return 0;
  try {
    const value = readProtobuf(bytes).get(field);
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

function readSchema18(db: SqlReader): { models: Map<string, Model>; decks: Map<string, string> } {
  const models = new Map<string, Model>();
  for (const nt of db.all<{ id: number; name: string; config: unknown }>(
    'SELECT id, name, config FROM notetypes',
  )) {
    // Notetype.Config: field 1 = kind (1 = cloze).
    models.set(String(nt.id), {
      name: nt.name,
      cloze: protoNumber(nt.config, 1) === 1,
      fields: [],
      templates: [],
    });
  }
  for (const f of db.all<{ ntid: number; ord: number; name: string }>(
    'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord',
  )) {
    models.get(String(f.ntid))?.fields.push(f.name);
  }
  for (const t of db.all<{ ntid: number; ord: number; name: string; config: unknown }>(
    'SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord',
  )) {
    // Template.Config: field 1 = question format, field 2 = answer format.
    models.get(String(t.ntid))?.templates.push({
      ord: t.ord,
      name: t.name,
      qfmt: protoString(t.config, 1),
      afmt: protoString(t.config, 2),
    });
  }
  const decks = new Map<string, string>();
  for (const d of db.all<{ id: number; name: string }>('SELECT id, name FROM decks')) {
    decks.set(String(d.id), d.name.split(FIELD_SEPARATOR).join('::'));
  }
  return { models, decks };
}

// --- Template rendering ----------------------------------------------------------------------

type RenderContext = {
  fields: Map<string, string>;
  frontSide: string;
  /** Cloze number being studied (1-based), and whether the answer is shown. */
  cloze: { n: number; answer: boolean } | null;
  /** Rendering the answer side (shows {{type:Field}} answers). */
  answer: boolean;
  tags: string;
  deck: string;
  card: string;
  noteType: string;
};

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export function renderCloze(text: string, n: number, answer: boolean): string {
  return text.replace(CLOZE, (_m, num: string, content: string, hint?: string) => {
    if (Number(num) !== n || answer) return content;
    return hint ? `[${hint}]` : '[...]';
  });
}

export function clozeNumbers(text: string): number[] {
  return [...new Set([...text.matchAll(CLOZE)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

function fieldValue(ctx: RenderContext, name: string): string {
  if (ctx.fields.has(name)) return ctx.fields.get(name) ?? '';
  const lower = name.toLowerCase();
  for (const [key, value] of ctx.fields) if (key.toLowerCase() === lower) return value;
  return '';
}

function applyFilter(filter: string, value: string, ctx: RenderContext): string {
  const f = filter.trim().toLowerCase();
  if (f === 'cloze') return ctx.cloze ? renderCloze(value, ctx.cloze.n, ctx.cloze.answer) : value;
  // Type-in-the-answer: a typing box on the question side, the expected answer on the answer side.
  if (f === 'type') return ctx.answer ? value : '';
  if (f.startsWith('tts')) return ''; // text-to-speech marker; the text is shown elsewhere
  if (f === 'kanji') return value.replace(/ ?([^ >[]+?)\[[^\]]*\]/g, '$1');
  if (f === 'kana') return value.replace(/ ?([^ >[]+?)\[([^\]]*)\]/g, '$2');
  if (f === 'furigana') return value.replace(/ ?([^ >[]+?)\[([^\]]*)\]/g, '$1($2)');
  return value; // text, hint and unknown filters: show the content
}

function replaceTag(inner: string, ctx: RenderContext): string {
  const tag = inner.trim();
  if (!tag || tag[0] === '!' || tag[0] === '/') return '';
  const parts = tag.split(':');
  const name = (parts.pop() ?? '').trim();
  let value: string;
  switch (name) {
    case 'FrontSide':
      value = ctx.frontSide;
      break;
    case 'Tags':
      value = ctx.tags;
      break;
    case 'Deck':
      value = ctx.deck;
      break;
    case 'Subdeck':
      value = ctx.deck.split('::').pop() ?? '';
      break;
    case 'Card':
      value = ctx.card;
      break;
    case 'Type':
      value = ctx.noteType;
      break;
    case 'CardFlag':
      value = '';
      break;
    default:
      value = fieldValue(ctx, name);
  }
  for (const filter of parts.reverse()) value = applyFilter(filter, value, ctx);
  return value;
}

const hasContent = (html: string) => htmlToText(html) !== '' || extractImages(html).length > 0;

/** Renders an Anki card template ({{Field}}, {{#Field}}…{{/Field}}, filters, {{FrontSide}}). */
export function renderTemplate(template: string, ctx: RenderContext): string {
  let out = template;
  // Resolve conditional sections from the innermost out.
  const section = /\{\{([#^])\s*([^}]+?)\s*\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\s*\2\s*\}\}/;
  for (let i = 0; i < 100; i++) {
    const m = section.exec(out);
    if (!m) break;
    const [whole, kind, name, body] = m;
    const filled = hasContent(replaceTag(name, ctx));
    const keep = kind === '#' ? filled : !filled;
    out = out.slice(0, m.index) + (keep ? body : '') + out.slice(m.index + whole.length);
  }
  return out.replace(/\{\{([^{}]+?)\}\}/g, (_m, inner: string) => replaceTag(inner, ctx));
}

// --- Cards ------------------------------------------------------------------------------------

/** "Languages::Spanish" → "Languages › Spanish"; Anki's empty "Default" deck → the file name. */
export function deckDisplayName(ankiName: string, fileName: string): string {
  const trimmed = ankiName.trim();
  if (!trimmed || trimmed === 'Default') return fileName;
  return trimmed
    .split('::')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(DECK_PATH_SEPARATOR);
}

function firstImage(html: string) {
  return extractImages(html)[0];
}

export function readAnkiCollection(db: SqlReader, fileName: string): AnkiReadResult {
  const tables = tableNames(db);
  if (!tables.has('notes') || !tables.has('cards')) {
    throw new AnkiImportError(t('anki.noCards'));
  }
  const structure =
    (tables.has('col') ? readSchema11(db) : null) ??
    (tables.has('notetypes') ? readSchema18(db) : null);
  if (!structure) throw new AnkiImportError(t('anki.notAnki'));
  const { models, decks } = structure;

  const rows = db.all<{
    did: number;
    odid: number;
    ord: number;
    mid: number;
    flds: string;
    tags: string;
  }>(
    'SELECT c.did AS did, c.odid AS odid, c.ord AS ord, n.mid AS mid, n.flds AS flds, n.tags AS tags ' +
      'FROM cards c JOIN notes n ON n.id = c.nid ORDER BY n.id, c.ord',
  );

  const cards: AnkiCard[] = [];
  let skipped = 0;
  for (const row of rows) {
    const model = models.get(String(row.mid));
    const values = String(row.flds ?? '').split(FIELD_SEPARATOR);
    const fieldNames = model?.fields.length ? model.fields : values.map((_, i) => `Field ${i + 1}`);
    const fields = new Map(fieldNames.map((name, i) => [name, values[i] ?? '']));
    const tags = String(row.tags ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const deckId = String(row.odid ? row.odid : row.did);
    const deckName = decks.get(deckId) ?? '';

    // Use the note type's templates; fall back to plain fields only when it has none.
    const result =
      model && model.templates.some((t) => t.qfmt)
        ? renderAnkiCard(model, fields, row.ord, tags, deckName)
        : fallbackCard(values);
    if (!result) {
      skipped++;
      continue;
    }
    const card: AnkiCard = {
      front: result.front,
      back: result.back,
      tags,
      deckName: deckDisplayName(deckName, fileName),
    };
    if (result.image) card.image = result.image;
    cards.push(card);
  }
  return { cards, skipped };
}

type RenderedCard = Pick<AnkiCard, 'front' | 'back' | 'image'>;

function renderAnkiCard(
  model: Model,
  fields: Map<string, string>,
  ord: number,
  tags: string[],
  deck: string,
): RenderedCard | null {
  const template = model.cloze
    ? model.templates[0]
    : (model.templates.find((t) => t.ord === ord) ?? model.templates[0]);
  if (!template || !template.qfmt) return null;
  const cloze = model.cloze ? { n: ord + 1, answer: false } : null;
  // A cloze card whose number is no longer in the note (Anki leaves these empty).
  if (cloze && ![...fields.values()].some((v) => clozeNumbers(v).includes(cloze.n))) return null;
  const ctx: RenderContext = {
    fields,
    frontSide: '',
    cloze,
    answer: false,
    tags: tags.join(' '),
    deck,
    card: template.name,
    noteType: model.name,
  };
  const frontHtml = renderTemplate(template.qfmt, ctx);
  // Recap already shows the question above the answer, so keep only the answer part: without
  // {{FrontSide}}, and after Anki's answer marker (<hr id=answer>) when the template has one.
  const answerHtml = renderTemplate(template.afmt, {
    ...ctx,
    cloze: cloze ? { n: cloze.n, answer: true } : null,
    answer: true,
  });
  const marker = /<hr\b[^>]*\bid\s*=\s*["']?answer\b["']?[^>]*>/i.exec(answerHtml);
  const backHtml = marker ? answerHtml.slice(marker.index + marker[0].length) : answerHtml;
  const front = htmlToText(frontHtml);
  let back = htmlToText(backHtml);
  const frontImage = firstImage(frontHtml);
  const backImage = firstImage(backHtml);
  if (!front && !frontImage) return null;
  if (!back && !backImage) {
    // Unusual template: fall back to the note's other fields.
    back = [...fields.values()].slice(1).map(htmlToText).filter(Boolean).join('\n');
    if (!back) return null;
  }
  const image = frontImage
    ? { name: frontImage, side: 'front' as const }
    : backImage
      ? { name: backImage, side: 'back' as const }
      : undefined;
  return { front: front || '(picture)', back: back || '(picture)', image };
}

/** No usable note type: first field is the front, the rest is the back. */
function fallbackCard(values: string[]): RenderedCard | null {
  const front = htmlToText(values[0] ?? '');
  const back = values.slice(1).map(htmlToText).filter(Boolean).join('\n');
  if (!front || !back) return null;
  const frontImage = firstImage(values[0] ?? '');
  const backImage = values.slice(1).map(firstImage).find(Boolean);
  const image = frontImage
    ? { name: frontImage, side: 'front' as const }
    : backImage
      ? { name: backImage, side: 'back' as const }
      : undefined;
  return { front, back, image };
}
