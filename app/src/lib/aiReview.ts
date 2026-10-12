// The "Review cards" list: nothing the AI made is saved until the user has looked at it here.
import type { GeneratedCard } from './ai';

export type ReviewItem = { key: string; front: string; back: string; selected: boolean };

/** Where the cards came from, to suggest a deck name. */
export type AiSource =
  | { kind: 'text' }
  | { kind: 'photo' }
  | { kind: 'pdf'; fileName: string }
  | { kind: 'topic'; topic: string };

export function toReviewItems(cards: readonly GeneratedCard[]): ReviewItem[] {
  return cards.map((c, i) => ({ key: String(i), front: c.front, back: c.back, selected: true }));
}

export function setAllSelected(items: readonly ReviewItem[], selected: boolean): ReviewItem[] {
  return items.map((item) => ({ ...item, selected }));
}

/** Selected cards with both sides filled in, ready for importCards. */
export function cardsToSave(items: readonly ReviewItem[]) {
  return items
    .filter((item) => item.selected && item.front.trim() && item.back.trim())
    .map((item) => ({ front: item.front.trim(), back: item.back.trim(), tags: [] as string[] }));
}

export function suggestDeckName(source: AiSource): string {
  switch (source.kind) {
    case 'topic': {
      const topic = source.topic.trim().replace(/\s+/g, ' ');
      return topic.length > 60 ? `${topic.slice(0, 59).trimEnd()}…` : topic || 'AI cards';
    }
    case 'pdf':
      return source.fileName.replace(/\.pdf$/i, '').trim() || 'PDF notes';
    case 'photo':
      return 'Photo notes';
    default:
      return 'AI cards';
  }
}
