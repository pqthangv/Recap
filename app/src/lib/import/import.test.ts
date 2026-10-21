import { fixtureBytes, fixtureText, openCollection } from '../../../test/fixtures';
import { cardsToCsv } from '../csv';

import {
  AnkiImportError,
  deckDisplayName,
  readAnkiCollection,
  renderCloze,
  renderTemplate,
  type AnkiCard,
} from './anki';
import { t } from '../i18n';
import { hasMath } from '../math/parse';
import { fromAnkiMath } from './ankiMath';
import { isImageName, openApkg } from './apkg';
import { guessColumns, parseTable, tableToCards } from './csv';
import { decodeEntities, extractImages, htmlToText } from './html';
import { detectSeparator, parsePaste } from './paste';

describe('htmlToText', () => {
  it('keeps line breaks and drops tags, sounds and entities', () => {
    expect(htmlToText('Capital of <b>France</b>')).toBe('Capital of France');
    expect(htmlToText('one<br>two<div>three</div>four')).toBe('one\ntwo\nthree\nfour');
    expect(htmlToText('Paris&nbsp; &amp; &lt;Lyon&gt; &#39;x&#x27;')).toBe("Paris & <Lyon> 'x'");
    expect(htmlToText('hello[sound:hello.mp3]')).toBe('hello');
    expect(htmlToText('<ul><li>a</li><li>b</li></ul>')).toBe('• a\n• b');
    expect(htmlToText('<style>.x{}</style>  lots   of\tspace  ')).toBe('lots of space');
  });

  it('finds local pictures and decodes their names', () => {
    expect(extractImages('<img src="flag%20of%20japan.png"> <img src=\'b.jpg\'>')).toEqual([
      'flag of japan.png',
      'b.jpg',
    ]);
    expect(extractImages('<img src="https://example.com/x.png">')).toEqual([]);
    expect(decodeEntities('&eacute;&#233;&unknown;')).toBe('&eacute;é&unknown;');
    expect(isImageName('cat.JPG')).toBe(true);
    expect(isImageName('hello.mp3')).toBe(false);
  });
});

describe('fromAnkiMath', () => {
  it("turns Anki's math tags into $ and $$, and leaves the rest", () => {
    expect(fromAnkiMath('[$]x^2[/$] and [$$] y [/$$]')).toBe('$x^2$ and $$y$$');
    expect(fromAnkiMath('[LATEX]\\sqrt{2}[/LATEX]')).toBe('$$\\sqrt{2}$$');
    expect(fromAnkiMath('[latex]\\begin{align}a&=b\\end{align}[/latex]')).toBe(
      '\\begin{align}a&=b\\end{align}',
    );
    expect(fromAnkiMath('a [b] c, \\(x\\)')).toBe('a [b] c, \\(x\\)');
  });
});

describe('paste import', () => {
  it('detects the separator', () => {
    expect(detectSeparator(['chat - cat', 'chien - dog'])).toBe('dash');
    expect(detectSeparator(['chat\tcat'])).toBe('tab');
    expect(detectSeparator(['chat;cat', 'a - b;c'])).toBe('semicolon');
    expect(detectSeparator(['no separator here'])).toBeNull();
  });

  it('splits on the first separator and reports lines it skipped', () => {
    const result = parsePaste('chat - cat\n\nwell-known - famous - very\nno separator\n  – \n');
    expect(result.separator).toBe('dash');
    expect(result.cards).toEqual([
      { front: 'chat', back: 'cat' },
      { front: 'well-known', back: 'famous - very' },
    ]);
    expect(result.skipped).toEqual(['no separator', '–']);
  });

  it("doesn't split inside a formula", () => {
    expect(parsePaste('$a - b$ - difference\n$x; y$; a pair').cards).toEqual([
      { front: '$a - b$', back: 'difference' },
    ]);
    expect(parsePaste('$f(x) = x - 1$ - shift\n$a - b$ - difference').cards).toEqual([
      { front: '$f(x) = x - 1$', back: 'shift' },
      { front: '$a - b$', back: 'difference' },
    ]);
    expect(parsePaste('$x; y$;a pair\n$p; q$;another').cards).toEqual([
      { front: '$x; y$', back: 'a pair' },
      { front: '$p; q$', back: 'another' },
    ]);
  });

  it('handles Vietnamese and en dashes', () => {
    expect(parsePaste('xin chào – hello').cards).toEqual([{ front: 'xin chào', back: 'hello' }]);
  });

  it('handles CRLF, trailing tabs, mixed separators and blank input', () => {
    expect(parsePaste('a\tb\t\r\nc\td').cards).toEqual([
      { front: 'a', back: 'b' },
      { front: 'c', back: 'd' },
    ]);
    // The most common separator wins; other lines are shown as skipped.
    expect(parsePaste('a - b\nc;d\ne - f')).toMatchObject({ separator: 'dash', skipped: ['c;d'] });
    expect(parsePaste('   \n\t\n')).toEqual({ separator: null, cards: [], skipped: [] });
  });
});

