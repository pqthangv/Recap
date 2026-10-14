// The "Review cards" list: nothing the AI made is saved until the user has looked at it here.
import type { GeneratedCard, ReportReason } from './ai';
import { t, type StringKey } from './i18n';

export type ReviewItem = { key: string; front: string; back: string; selected: boolean };

/** Where the cards came from, to suggest a deck name. */
export type AiSource =
  | { kind: 'text' }
  | { kind: 'photo' }
  | { kind: 'pdf'; fileName: string }
  | { kind: 'topic'; topic: string };

/** The choices behind "Report" on each card (Google Play: people must be able to flag AI content). */
export const REPORT_REASONS: readonly { reason: ReportReason; label: StringKey }[] = [
  { reason: 'offensive', label: 'report.offensive' },
  { reason: 'wrong', label: 'report.wrong' },
  { reason: 'other', label: 'report.other' },
];

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
      return topic.length > 60 ? `${topic.slice(0, 59).trimEnd()}…` : topic || t('ai.deckDefault');
    }
    case 'pdf':
      return source.fileName.replace(/\.pdf$/i, '').trim() || t('ai.deckPdf');
    case 'photo':
      return t('ai.deckPhoto');
    default:
      return t('ai.deckDefault');
  }
}
