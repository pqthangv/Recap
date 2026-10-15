// Runs after `expo export --platform web` (`npm run web:build`, the Cloudflare Pages build command).
// The export puts the files that come from packages (expo-sqlite's WebAssembly, icon fonts) in
// dist/assets/node_modules/, but Cloudflare Pages never uploads a folder named node_modules, so the
// site would get its own page back instead and the database couldn't start. This moves them to
// dist/assets/packages/ and points the bundles there. The bundles keep their names (index.html loads
// them by name). If anything still points at the old folder, the build fails, so Cloudflare keeps
// the last good version live instead of publishing a broken one.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const from = path.join(dist, 'assets', 'node_modules');
const to = path.join(dist, 'assets', 'packages');
const OLD = '/assets/node_modules/';
const NEW = '/assets/packages/';

const fail = (message) => {
  console.error(`rename-web-assets: ${message}`);
  process.exit(1);
};
const entries = () => fs.readdirSync(dist, { recursive: true, withFileTypes: true });
const textFiles = () =>
  entries()
    .filter((e) => e.isFile() && /\.(js|html|css|json)$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));

if (!fs.existsSync(dist)) fail('dist/ is missing: run `expo export --platform web` first');
if (fs.existsSync(from)) {
  if (fs.existsSync(to)) fail('dist/assets/packages/ already exists');
  fs.renameSync(from, to);
}

let updated = 0;
for (const file of textFiles()) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(OLD)) continue;
  fs.writeFileSync(file, text.replaceAll(OLD, NEW));
  updated++;
}

const left = entries().filter((e) => e.isDirectory() && e.name === 'node_modules');
if (left.length) fail(`a node_modules folder is still in dist/: ${left[0].parentPath}`);
let references = 0;
for (const file of textFiles()) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(OLD)) fail(`${path.relative(dist, file)} still points at ${OLD}`);
  for (const [ref] of text.matchAll(/\/assets\/packages\/[^"'`\s)]+/g)) {
    references++;
    if (!fs.existsSync(path.join(dist, ref))) fail(`${ref} is missing from dist/`);
  }
}
console.log(`rename-web-assets: ${references} references to assets/packages in ${updated} files`);
