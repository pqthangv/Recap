// Writes src/features/library/packIndex.json: each Library pack's deck names and card counts, so
// the Library shows them without loading any cards (the website downloads a pack's cards only
// when it's added: packCards.web.ts). Run it after changing a file in src/features/library/packs:
//   node scripts/pack-index.js
// library.test.ts fails while it's out of date. No AI, no network.
//
// Each English basics pack also gets "<file>/reversed": the same pack turned around for English
// speakers (src/features/library/reverse.ts, which this counts the same way): the English topic
// names, and words with one meaning sharing a card in the first deck that has one.
const fs = require('fs');
const path = require('path');

const library = path.join(__dirname, '..', 'src', 'features', 'library');
const dir = path.join(library, 'packs');
const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).decks;

// As reverse.ts's meaningKey.
const meaningKey = (meaning) => meaning.trim().toLowerCase().normalize('NFC');

function reversedSizes(decks, topicNames) {
  const firstDeck = new Map();
  decks.forEach((deck, i) => {
    for (const card of deck.cards) {
      const key = meaningKey(card.back.split('\n\n')[0]);
      if (!firstDeck.has(key)) firstDeck.set(key, i);
    }
  });
  const counts = decks.map(() => 0);
  for (const i of firstDeck.values()) counts[i] += 1;
  return decks.map((deck, i) => ({ name: topicNames[i] ?? deck.name, count: counts[i] }));
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const englishTopics = read('english-basics.json').map((deck) => deck.name);

const index = {};
for (const file of files) {
  const decks = read(file);
  const id = file.replace(/\.json$/, '');
  index[id] = decks.map((deck) => ({ name: deck.name, count: deck.cards.length }));
  if (id.startsWith('english-basics'))
    index[`${id}/reversed`] = reversedSizes(decks, englishTopics);
}

fs.writeFileSync(path.join(library, 'packIndex.json'), JSON.stringify(index, null, 2) + '\n');
const cards = Object.values(index)
  .flat()
  .reduce((n, deck) => n + deck.count, 0);
console.log(`packIndex.json: ${Object.keys(index).length} entries, ${cards} cards`);
