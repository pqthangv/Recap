import { createCard } from '@/db/cards';
import { createDeck } from '@/db/decks';
import { getRawSetting, setRawSetting } from '@/db/settings';
import { transaction } from '@/db/transaction';
import { language, type Language } from '@/lib/i18n';
import { SEEDED_KEY, TUTORIAL_DECK_KEY } from '@/lib/settings';
import { deckColors } from '@/lib/theme';

type SeedDeck = { name: string; color: string; cards: [front: string, back: string][] };

// World capitals used to be here too; it's a Library pack now (src/features/library/packs.ts).
// One set per language: a new install gets the one in the phone's language. The cards name the
// buttons ("Forgot", "Got it", "3d"), so keep them in step with en.ts / vi.ts.
export const WELCOME_DECKS: Record<Language, SeedDeck[]> = {
  en: [
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
  ],
  vi: [
    {
      name: 'Cách dùng Recap',
      color: deckColors[0],
      cards: [
        ['Chạm vào thẻ để xem đáp án.', 'Như thế này! Giờ hãy cho Recap biết bạn có nhớ không.'],
        [
          'Nút “Quên” và “Nhớ” để làm gì?',
          'Chúng quyết định khi nào bạn gặp lại thẻ. Quên sẽ cho thẻ quay lại sớm; Nhớ sẽ chờ lâu hơn sau mỗi lần.',
        ],
        [
          'Thời gian trên mỗi nút nghĩa là gì?',
          'Đó là lúc bạn sẽ gặp lại thẻ nếu chạm vào nút đó, ví dụ “3 ngày”.',
        ],
        [
          'Làm sao để thêm thẻ của riêng tôi?',
          'Chạm + ở màn hình chính, rồi chọn “Thêm thẻ”. Bạn cũng có thể tạo bộ thẻ mới ở đó.',
        ],
        [
          'Mỗi ngày nên học bao nhiêu?',
          'Chỉ cần học các thẻ cần ôn. Recap sẽ chọn giúp bạn — vài phút mỗi ngày là đủ.',
        ],
        [
          'Recap có đọc thẻ cho tôi nghe được không?',
          'Có. Chạm vào loa trên thẻ, hoặc bật “Đọc thẻ thành tiếng” trong Cài đặt. Recap đọc được tiếng Anh và tiếng Việt.',
        ],
        [
          'Tôi có xóa được các thẻ chào mừng này không?',
          'Được. Mở bộ thẻ này, chạm Sửa, rồi chọn “Xóa bộ thẻ”. Chúng sẽ không quay lại nữa.',
        ],
      ],
    },
  ],
};

/** Creates the welcome decks on first launch only — not again if the user deletes them. The
 *  first one ("How to use Recap") gets the home screen's first-launch tip. */
export function seedIfNeeded(now = Date.now()): boolean {
  if (getRawSetting(SEEDED_KEY) === true) return false;
  transaction(() => {
    WELCOME_DECKS[language()].forEach((deck, d) => {
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