describe('CSV import', () => {
  it('reads quoted cells, commas, line breaks and accents', () => {
    const table = parseTable(fixtureText('simple.csv'));
    expect(table.hasHeader).toBe(false);
    expect(table.columns).toEqual(['Column 1', 'Column 2']);
    const cards = tableToCards(table, guessColumns(table));
    expect(cards).toEqual([
      { front: 'cat', back: 'con mèo', tags: [] },
      { front: 'hello, friend', back: 'xin chào bạn', tags: [] },
      { front: 'multi\nline', back: 'answer with "quotes"', tags: [] },
    ]);
  });

  it('uses a header row (and strips the byte-order mark)', () => {
    const table = parseTable(fixtureText('with-header.csv'));
    expect(table.hasHeader).toBe(true);
    const choice = guessColumns(table);
    expect(choice).toEqual({ front: 0, back: 1, tags: 2, deck: -1 });
    expect(tableToCards(table, choice)[1]).toEqual({
      front: 'Capital of Peru?',
      back: 'Lima',
      tags: ['geo', 'south america'],
    });
  });

  it('reads front, back and tags without a header, like the example on the import screen', () => {
    const table = parseTable('front1\tback1\ttag1, tag2, tag3\nfront2\tback2\ttag1\n');
    expect(guessColumns(table)).toEqual({ front: 0, back: 1, tags: 2, deck: -1 });
    expect(tableToCards(table, guessColumns(table))).toEqual([
      { front: 'front1', back: 'back1', tags: ['tag1', 'tag2', 'tag3'] },
      { front: 'front2', back: 'back2', tags: ['tag1'] },
    ]);
  });

  it('detects tabs and semicolons', () => {
    expect(
      tableToCards(
        parseTable(fixtureText('words.tsv')),
        guessColumns(parseTable(fixtureText('words.tsv'))),
      ),
    ).toHaveLength(2);
    const semi = parseTable(fixtureText('semicolon.csv'));
    expect(tableToCards(semi, guessColumns(semi))[0]).toMatchObject({
      front: 'Haus',
      back: 'house',
    });
  });

  it('handles one-line files, Excel separator lines, CRLF and repeated rows', () => {
    const cards = (text: string) => {
      const table = parseTable(text);
      return tableToCards(table, guessColumns(table));
    };
    expect(cards('Haus;house')).toEqual([{ front: 'Haus', back: 'house', tags: [] }]);
    const excel = parseTable('sep=;\r\nHaus;house, building\r\nKatze;cat\r\n');
    expect(excel.rows).toHaveLength(2);
    expect(tableToCards(excel, guessColumns(excel))[0].back).toBe('house, building');
    expect(cards('a,1,\r\nb,2,\r\n')).toHaveLength(2);
    expect(parseTable('Front,Back\n').rows).toEqual([]);
    expect(parseTable('Mặt trước,Mặt sau\nchó,dog').hasHeader).toBe(true);
    // Repeats stay in the preview; importCards skips them (tested in db/import.test.ts).
    expect(cards('a,1\na,1')).toHaveLength(2);
  });

  it("imports Recap's own CSV export, deck column included", () => {
    const csv = cardsToCsv(
      [
        {
          id: 'c1',
          deck_id: 'd1',
          front: 'Line 1\nLine 2',
          back: 'Tiếng Việt',
          image_uri: null,
          image_side: null,
          tags: ['a', 'b'],
          reverse_of: null,
          due: 0,
          stability: 0,
          difficulty: 0,
          elapsed_days: 0,
          scheduled_days: 0,
          learning_steps: 0,
          reps: 0,
          lapses: 0,
          state: 0,
          last_review: null,
          created_at: 0,
          updated_at: 0,
          deleted_at: null,
        },
      ],
      [
        {
          id: 'd1',
          name: 'Words, "quoted"',
          color: '#000',
          front_lang: null,
          back_lang: null,
          created_at: 0,
          updated_at: 0,
          deleted_at: null,
        },
      ],
    );
    const table = parseTable(csv);
    const choice = guessColumns(table);
    expect(choice).toEqual({ front: 1, back: 2, tags: 3, deck: 0 });
    expect(tableToCards(table, choice)).toEqual([
      {
        front: 'Line 1\nLine 2',
        back: 'Tiếng Việt',
        tags: ['a', 'b'],
        deckName: 'Words, "quoted"',
      },
    ]);
  });
});

