// Writes small Anki packages to test/fixtures for the importer tests:
//   math.apkg       – schema 11, every way Anki decks write math (MathJax, [$], [$$], [latex])
//   basic.apkg      – classic collection (schema 11): Basic, reversed, cloze and a custom note type
//   schema18.apkg   – newer collection layout (separate tables, protobuf template configs)
//   latest.apkg     – Anki 2.1.50+ default export: zstd-compressed collection.anki21b (WAL mode,
//                     "unicase" collation), protobuf media map, zstd-compressed media, plus stub
//   new-format.apkg – a collection.anki21b that can't be decompressed (+ stub)
// Run: node scripts/make-anki-fixtures.js  (needs Node 22.15+ for zstd)
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
const JSZip = require('jszip');

const OUT = path.join(__dirname, '..', 'test', 'fixtures');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const MP3 = Buffer.from('ID3 not really audio');
const US = '\x1f';

function tempDb(name) {
  const file = path.join(os.tmpdir(), `recap-fixture-${process.pid}-${name}`);
  fs.rmSync(file, { force: true });
  return { file, db: new DatabaseSync(file) };
}

const NOTES_AND_CARDS = `
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null, flds text not null,
  sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null, type integer not null,
  queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
  time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);`;

let nextCardId = 1;
function addNote(db, { id, mid, tags, fields, cards }) {
  db.prepare('INSERT INTO notes VALUES (?, ?, ?, 0, -1, ?, ?, ?, 0, 0, ?)').run(
    id,
    `guid${id}`,
    mid,
    tags,
    fields.join(US),
    fields[0],
    '',
  );
  for (const [did, ord] of cards) {
    db.prepare(
      'INSERT INTO cards VALUES (?, ?, ?, ?, 0, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)',
    ).run(nextCardId++, id, did, ord, id, '');
  }
}

async function writeApkg(name, entries) {
  const zip = new JSZip();
  for (const [entryName, data] of Object.entries(entries)) zip.file(entryName, data);
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(OUT, name), bytes);
  console.log(`wrote test/fixtures/${name} (${bytes.length} bytes)`);
}

function finish({ file, db }) {
  db.close();
  const bytes = fs.readFileSync(file);
  fs.rmSync(file, { force: true });
  return bytes;
}

// --- basic.apkg (schema 11) -------------------------------------------------------------------

