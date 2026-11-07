// Lists the lines a language's text doesn't have yet, for drafting a translation:
//   node scripts/i18n-missing.js <code>        (e.g. hi, for src/lib/i18n/hi.ts)
// Each line comes with its English text and the files that show it, so the translation fits the
// place (a button, a TalkBack label, a notification). Missing lines show in English in the app.
// It only reads files; no AI.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..');
const i18n = path.join(app, 'src', 'lib', 'i18n');

const lang = process.argv[2];
if (!lang || !/^[a-z]{2,3}(-[A-Za-z]+)?$/.test(lang) || lang === 'en') {
  console.error('Usage: node scripts/i18n-missing.js <language code, e.g. hi>');
  process.exit(1);
}

/** The text object a language file exports (`export const en = { ... }`). */
function readStrings(file) {
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, () => ({}));
  const values = Object.values(exports);
  if (values.length !== 1) throw new Error(`${file} should export one text object`);
  return values[0];
}

/** Every .ts/.tsx file of the app outside the text files and tests. */
function codeFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === i18n ? [] : codeFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const en = readStrings(path.join(i18n, 'en.ts'));
const file = path.join(i18n, `${lang}.ts`);
const have = fs.existsSync(file) ? readStrings(file) : {};
const missing = Object.keys(en).filter((key) => !(key in have));

const code = [...codeFiles(path.join(app, 'src')), ...codeFiles(path.join(app, 'app'))].map(
  (f) => ({
    name: path.relative(app, f).replace(/\\/g, '/'),
    text: fs.readFileSync(f, 'utf8'),
  }),
);
/** Files naming the key, or its plural base ("count.deck" for "count.deck_one"). */
function shownIn(key) {
  const names = [key, key.replace(/_(one|other)$/, '')].map((k) => `'${k}'`);
  return code.filter((f) => names.some((n) => f.text.includes(n))).map((f) => f.name);
}

const total = Object.keys(en).length;
console.log(
  fs.existsSync(file)
    ? `src/lib/i18n/${lang}.ts: ${missing.length} of ${total} lines missing.`
    : `src/lib/i18n/${lang}.ts doesn't exist yet: all ${total} lines.`,
);
for (const key of missing) {
  const where = shownIn(key);
  console.log(`\n${key}`);
  console.log(`  English: ${JSON.stringify(en[key])}`);
  console.log(
    `  Shown in: ${where.length ? where.join(', ') : '(the key is built in code; search its start)'}`,
  );
}