describe('Anki templates', () => {
  const ctx = (fields: Record<string, string>) => ({
    fields: new Map(Object.entries(fields)),
    frontSide: '',
    cloze: null,
    answer: false,
    tags: '',
    deck: 'Deck',
    card: 'Card 1',
    noteType: 'Basic',
  });

  it('fills fields, sections and filters', () => {
    const c = ctx({ Front: 'Q', Extra: '', Kanji: '漢字[かんじ]' });
    expect(renderTemplate('{{Front}}{{#Extra}}!{{/Extra}}{{^Extra}}?{{/Extra}}', c)).toBe('Q?');
    expect(renderTemplate('{{text:Front}} {{type:Front}} {{tts en_US:Front}}', c)).toBe('Q  ');
    expect(renderTemplate('{{kanji:Kanji}}/{{kana:Kanji}}/{{furigana:Kanji}}', c)).toBe(
      '漢字/かんじ/漢字(かんじ)',
    );
    expect(renderTemplate('{{Missing}}{{!comment}}{{Deck}}', c)).toBe('Deck');
  });

  it('hides the right cloze and shows hints', () => {
    const text = '{{c1::Hà Nội}} is the capital of {{c2::Vietnam::country}}.';
    expect(renderCloze(text, 1, false)).toBe('[...] is the capital of Vietnam.');
    expect(renderCloze(text, 2, false)).toBe('Hà Nội is the capital of [country].');
    expect(renderCloze(text, 2, true)).toBe('Hà Nội is the capital of Vietnam.');
  });

  it('names decks for Recap', () => {
    expect(deckDisplayName('Languages::Vietnamese', 'file')).toBe('Languages › Vietnamese');
    expect(deckDisplayName('Default', 'My deck')).toBe('My deck');
  });
});