function schema11() {
  const t = tempDb('schema11.anki2');
  t.db.exec(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
    scm integer not null, ver integer not null, dty integer not null, usn integer not null,
    ls integer not null, conf text not null, models text not null, decks text not null,
    dconf text not null, tags text not null);${NOTES_AND_CARDS}`);
  const field = (name, ord) => ({ name, ord });
  const models = {
    1001: {
      id: 1001,
      name: 'Basic',
      type: 0,
      flds: [field('Front', 0), field('Back', 1)],
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}',
          afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
        },
      ],
    },
    1002: {
      id: 1002,
      name: 'Basic (and reversed card)',
      type: 0,
      flds: [field('Front', 0), field('Back', 1)],
      tmpls: [
        { name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' },
        { name: 'Card 2', ord: 1, qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr id=answer>{{Front}}' },
      ],
    },
    1003: {
      id: 1003,
      name: 'Cloze',
      type: 1,
      flds: [field('Text', 0), field('Back Extra', 1)],
      tmpls: [
        {
          name: 'Cloze',
          ord: 0,
          qfmt: '{{cloze:Text}}',
          afmt: '{{cloze:Text}}<br>\n{{Back Extra}}',
        },
      ],
    },
    1004: {
      id: 1004,
      name: 'Vocabulary',
      type: 0,
      flds: [field('Word', 0), field('Meaning', 1), field('Example', 2), field('Picture', 3)],
      tmpls: [
        {
          name: 'Recognise',
          ord: 0,
          qfmt: '<div class="word">{{Word}}</div>{{tts vi_VN:Word}}',
          afmt:
            '{{FrontSide}}<hr id=answer>{{Meaning}}{{#Example}}<br><i>{{Example}}</i>{{/Example}}' +
            '{{^Example}}<br>(no example){{/Example}}<br>{{Picture}}',
        },
      ],
    },
  };
  const decks = {
    1: { id: 1, name: 'Default' },
    1700000000001: { id: 1700000000001, name: 'Languages::Vietnamese' },
    1700000000002: { id: 1700000000002, name: 'Geography' },
  };
  t.db
    .prepare('INSERT INTO col VALUES (1, 0, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)')
    .run('{}', JSON.stringify(models), JSON.stringify(decks), '{}', '{}');

  const VI = 1700000000001;
  const GEO = 1700000000002;
  addNote(t.db, {
    id: 1,
    mid: 1001,
    tags: ' geo europe ',
    fields: ['Capital of <b>France</b>', 'Paris&nbsp;'],
    cards: [[GEO, 0]],
  });
  addNote(t.db, {
    id: 2,
    mid: 1001,
    tags: ' geo ',
    fields: ['<img src="flag%20of%20japan.png"><br>Which country?', 'Japan'],
    cards: [[GEO, 0]],
  });
  addNote(t.db, {
    id: 3,
    mid: 1002,
    tags: '',
    fields: ['cat', 'con mèo'],
    cards: [
      [VI, 0],
      [VI, 1],
    ],
  });
  addNote(t.db, {
    id: 4,
    mid: 1003,
    tags: ' history ',
    fields: ['{{c1::Hà Nội}} is the capital of {{c2::Vietnam::country}}.', 'Since 1010'],
    cards: [
      [1, 0],
      [1, 1],
    ],
  });
  addNote(t.db, {
    id: 5,
    mid: 1004,
    tags: '',
    fields: ['xin chào', 'hello', '', '<img src="wave.jpg">[sound:hello.mp3]'],
    cards: [[VI, 0]],
  });
  // Audio only: nothing to show as text, so it is skipped.
  addNote(t.db, { id: 6, mid: 1001, tags: '', fields: ['[sound:a.mp3]', 'x'], cards: [[GEO, 0]] });
  return finish(t);
}

// --- schema18.apkg (newer layout) ------------------------------------------------------------

function varint(n) {
  const out = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
  return Buffer.from(out);
}

/** A protobuf message: numbers become varints, strings and buffers length-delimited fields. */
function proto(...fields) {
  const parts = [];
  for (const [num, value] of fields) {
    if (typeof value === 'number') parts.push(varint(num * 8), varint(value));
    else {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
      parts.push(varint(num * 8 + 2), varint(bytes.length), bytes);
    }
  }
  return Buffer.concat(parts);
}

// Real Anki collections declare "COLLATE unicase", which only Anki defines, so SQLite here can't
// create them. Tables are created with the same-length "COLLATE nocase " and patched afterwards.
const COLLATE = 'COLLATE nocase ';

function schema18({ latest = false } = {}) {
  const t = tempDb(latest ? 'latest.anki21b' : 'schema18.anki21');
  const collate = latest ? COLLATE : '';
  t.db.exec(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
    scm integer not null, ver integer not null, dty integer not null, usn integer not null,
    ls integer not null, conf text not null, models text not null, decks text not null,
    dconf text not null, tags text not null);
    CREATE TABLE notetypes (id integer primary key, name text not null, mtime_secs integer not null,
      usn integer not null, config blob not null);
    CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null,
      config blob not null, primary key (ntid, ord));
    CREATE TABLE templates (ntid integer not null, ord integer not null, name text not null,
      mtime_secs integer not null, usn integer not null, config blob not null, primary key (ntid, ord));
    CREATE TABLE decks (id integer primary key, name text not null ${collate}, mtime_secs integer not null,
      usn integer not null, common blob not null, kind blob not null);${NOTES_AND_CARDS}`);
  // Anki 2.1.50+ saves collections in WAL mode (SQLite header bytes 18 and 19 become 2).
  if (latest) t.db.exec('PRAGMA journal_mode = WAL');
  t.db.prepare("INSERT INTO col VALUES (1, 0, 0, 0, 18, 0, 0, 0, '', '', '', '', '')").run();
  t.db.prepare('INSERT INTO notetypes VALUES (2001, ?, 0, 0, ?)').run('Basic', proto([1, 0]));
  t.db.prepare('INSERT INTO notetypes VALUES (2002, ?, 0, 0, ?)').run('Cloze', proto([1, 1]));
  for (const [ntid, ord, name] of [
    [2001, 0, 'Front'],
    [2001, 1, 'Back'],
    [2002, 0, 'Text'],
    [2002, 1, 'Back Extra'],
  ]) {
    t.db.prepare('INSERT INTO fields VALUES (?, ?, ?, ?)').run(ntid, ord, name, Buffer.alloc(0));
  }
  t.db
    .prepare('INSERT INTO templates VALUES (2001, 0, ?, 0, 0, ?)')
    .run('Card 1', proto([1, '{{Front}}'], [2, '{{FrontSide}}<hr id=answer>{{Back}}']));
  t.db
    .prepare('INSERT INTO templates VALUES (2002, 0, ?, 0, 0, ?)')
    .run('Cloze', proto([1, '{{cloze:Text}}'], [2, '{{cloze:Text}}<br>{{Back Extra}}']));
  t.db
    .prepare('INSERT INTO decks VALUES (?, ?, 0, 0, ?, ?)')
    .run(3001, `Science${US}Chemistry`, Buffer.alloc(0), Buffer.alloc(0));
  addNote(t.db, {
    id: 10,
    mid: 2001,
    tags: ' chem ',
    fields: ['H₂O', 'Water'],
    cards: [[3001, 0]],
  });
  addNote(t.db, {
    id: 11,
    mid: 2002,
    tags: '',
    fields: ['Salt is {{c1::NaCl}}.', ''],
    cards: [[3001, 0]],
  });
  if (latest) {
    addNote(t.db, {
      id: 12,
      mid: 2001,
      tags: '',
      fields: ['<img src="atom.png">Smallest unit of an element', 'Atom'],
      cards: [[3001, 0]],
    });
    // The deck was exported without this picture, so it isn't in the package.
    addNote(t.db, {
      id: 13,
      mid: 2001,
      tags: '',
      fields: ['What does a cell look like?', 'Round<br><img src="cell.png">'],
      cards: [[3001, 0]],
    });
  }
  const bytes = finish(t);
  return latest
    ? Buffer.from(bytes.toString('latin1').split(COLLATE).join('COLLATE unicase'), 'latin1')
    : bytes;
}

