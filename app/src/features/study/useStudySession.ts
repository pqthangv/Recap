import { useRef, useState } from 'react';

import { getCard } from '@/db/cards';
import { getDeck } from '@/db/decks';
import type { CardRow } from '@/db/schema';
import { getSettings } from '@/db/settings';
import {
  answerCard,
  getQueueOrder,
  undoAnswer,
  type QueueEntry,
  type StudyScope,
} from '@/db/study';
import { checkAnswer, isTypeable, QUICK_START_MS, suggestGrade } from '@/lib/answerCheck';
import { cardSideLanguages, type SideLanguages } from '@/lib/language';
import { countReadyNow, previewIntervals, type Grade, type Preview } from '@/lib/scheduler';

import type { TypedCheck } from './FlipCard';

/** Answer times above this are treated as "walked away" so they don't skew stats. */
const MAX_ANSWER_MS = 5 * 60 * 1000;

type Revealed = {
  at: number;
  previews: Record<Grade, Preview>;
  // Typed cards only: what was typed and the grade Recap suggests for it.
  check?: TypedCheck;
  suggested?: Grade;
};
type Answered = { before: CardRow; logId: string };

/** The full row of the card at the front of the queue (only that one is loaded). */
function headOf(queue: readonly QueueEntry[]): CardRow | null {
  return queue[0] ? (getCard(queue[0].id) ?? null) : null;
}

/** What each side of the card is read in: its deck's languages, swapped on a reverse card. */
function languagesOf(card: CardRow | null): SideLanguages {
  if (!card) return { front: null, back: null };
  return cardSideLanguages(getDeck(card.deck_id), card.reverse_of !== null);
}

/**
 * One study session. The queue is rebuilt after every answer, so cards you forget come back
 * and the daily new-card limit stays exact.
 */
export function useStudySession(scope: StudyScope) {
  const [settings] = useState(getSettings);
  const [first] = useState(() => getQueueOrder(scope));
  const [card, setCard] = useState(() => headOf(first));
  const [languages, setLanguages] = useState(() => languagesOf(card));
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [ready, setReady] = useState(() => countReadyNow(first, shownAt));
  // Changes every time a card is put on screen, so the card view starts face-down.
  const [turn, setTurn] = useState(0);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [history, setHistory] = useState<Answered[]>([]);
  // "Right and quick" (Easy) is timed from when the question was there to answer: the card
  // appearing, or the end of reading it aloud. Refs: they never change what's on screen.
  const questionReadyAt = useRef(shownAt);
  const startedTypingAt = useRef<number | null>(null);

  const show = (next: QueueEntry[], head = headOf(next)) => {
    const now = Date.now();
    setCard(head);
    setLanguages(languagesOf(head));
    setReady(countReadyNow(next, now));
    setRevealed(null);
    setTurn((t) => t + 1);
    setShownAt(now);
    questionReadyAt.current = now;
    startedTypingAt.current = null;
  };

  // Short answers are typed and checked (Settings › Type the answer); the rest are tapped.
  const typing = !!card && settings.typeAnswer && isTypeable(card.back, languages.back);

  const reveal = (extra: Pick<Revealed, 'check' | 'suggested'> = {}) => {
    if (!card || revealed) return;
    // The intervals on the buttons are computed now, and exactly these results are saved when a
    // button is tapped, so "Got it · 3d" always means 3 days.
    const at = Date.now();
    setRevealed({ at, previews: previewIntervals(card, at, settings.retention), ...extra });
  };

  const flip = () => reveal();

  /** Checks a typed answer (empty = "Show answer") and turns the card over with a suggestion. */
  const checkTyped = (typed: string) => {
    if (!card || revealed) return;
    const result = checkAnswer(typed, card.back);
    const started = startedTypingAt.current;
    const quick = started !== null && started - questionReadyAt.current <= QUICK_START_MS;
    reveal({ check: { typed, result }, suggested: suggestGrade(result, quick) });
  };

  const startTyping = () => {
    startedTypingAt.current ??= Date.now();
  };

  /** The card on screen in turn `onTurn` has finished being read aloud. */
  const questionRead = (onTurn: number) => {
    if (onTurn === turn && startedTypingAt.current === null) questionReadyAt.current = Date.now();
  };

  const answer = (grade: Grade) => {
    if (!card || !revealed) return;
    const now = Date.now();
    const logId = answerCard(
      card.id,
      revealed.previews[grade].result,
      Math.min(now - shownAt, MAX_ANSWER_MS),
      now,
    );
    setHistory((h) => [...h, { before: card, logId }]);
    show(getQueueOrder(scope));
  };

  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    undoAnswer(last.before, last.logId);
    setHistory((h) => h.slice(0, -1));
    const restored = getCard(last.before.id);
    const rest = getQueueOrder(scope).filter((c) => c.id !== last.before.id);
    if (restored) show([restored, ...rest], restored);
    else show(rest);
  };

  return {
    card,
    turn,
    revealed: revealed !== null,
    previews: revealed?.previews ?? null,
    // Cards left to see now (at least the one on screen).
    remaining: Math.max(ready, card ? 1 : 0),
    reviewed: history.length,
    canUndo: history.length > 0,
    fourButtons: settings.fourButtons,
    readAloud: settings.readAloud,
    languages,
    typing,
    typedCheck: revealed?.check ?? null,
    suggested: revealed?.suggested ?? null,
    flip,
    checkTyped,
    startTyping,
    questionRead,
    answer,
    undo,
  };
}