describe('Anki packages', () => {
  async function read(name: string): Promise<{ cards: AnkiCard[]; skipped: number }> {
    const pkg = await openApkg(fixtureBytes(name));
    const { reader, close } = openCollection(pkg.collection);
    try {
      return readAnkiCollection(reader, 'shared deck');
    } finally {
      close();
    }
  }

  it('reads every way Anki decks write math, as math Recap draws', async () => {
    const { cards } = await read('math.apkg');
    expect(cards.map((c) => [c.front, c.back])).toEqual([
      ['What is \\(\\frac{1}{2}\\) of 10?', '5'],
      ['Mass–energy equivalence', '\\[E = mc^2\\]'],
      ['Square of x', '$x^2$'],
      ['Area under y = x from 0 to 1', '$$\\int_0^1 x\\,dx = \\tfrac{1}{2}$$'],
      ['Pythagoras', '$a^2 + b^2 = c^2$'],
      ['Root two', '$$\\sqrt{2}$$'],
      ['Is \\(a < b\\) when \\(b - a > 0\\)?', 'Yes'],
      ['A notebook costs', '$5 and a pen $2'],
      [
        '[...] solves \\(x^2 = 9\\) for positive x.',
        '\\(x = 3\\) solves \\(x^2 = 9\\) for positive x.',
      ],
    ]);
    const math = cards.map((c) => hasMath(c.front) || hasMath(c.back));
    expect(math).toEqual([true, true, true, true, true, true, true, false, true]);
  });

  it('reads a classic deck: basic, reversed, cloze, custom templates and pictures', async () => {
    const { cards, skipped } = await read('basic.apkg');
    expect(skipped).toBe(1); // the audio-only note
    expect(cards).toEqual([
      {
        front: 'Capital of France',
        back: 'Paris',
        tags: ['geo', 'europe'],
        deckName: 'Geography',
      },
      {
        front: 'Which country?',
        back: 'Japan',
        tags: ['geo'],
        deckName: 'Geography',
        image: { name: 'flag of japan.png', side: 'front' },
      },
      { front: 'cat', back: 'con mèo', tags: [], deckName: 'Languages › Vietnamese' },
      { front: 'con mèo', back: 'cat', tags: [], deckName: 'Languages › Vietnamese' },
      {
        front: '[...] is the capital of Vietnam.',
        back: 'Hà Nội is the capital of Vietnam.\nSince 1010',
        tags: ['history'],
        deckName: 'shared deck',
      },
      {
        front: 'Hà Nội is the capital of [country].',
        back: 'Hà Nội is the capital of Vietnam.\nSince 1010',
        tags: ['history'],
        deckName: 'shared deck',
      },
      {
        front: 'xin chào',
        back: 'hello\n(no example)',
        tags: [],
        deckName: 'Languages › Vietnamese',
        image: { name: 'wave.jpg', side: 'back' },
      },
    ]);
  });

  it('loads pictures from the package', async () => {
    const pkg = await openApkg(fixtureBytes('basic.apkg'));
    expect((await pkg.readMedia('flag of japan.png'))?.length).toBeGreaterThan(20);
    expect(pkg.hasMedia('flag of japan.png')).toBe(true);
    expect(await pkg.readMedia('missing.png')).toBeNull();
    expect(pkg.hasMedia('missing.png')).toBe(false);
  });

  it('reads the newer collection layout', async () => {
    const { cards } = await read('schema18.apkg');
    expect(cards).toEqual([
      { front: 'H₂O', back: 'Water', tags: ['chem'], deckName: 'Science › Chemistry' },
      { front: 'Salt is [...].', back: 'Salt is NaCl.', tags: [], deckName: 'Science › Chemistry' },
    ]);
  });

  it('reads the default export of Anki 2.1.50+ (compressed, WAL mode, protobuf media map)', async () => {
    // The stub collection.anki2 ("please update Anki") must be ignored.
    const { cards, skipped } = await read('latest.apkg');
    expect(skipped).toBe(0);
    expect(cards).toEqual([
      { front: 'H₂O', back: 'Water', tags: ['chem'], deckName: 'Science › Chemistry' },
      { front: 'Salt is [...].', back: 'Salt is NaCl.', tags: [], deckName: 'Science › Chemistry' },
      {
        front: 'Smallest unit of an element',
        back: 'Atom',
        tags: [],
        deckName: 'Science › Chemistry',
        image: { name: 'atom.png', side: 'front' },
      },
      {
        front: 'What does a cell look like?',
        back: 'Round',
        tags: [],
        deckName: 'Science › Chemistry',
        image: { name: 'cell.png', side: 'back' },
      },
    ]);
  });

  it('decompresses pictures and knows which ones the export left out', async () => {
    const pkg = await openApkg(fixtureBytes('latest.apkg'));
    expect(pkg.hasMedia('atom.png')).toBe(true);
    expect(pkg.hasMedia('cell.png')).toBe(false);
    const png = await pkg.readMedia('atom.png');
    expect([...(png ?? new Uint8Array()).subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // "PNG"
    expect(await pkg.readMedia('cell.png')).toBeNull();
  });

  it('explains how to re-export decks in the newest format', async () => {
    await expect(openApkg(fixtureBytes('new-format.apkg'))).rejects.toThrow(t('anki.newFormat'));
  });

  it('rejects files that are not decks', async () => {
    await expect(openApkg(new TextEncoder().encode('hello'))).rejects.toBeInstanceOf(
      AnkiImportError,
    );
  });
});
