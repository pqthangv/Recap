// Writes the App Store screenshot flows for the other app languages from the English one:
//   node scripts/screenshot-flows.js            (every language but English)
//   node scripts/screenshot-flows.js hi es      (just these)
// .maestro/screenshots.yaml is the original. Each label it taps or waits for is swapped for the
// same line in that language's text (LABELS: which key each label is), and a few things the
// flow types or picks are set per language (EXTRAS). Run it again after changing the English flow,
// so every language keeps the same steps. Only reads the text files; no AI.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..');
const i18n = path.join(app, 'src', 'lib', 'i18n');
const maestro = path.join(app, '.maestro');

/** What a TypeScript file exports (its imports come back empty: only its plain data is read). */
function readExports(file) {
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, () => ({}));
  return exports;
}

/** The text object a language file exports (`export const en = { ... }`). */
function readStrings(lang) {
  return Object.values(readExports(path.join(i18n, `${lang}.ts`)))[0];
}

/** The made-up leaderboard's first person in this app language (src/lib/leaderboard/demo.ts). */
function boardLeader(lang) {
  const { DEMO_NAMES } = readExports(path.join(app, 'src', 'lib', 'leaderboard', 'demo.ts'));
  return (DEMO_NAMES[lang] ?? DEMO_NAMES.en).people[0][0];
}

