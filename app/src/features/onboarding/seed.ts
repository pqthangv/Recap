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
// buttons ("Check", "Again"…"Easy", "3d"), so keep them in step with en.ts / vi.ts. The first
// card has a short answer, so it's typed (answerCheck.ts); the second is too long, so it's tapped.
export const WELCOME_DECKS: Record<Language, SeedDeck[]> = {
  en: [
    {
      name: 'How to use Recap',
      color: deckColors[0],
      cards: [
        ['What is the capital of France? Type the answer below, then tap "Check".', 'Paris'],
        [
          'Some answers are too long to type. Tap this card to see the answer.',
          'Like this! Then pick the button that matches how well you remembered.',
        ],
        [
          'What do "Again", "Hard", "Good" and "Easy" do?',
          'They decide when you see a card again. Again brings it back soon; Hard, Good and Easy wait longer each time. When you type an answer, Recap highlights the one that fits.',
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
          'Can a card show math?',
          'Yes: when you add a card, tap "+ Math" next to Front or Back. A formula shows like this: $\\frac{a}{b} + x^2$',
        ],
        [
          'How much should I study each day?',
          'Just the cards that are due. Recap picks them for you — a few minutes a day is enough.',
        ],
        [
          'Can Recap read cards to me?',
          'It already does: each card is read aloud. Tap the speaker to hear it again, or turn off "Read cards aloud" in Settings. It reads English and Vietnamese.',
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
        ['Thủ đô của Pháp là gì? Gõ đáp án bên dưới, rồi chạm “Kiểm tra”.', 'Paris'],
        [
          'Có những đáp án quá dài để gõ. Chạm vào thẻ này để xem đáp án.',
          'Như thế này! Rồi chọn nút hợp với mức bạn nhớ.',
        ],
        [
          'Các nút “Lại”, “Khó”, “Ổn” và “Dễ” để làm gì?',
          'Chúng quyết định khi nào bạn gặp lại thẻ. Lại cho thẻ quay lại sớm; Khó, Ổn và Dễ chờ lâu hơn sau mỗi lần. Khi bạn gõ đáp án, Recap sẽ tô sáng nút phù hợp.',
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
          'Thẻ có hiện được công thức toán không?',
          'Có: khi thêm thẻ, chạm “+ Công thức” cạnh Mặt trước hoặc Mặt sau. Công thức sẽ hiện như thế này: $\\frac{a}{b} + x^2$',
        ],
        [
          'Mỗi ngày nên học bao nhiêu?',
          'Chỉ cần học các thẻ cần ôn. Recap sẽ chọn giúp bạn — vài phút mỗi ngày là đủ.',
        ],
        [
          'Recap có đọc thẻ cho tôi nghe được không?',
          'Có, Recap đọc to từng thẻ. Chạm vào loa để nghe lại, hoặc tắt “Đọc thẻ thành tiếng” trong Cài đặt. Recap đọc được tiếng Anh và tiếng Việt.',
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