function placeholderCollection() {
  const t = tempDb('stub.anki2');
  t.db.exec(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
    scm integer not null, ver integer not null, dty integer not null, usn integer not null,
    ls integer not null, conf text not null, models text not null, decks text not null,
    dconf text not null, tags text not null);${NOTES_AND_CARDS}`);
  t.db.prepare('INSERT INTO col VALUES (1, 0, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)').run(
    '{}',
    JSON.stringify({
      1: {
        name: 'Basic',
        type: 0,
        flds: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 },
        ],
        tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
      },
    }),
    JSON.stringify({ 1: { name: 'Default' } }),
    '{}',
    '{}',
  );
  addNote(t.db, {
    id: 1,
    mid: 1,
    tags: '',
    fields: [
      'Please update to the latest Anki version, then import the .colpkg/.apkg file again.',
      '',
    ],
    cards: [[1, 0]],
  });
  return finish(t);
}

// --- math.apkg (schema 11): the ways Anki decks write math ------------------------------------
function mathCollection() {
  const t = tempDb('math.anki2');
  t.db.exec(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
    scm integer not null, ver integer not null, dty integer not null, usn integer not null,
    ls integer not null, conf text not null, models text not null, decks text not null,
    dconf text not null, tags text not null);${NOTES_AND_CARDS}`);
  const field = (name, ord) => ({ name, ord });
  const models = {
    2001: {
      id: 2001,
      name: 'Basic',
      type: 0,
      flds: [field('Front', 0), field('Back', 1)],
      tmpls: [
        { name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' },
      ],
    },
    2002: {
      id: 2002,
      name: 'Cloze',
      type: 1,
      flds: [field('Text', 0), field('Back Extra', 1)],
      tmpls: [
        { name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' },
      ],
    },
  };
  const ALGEBRA = 1700000000101;
  const decks = { 1: { id: 1, name: 'Default' }, [ALGEBRA]: { id: ALGEBRA, name: 'Algebra' } };
  t.db
    .prepare('INSERT INTO col VALUES (1, 0, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)')
    .run('{}', JSON.stringify(models), JSON.stringify(decks), '{}', '{}');
  const notes = [
    ['What is \\(\\frac{1}{2}\\) of 10?', '5'], // MathJax, Anki 2.1's default
    ['Mass–energy equivalence', '\\[E = mc^2\\]'],
    ['Square of x', '[$]x^2[/$]'], // Anki's older LaTeX tags
    ['Area under y = x from 0 to 1', '[$$]\\int_0^1 x\\,dx = \\tfrac{1}{2}[/$$]'],
    ['Pythagoras', '[latex]$a^2 + b^2 = c^2$[/latex]'], // LaTeX text with its own $
    ['Root two', '[latex]\\sqrt{2}[/latex]'],
    ['Is \\(a &lt; b\\) when \\(b - a &gt; 0\\)?', 'Yes'], // HTML entities inside a formula
    ['A notebook costs', '$5 and a pen $2'], // prices, not math
  ];
  notes.forEach(([front, back], i) =>
    addNote(t.db, {
      id: 100 + i,
      mid: 2001,
      tags: '',
      fields: [front, back],
      cards: [[ALGEBRA, 0]],
    }),
  );
  addNote(t.db, {
    id: 120,
    mid: 2002,
    tags: '',
    fields: ['{{c1::\\(x = 3\\)}} solves \\(x^2 = 9\\) for positive x.', ''],
    cards: [[ALGEBRA, 0]],
  });
  return finish(t);
}

// `node scripts/make-anki-fixtures.js math.apkg` writes only that file (zip dates make every
// regenerated file differ, so the others are left alone).
const ONLY = process.argv.slice(2);
const wanted = (name) => ONLY.length === 0 || ONLY.includes(name);

// Built in this order (card ids come from one counter, so math.apkg goes last and the older
// files keep their ids).
const PACKAGES = [
  [
    'basic.apkg',
    () => ({
      'collection.anki2': schema11(),
      media: JSON.stringify({ 0: 'flag of japan.png', 1: 'wave.jpg', 2: 'hello.mp3' }),
      0: PNG,
      1: JPG,
      2: MP3,
    }),
  ],
  ['schema18.apkg', () => ({ 'collection.anki21': schema18(), media: '{}' })],
  // MediaEntries { repeated MediaEntry entries = 1 }, MediaEntry { name = 1, size = 2 };
  // entry i is stored in the zip as "i".
  [
    'latest.apkg',
    () => ({
      'collection.anki2': placeholderCollection(),
      'collection.anki21b': zlib.zstdCompressSync(schema18({ latest: true })),
      media: zlib.zstdCompressSync(proto([1, proto([1, 'atom.png'], [2, PNG.length])])),
      0: zlib.zstdCompressSync(PNG),
    }),
  ],
  [
    'new-format.apkg',
    () => ({
      'collection.anki2': placeholderCollection(),
      'collection.anki21b': Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 1, 2, 3]),
      media: Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
    }),
  ],
  ['math.apkg', () => ({ 'collection.anki2': mathCollection(), media: '{}' })],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, build] of PACKAGES) {
    const entries = build(); // built even when skipped, so card ids stay the same
    if (wanted(name)) await writeApkg(name, entries);
  }
})();