/** The card languages' own names, in the order the language list shows them. */
function cardLanguageNames() {
  const source = fs.readFileSync(path.join(app, 'src', 'lib', 'language.ts'), 'utf8');
  const list = /export const CARD_LANGUAGES = \[([\s\S]*?)\];/.exec(source);
  if (!list) throw new Error('No CARD_LANGUAGES in src/lib/language.ts');
  return [...list[1].matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
}

// The English flow's label → the key whose text it is. A label ending in ".*" matches the start
// of the text (its part before any {blank}); "Study · .* due" is a whole text with its blank.
const LABELS = {
  'Study · .* due': 'home.study',
  'Study this deck.*': 'deck.study',
  'Your answer.*': 'study.typeA11y',
  Check: 'study.check',
  'Edit deck': 'deck.editA11y',
  'Read aloud in': 'deck.readAloudIn',
  'Language of the card fronts.*': 'languages.frontA11y',
  'Read the front of the cards in': 'deck.frontLanguageTitle',
  Library: 'screen.library',
  All: 'library.all',
  Statistics: 'screen.stats',
  'Cards studied, last 7 days': 'stats.lastWeek',
  Leaderboard: 'stats.leaderboard',
  Settings: 'screen.settings',
  'Sync my cards.*': 'screen.account',
  'Continue with Google': 'account.google',
  'Add a deck or card': 'home.fab',
  'Add card': 'screen.addCard',
  Front: 'card.front',
  'New deck': 'screen.newDeck',
  'Deck name': 'deck.nameA11y',
  'Create with AI': 'screen.ai',
  Topic: 'ai.tabTopic',
  'Topic to make cards about.*': 'ai.topicA11y',
  'Language of the card backs.*': 'languages.backA11y',
  'Make cards': 'ai.make',
  Allow: 'consent.allow',
  'Review cards': 'screen.aiReview',
};

// Per language: the study deck's card is answered `typed` (scripts/demo-data.ts has the cards),
// which Recap answers with `almost`; Create with AI is asked for English words about food
// (`topic`) with this language's meanings (`name`: its name in the card language list).
const EXTRAS = {
  vi: {
    typed: 'qua tao',
    almost: 'study.almostAccents',
    topic: 'Từ tiếng Anh về đồ ăn',
    name: 'Tiếng Việt',
  },
  hi: {
    typed: 'aple', // the card asks for "apple": a missing letter, "check the spelling"
    almost: 'study.almostSpelling',
    topic: 'खाने से जुड़े अंग्रेज़ी शब्द',
    name: 'हिन्दी',
  },
  es: {
    typed: 'limon',
    almost: 'study.almostAccents',
    topic: 'Palabras en inglés sobre comida',
    name: 'Español',
  },
  fr: {
    typed: 'cafe',
    almost: 'study.almostAccents',
    topic: 'Mots anglais sur la nourriture',
    name: 'Français',
  },
  bn: {
    typed: 'aple',
    almost: 'study.almostSpelling',
    topic: 'খাবার নিয়ে ইংরেজি শব্দ',
    name: 'বাংলা',
  },
  pt: {
    typed: 'maca',
    almost: 'study.almostAccents',
    topic: 'Palavras em inglês sobre comida',
    name: 'Português',
  },
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A text as a label: whole (blanks match anything) or, for a "starts with" label, its start. */
function label(text, startsWith) {
  if (!startsWith)
    return text
      .split(/\{\w+\}/)
      .map(escape)
      .join('.*');
  const start = text
    .split(/\{\w+\}/)[0]
    .replace(/[\s·:.,]+$/u, '')
    .trim();
  return start
    ? `${escape(start)}.*`
    : `${text
        .split(/\{\w+\}/)
        .map(escape)
        .join('.*')}`;
}

/** YAML-quote a label when it needs it (as the English flow does). */
const quote = (text) => (/^[\p{L}\p{N} ]+$/u.test(text) ? text : `'${text.replace(/'/g, "''")}'`);

function flowFor(lang, english, en) {
  const text = readStrings(lang);
  const extra = EXTRAS[lang];
  if (!extra) throw new Error(`No EXTRAS for ${lang}`);
  const missing = [...Object.values(LABELS), extra.almost].filter((key) => !text[key]);
  if (missing.length) throw new Error(`${lang}.ts lacks ${missing.join(', ')}`);

  let picks = 0; // the AI form's two language picks: English, then this language
  const lines = english.split('\n').map((line) => {
    const m = /^(\s*(?:- tapOn|visible|text|- inputText): )(.*)$/.exec(line);
    if (!m) return line;
    const [, head, raw] = m;
    const value = raw.replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
    if (value === '') return line; // "- tapOn:" with its text on the next line
    if (head.includes('inputText')) {
      if (value === 'qua tao') return head + quote(extra.typed);
      return head + quote(extra.topic); // the AI topic
    }
    if (value === 'Almost.*')
      return head + quote(label(text[extra.almost].split(/[:：]/)[0], true));
    if (value === 'Vietnamese words.*') return head + quote('English words.*');
    // The made-up leaderboard has this language's names (src/lib/leaderboard/demo.ts).
    if (value === '.*Minh Anh.*') return head + quote(`.*${escape(boardLeader(lang))}.*`);
    if (value === 'Tiếng Việt(, ✓)?' || value === 'English(, ✓)?') {
      picks += 1;
      if (picks === 1) return head + quote('English(, ✓)?');
      // This language may be far down the list of 19: scroll until the one after it shows, so this
      // one is fully on the screen. A row half under the list's bottom edge counts as visible,
      // and a tap on it missed (folded Duo and iPhone, 2026-11-09).
      const names = cardLanguageNames();
      const at = names.indexOf(extra.name);
      if (at < 0) throw new Error(`${extra.name} isn't in CARD_LANGUAGES`);
      const pick = quote(`${escape(extra.name)}(, ✓)?`);
      const scrollTo = quote(`${escape(names[at + 1] ?? extra.name)}(, ✓)?`);
      return (
        `- scrollUntilVisible:
    element:
      text: ${scrollTo}
    direction: DOWN
` +
        head +
        pick
      );
    }
    if (value === 'Language of the card backs: English.*') {
      // The check that the pick took, with this language's label and name.
      const [before, after] = text['languages.backA11y'].split('{language}');
      return head + quote(`${escape(before)}${escape(extra.name)}${escape(after ?? '')}.*`);
    }
    const key = LABELS[value];
    if (!key) return line; // a demo deck's name, or a made-up person: the same in every language
    if (!(key in en)) throw new Error(`en.ts has no ${key}`);
    return (
      head + quote(label(text[key], value.endsWith('.*') && !value.slice(0, -2).includes('.*')))
    );
  });
  if (picks !== 2) throw new Error(`Expected the two AI language picks, found ${picks}`);

  const body = lines.join('\n').replace(/^[\s\S]*?(?=appId:)/, '');
  return (
    `# The App Store screenshots with the app in ${lang} (the workflow's language "${lang}" makes the\n` +
    `# demo database with Settings › Language set to it): the same steps as screenshots.yaml, every\n` +
    `# label it taps or waits for taken from src/lib/i18n/${lang}.ts. The study deck is "English\n` +
    `# words", with this language's cards (scripts/demo-data.ts). Made by\n` +
    `# scripts/screenshot-flows.js: change screenshots.yaml, then run it again. The comments below\n` +
    `# are the English flow's.\n` +
    body
  );
}

const english = fs.readFileSync(path.join(maestro, 'screenshots.yaml'), 'utf8');
const en = readStrings('en');
const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(EXTRAS);
for (const lang of langs) {
  const out = path.join(maestro, `screenshots-${lang}.yaml`);
  fs.writeFileSync(out, flowFor(lang, english, en));
  console.log(`wrote ${path.relative(app, out)}`);
}
