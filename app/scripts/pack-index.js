// Writes src/features/library/packIndex.json: each Library pack's deck names and card counts, so
// the Library shows them without loading any cards (the website downloads a pack's cards only
// when it's added: packCards.web.ts). Run it after changing a file in src/features/library/packs:
//   node scripts/pack-index.js
// library.test.ts fails while it's out of date. No AI, no network.
const fs = require('fs');
const path = require('path');

const library = path.join(__dirname, '..', 'src', 'features', 'library');
const dir = path.join(library, 'packs');

const index = {};
for (const file of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const { decks } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  index[file.replace(/\.json$/, '')] = decks.map((deck) => ({
    name: deck.name,
    count: deck.cards.length,
  }));
}

fs.writeFileSync(path.join(library, 'packIndex.json'), JSON.stringify(index, null, 2) + '\n');
const cards = Object.values(index)
  .flat()
  .reduce((n, deck) => n + deck.count, 0);
console.log(`packIndex.json: ${Object.keys(index).length} packs, ${cards} cards`);
