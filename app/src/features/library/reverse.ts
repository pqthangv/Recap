// Turns an English basics pack around for English speakers ("Spanish basics" from the Spanish
// speakers' English basics): the meaning and its example on the front, read in that language, and
// the English word and its example on the back, typed in English. Built when the pack is added, so
// the app carries each card once. scripts/pack-index.js counts the decks the same way (a test
// checks they agree).
import type { PackCard, PackDeck } from './packs';

/** What two words share a card by: their meaning, as written in the pack. */
export const meaningKey = (meaning: string) => meaning.trim().toLowerCase().normalize('NFC');

/**
 * The pack turned around, its decks named `topicNames` (the English topics, in the same order).
 * Words with the same meaning become one card, in the first deck that has one, that takes any of
 * them: "hola" → "hello; hi". The notes stay out, as they're written for the other direction.
 */
export function reverseDecks(
  decks: readonly PackDeck[],
  topicNames: readonly string[],
): PackDeck[] {
  const cards = new Map<
    string,
    { deck: number; front: string; words: string[]; example: string }
  >();
  decks.forEach((deck, i) => {
    for (const card of deck.cards) {
      const [word, english = ''] = card.front.split('\n\n');
      const [meaning, example = ''] = card.back.split('\n\n');
      const key = meaningKey(meaning);
      const same = cards.get(key);
      if (same) same.words.push(word);
      else
        cards.set(key, {
          deck: i,
          front: `${meaning}\n\n${example}`,
          words: [word],
          example: english,
        });
    }
  });
  const reversed: { name: string; cards: PackCard[] }[] = decks.map((deck, i) => ({
    name: topicNames[i] ?? deck.name,
    cards: [],
  }));
  for (const card of cards.values()) {
    reversed[card.deck].cards.push({
      front: card.front,
      back: `${card.words.join('; ')}\n\n${card.example}`,
    });
  }
  return reversed;
}
