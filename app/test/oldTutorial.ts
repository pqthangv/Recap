// "How to use Recap" as Recap 1.0.2 to 1.0.8 made it on a new install. Since 1.0.9 the app tour
// (src/features/tour) does its job and a new install gets no decks. Phones that have the deck keep
// it: its cards are still studied in the order written (getQueueOrder), and sync still leaves it
// out (db/sync.ts), so tests make one the way those versions did.
import { createCard } from '@/db/cards';
import { createDeck } from '@/db/decks';
import { setRawSetting } from '@/db/settings';
import { SEEDED_KEY, TUTORIAL_DECK_KEY } from '@/lib/settings';

/** Its cards' fronts, in the order written. */
export const OLD_TUTORIAL_FRONTS = [
  'What is the capital of France? Type the answer below, then tap "Check".',
  'Some answers are too long to type. Tap this card to see the answer.',
  'What do "Again", "Hard", "Good" and "Easy" do?',
  'What does the time on each button mean?',
  'How do I add my own cards?',
  'Can a card show math?',
  'Does Recap read cards aloud?',
  'How do I delete a deck?',
];

/** Makes the deck and the settings that named it; returns its id. */
export function makeOldTutorial(now: number): string {
  const { id } = createDeck({ name: 'How to use Recap', color: '#5A31D6' }, now);
  setRawSetting(TUTORIAL_DECK_KEY, id, now);
  // One millisecond apart, so the new cards come in the order written.
  OLD_TUTORIAL_FRONTS.forEach((front, i) => {
    createCard({ deckId: id, front, back: 'See the app.', tags: [], reverse: false }, now + i);
  });
  setRawSetting(SEEDED_KEY, true, now);
  return id;
}
