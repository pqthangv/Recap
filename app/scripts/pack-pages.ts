// The website's page for each Library pack, so people searching for a word list ("Spanish basics
// flashcards", "từ vựng tiếng Anh cơ bản") find Recap. Each page is in the pack's language and lists
// every card the pack adds (word and meaning), with links to study it in the browser or get the
// app. Also /decks (every pack), robots.txt and sitemap.xml. Plain files in public/: the website
// only, the phone app doesn't carry them. Written by scripts/pack-pages.test.ts:
//   MAKE_PACK_PAGES=1 npx jest scripts/pack-pages
// and every `npm test` fails while they're out of date (a pack or one of these lines changed).
// Nothing from other sites (public/_headers only lets a page load its own files) and nothing that
// tracks visitors.
import { packCardCount, packDecks } from '@/features/library/library';
import { PACKS, type Pack } from '@/features/library/packs';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/contact';
import { type Language, type StringKey, setLanguage, t, tn } from '@/lib/i18n';

export const SITE = 'https://recapflashcards.com';

/** A pack page's address. Cloudflare Pages answers it with decks/<id>.html. */
export const packPath = (pack: Pack): string => `/decks/${pack.id}`;

/** What a pack's page is written in: the language of its learners (its meanings), else English. */
export const pageLanguage = (pack: Pack): Language => pack.speakers ?? 'en';

/** The lines a page shows in its own language (with the pack's description and counts). */
export const PAGE_LINES: readonly StringKey[] = [
  'site.flashcards_one',
  'site.flashcards_other',
  'site.studyOnline',
  'site.about',
  'site.packsTitle',
  'home.getAndroid',
  'home.getIphone',
  'settings.help',
  'settings.privacy',
  'count.deck_one',
  'count.deck_other',
  'count.card_one',
  'count.card_other',
];

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Text made safe inside HTML, in an element or a "quoted" attribute. */
export const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (c) => ENTITIES[c]!);

const firstLine = (side: string) => side.split('\n')[0]!.trim();

const STYLE = `
      :root {
        --ink: #1a1530;
        --muted: #5e5873;
        --accent: #5a31d6;
        --line: #e6e3ef;
        --tint: #eeeafd;
      }
      body {
        margin: 0;
        background: #fff;
        color: var(--ink);
        font: 17px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: 20px 20px 64px;
      }
      a {
        color: var(--accent);
      }
      .brand {
        font-size: 20px;
        font-weight: 700;
        text-decoration: none;
      }
      h1 {
        font-size: 30px;
        line-height: 1.25;
        margin: 28px 0 8px;
      }
      h2 {
        font-size: 20px;
        margin: 36px 0 4px;
      }
      p {
        margin: 8px 0;
      }
      .muted {
        color: var(--muted);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 20px 0;
      }
      .button {
        flex: 1 1 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 20px;
        box-sizing: border-box;
        border: 2px solid var(--accent);
        border-radius: 14px;
        font-weight: 600;
        text-align: center;
        text-decoration: none;
      }
      .primary {
        background: var(--accent);
        color: #fff;
      }
      .about {
        background: var(--tint);
        border-radius: 14px;
        padding: 16px 20px;
      }
      dl {
        margin: 0;
      }
      dl div {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
        gap: 16px;
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
      }
      dt {
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      ul.packs {
        list-style: none;
        padding: 0;
      }
      ul.packs li {
        padding: 12px 0;
        border-bottom: 1px solid var(--line);
      }
      ul.packs a {
        font-size: 19px;
        font-weight: 600;
      }
      footer {
        margin-top: 48px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
        font-size: 15px;
      }
      footer a {
        display: inline-block;
        margin-right: 16px;
        line-height: 48px;
      }
`;

type Layout = { lang: Language; title: string; description: string; path: string; body: string };

