// The "Review cards" list: nothing the AI made is saved until the user has looked at it here.
import type { GeneratedCard, ReportReason } from './ai';
import { count, t, tn, type StringKey } from './i18n';

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

/**
 * The line at the top of Review cards when the AI made fewer cards than asked, or null when it
 * made them all. Fewer is fine (there wasn't more worth learning), but the user should know. With
 * none left afterwards, the daily limit is why: the server only asked the AI for what was left.
 * `left`: the AI cards left after this request (null if unknown).
 */
export function fewerCardsNote(made: number, asked: number, left: number | null): string | null {
  if (made >= asked) return null;
  if (left === 0) return tn('review.fewerLimit', made);
  return t('review.fewer', { asked: tn('count.card', asked), made: count(made) });
}

/** "Your notes": text read from a photo or PDF goes below what's already in the box, so a few
 *  pages can be combined and edited before making cards. */
export function addToNotes(notes: string, added: string): string {
  const extra = added.trim();
  if (!extra) return notes;
  return notes.trim() ? `${notes.trimEnd()}\n\n${extra}` : extra;
}

/** What the notes came from, for the suggested deck name: the last PDF added names it; otherwise
 *  a photo; otherwise it's just text. */
export function notesSourceAfter(current: AiSource, added: AiSource): AiSource {
  if (added.kind === 'pdf') return added;
  if (added.kind === 'photo' && current.kind === 'text') return added;
  return current;
}
