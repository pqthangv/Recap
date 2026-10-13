import { createCard } from '@/db/cards';
import { createDeck } from '@/db/decks';
import { getRawSetting, setRawSetting } from '@/db/settings';
import { transaction } from '@/db/transaction';
import { SEEDED_KEY, TUTORIAL_DECK_KEY } from '@/lib/settings';
import { deckColors } from '@/lib/theme';

type SeedDeck = { name: string; color: string; cards: [front: string, back: string][] };

// World capitals used to be here too; it's a Library pack now (src/features/library/packs.ts).
export const WELCOME_DECKS: SeedDeck[] = [
  {
    name: 'How to use Recap',
    color: deckColors[0],
    cards: [
      ['Tap a card to see the answer.', 'Like this! Now tell Recap how it went.'],
      [
        'What do "Forgot" and "Got it" do?',
        'They decide when you see a card again. Forgot brings it back soon; Got it waits longer each time.',
      ],
      [
        'What does the time on each button mean?',
        'When you will see the card next if you tap that button, like "3d" for three days.',
      ],
      [
        'How do I add my own cards?',
        'Tap + on the home screen, then "Add card". You can also make a new deck there.',
      ],
      [
        'How much should I study each day?',
        'Just the cards that are due. Recap picks them for you — a few minutes a day is enough.',
      ],
      [
        'Can Recap read cards to me?',
        'Yes. Tap the speaker on a card, or turn on "Read cards aloud" in Settings. It reads English and Vietnamese.',
      ],
      [
        'Can I delete these welcome cards?',
        'Yes. Open this deck, tap Edit, then "Delete deck". They won\'t come back.',
      ],
    ],
  },
];

/** Creates the welcome decks on first launch only — not again if the user deletes them. The
 *  first one ("How to use Recap") gets the home screen's first-launch tip. */
export function seedIfNeeded(now = Date.now()): boolean {
  if (getRawSetting(SEEDED_KEY) === true) return false;
  transaction(() => {
    WELCOME_DECKS.forEach((deck, d) => {
      const { id } = createDeck({ name: deck.name, color: deck.color }, now + d);
      if (d === 0) setRawSetting(TUTORIAL_DECK_KEY, id, now);
      // Stagger creation times so new cards are shown in the order written here.
      deck.cards.forEach(([front, back], i) => {
        createCard({ deckId: id, front, back, tags: [], reverse: false }, now + d * 100 + i);
      });
    });
    setRawSetting(SEEDED_KEY, true, now);
  });
  return true;
}