/** The page around its content: title, description and address for search engines and links. */
function layout({ lang, title, description, path, body }: Layout): string {
  const url = `${SITE}${path}`;
  const footer = [
    `<a href="/">Recap</a>`,
    `<a href="/decks">${escapeHtml(t('site.packsTitle'))}</a>`,
    `<a href="/support">${escapeHtml(t('settings.help'))}</a>`,
    `<a href="/privacy">${escapeHtml(t('settings.privacy'))}</a>`,
  ].join('');
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Recap" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <style>${STYLE}    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="/">Recap</a>
${body}
      <footer>${footer}</footer>
    </main>
  </body>
</html>
`;
}

/** "20 decks · 1,000 cards", in the language shown. */
const sizes = (pack: Pack) =>
  `${tn('count.deck', pack.decks.length)} · ${tn('count.card', packCardCount(pack))}`;

async function packPage(pack: Pack): Promise<string> {
  const lang = pageLanguage(pack);
  await setLanguage(lang);
  const decks = await packDecks(pack);
  const description = t(pack.description);
  const topics = decks.map((deck) => {
    const rows = deck.cards.map(
      (card) =>
        `          <div><dt>${escapeHtml(firstLine(card.front))}</dt><dd>${escapeHtml(firstLine(card.back))}</dd></div>`,
    );
    // "01 Greetings & basics" sorts the decks in the app; the page shows them in order anyway.
    const name = deck.name.replace(/^\d+\s+/, '');
    return `      <section>
        <h2>${escapeHtml(name)}</h2>
        <dl>
${rows.join('\n')}
        </dl>
      </section>`;
  });
  const body = `      <h1>${escapeHtml(pack.name)}</h1>
      <p>${escapeHtml(description)}</p>
      <p class="muted">${escapeHtml(sizes(pack))}</p>
      <div class="actions">
        <a class="button primary" href="/library">${escapeHtml(t('site.studyOnline'))}</a>
        <a class="button" href="${PLAY_STORE_URL}">${escapeHtml(t('home.getAndroid'))}</a>
        <a class="button" href="${APP_STORE_URL}">${escapeHtml(t('home.getIphone'))}</a>
      </div>
      <p class="about">${escapeHtml(t('site.about'))}</p>
${topics.join('\n')}`;
  return layout({
    lang,
    title: `${pack.name}: ${tn('site.flashcards', packCardCount(pack))} · Recap`,
    description,
    path: packPath(pack),
    body,
  });
}

/** /decks: every pack, each line in its own page's language. */
async function indexPage(): Promise<string> {
  const items: string[] = [];
  for (const pack of PACKS) {
    const lang = pageLanguage(pack);
    await setLanguage(lang);
    items.push(`        <li lang="${lang}">
          <a href="${packPath(pack)}">${escapeHtml(pack.name)}</a>
          <p>${escapeHtml(t(pack.description))}</p>
          <p class="muted">${escapeHtml(sizes(pack))}</p>
        </li>`);
  }
  await setLanguage('en');
  const title = t('site.packsTitle');
  return layout({
    lang: 'en',
    title: `${title} · Recap`,
    description: `${title}: ${PACKS.map((pack) => pack.name).join(', ')}.`,
    path: '/decks',
    body: `      <h1>${escapeHtml(title)}</h1>
      <ul class="packs">
${items.join('\n')}
      </ul>`,
  });
}

/** Every address search engines should know, as Cloudflare Pages answers them. */
export const sitePaths = (): string[] => [
  '/',
  '/decks',
  ...PACKS.map(packPath),
  '/support',
  '/privacy',
];

/** Every file this writes, by its place in public/. */
export async function sitePages(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  try {
    for (const pack of PACKS) files[`decks/${pack.id}.html`] = await packPage(pack);
    files['decks.html'] = await indexPage();
  } finally {
    await setLanguage('en');
  }
  const urls = sitePaths().map((path) => `  <url><loc>${SITE}${path}</loc></url>`);
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  files['robots.txt'] = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
  return files;
}
