// The website's deck pages (pack-pages.ts). Writes them into public/ with
//   MAKE_PACK_PAGES=1 npx jest scripts/pack-pages
// (PowerShell: $env:MAKE_PACK_PAGES='1'; npx jest scripts/pack-pages); otherwise checks the files
// there are what it would write, so a changed pack or line fails `npm test` until they're redone.
import { packCardCount, packDecks } from '@/features/library/library';
import { PACKS } from '@/features/library/packs';
import { en } from '@/lib/i18n/en';
import { translationNow } from '@/lib/i18n/load';

import {
  escapeHtml,
  PAGE_LINES,
  packPath,
  pageLanguage,
  SITE,
  sitePages,
  sitePaths,
} from './pack-pages';

/* eslint-disable @typescript-eslint/no-require-imports */
// library.ts adds packs to the database; the pages only read the packs, but it opens one anyway.
jest.mock('@/db/client', () => require('../test/db').createTestClient());
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const PUBLIC = path.join(__dirname, '..', 'public');
const WRITE = !!process.env.MAKE_PACK_PAGES;

let files: Record<string, string> = {};
beforeAll(async () => {
  files = await sitePages();
});

(WRITE ? it : it.skip)('writes the pages', () => {
  fs.rmSync(path.join(PUBLIC, 'decks'), { recursive: true, force: true });
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(PUBLIC, file)), { recursive: true });
    fs.writeFileSync(path.join(PUBLIC, file), text);
  }
  console.log(`${Object.keys(files).length} files in public/`);
});

describe("the website's deck pages", () => {
  (WRITE ? it.skip : it)(
    'are up to date (else run MAKE_PACK_PAGES=1 npx jest scripts/pack-pages)',
    () => {
      const read = (file: string) => {
        const on = path.join(PUBLIC, file);
        return fs.existsSync(on) ? fs.readFileSync(on, 'utf8') : null;
      };
      const stale = Object.keys(files).filter((file) => read(file) !== files[file]);
      expect(stale).toEqual([]);
      const pages = Object.keys(files).filter((file) => file.startsWith('decks/'));
      expect(
        fs
          .readdirSync(path.join(PUBLIC, 'decks'))
          .map((f: string) => `decks/${f}`)
          .sort(),
      ).toEqual(pages.sort());
    },
  );

  it('has a page for every pack, in its language, listing every card it adds', async () => {
    for (const pack of PACKS) {
      const html = files[`decks/${pack.id}.html`]!;
      expect(html).toContain(`<html lang="${pageLanguage(pack)}">`);
      expect(html).toContain(`<h1>${escapeHtml(pack.name)}</h1>`);
      expect(html).toContain(`<link rel="canonical" href="${SITE}${packPath(pack)}" />`);
      const decks = await packDecks(pack);
      const rows = html.match(/<div><dt>/g) ?? [];
      expect(rows.length).toBe(packCardCount(pack));
      for (const card of decks.flatMap((deck) => deck.cards)) {
        const word = escapeHtml(card.front.split('\n')[0]!.trim());
        const meaning = escapeHtml(card.back.split('\n')[0]!.trim());
        expect(html).toContain(`<dt>${word}</dt><dd>${meaning}</dd>`);
      }
    }
  });

  it("has every line in each page's own language, none left in English", () => {
    for (const pack of PACKS) {
      const lang = pageLanguage(pack);
      if (lang === 'en') continue;
      const text = translationNow(lang)!;
      const missing = [...PAGE_LINES, pack.description].filter((key) => text[key] === undefined);
      expect({ pack: pack.id, missing }).toEqual({ pack: pack.id, missing: [] });
    }
  });

  it('fills in every blank and keeps page text out of the markup', () => {
    for (const [file, text] of Object.entries(files)) {
      expect({ file, blanks: text.match(/\{\w+\}/g) }).toEqual({ file, blanks: null });
    }
    expect(escapeHtml('Tom & Jerry <b> "hi"')).toBe('Tom &amp; Jerry &lt;b&gt; &quot;hi&quot;');
  });

  it('loads nothing from other sites', () => {
    for (const [file, text] of Object.entries(files)) {
      const loaded = [...text.matchAll(/<(?:script|img|link|iframe|source)\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => !tag.includes('rel="canonical"'))
        .filter((tag) => /(src|href)="https?:/.test(tag));
      expect({ file, loaded }).toEqual({ file, loaded: [] });
      expect(text).not.toContain('<script');
    }
  });

  it('lists every page in the sitemap, and robots.txt points there', () => {
    const sitemap = files['sitemap.xml']!;
    for (const pack of PACKS) expect(sitemap).toContain(`<loc>${SITE}${packPath(pack)}</loc>`);
    expect(sitemap.match(/<loc>/g)?.length).toBe(sitePaths().length);
    expect(files['robots.txt']).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it('only uses lines en.ts has', () => {
    for (const key of PAGE_LINES) expect(en[key]).toBeDefined();
  });
});
