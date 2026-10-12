import { useState } from 'react';

import { getCard } from '@/db/cards';
import type { CardRow } from '@/db/schema';
import { getSettings } from '@/db/settings';
import { answerCard, getDueQueue, undoAnswer, type StudyScope } from '@/db/study';
import { countReadyNow, previewIntervals, type Grade, type Preview } from '@/lib/scheduler';

/** Answer times above this are treated as "walked away" so they don't skew stats. */
const MAX_ANSWER_MS = 5 * 60 * 1000;

type Revealed = { at: number; previews: Record<Grade, Preview> };
type Answered = { before: CardRow; logId: string };

/**
 * One study session. The queue is rebuilt after every answer, so cards you forget come back
 * and the daily new-card limit stays exact.
 */
export function useStudySession(scope: StudyScope) {
  const [settings] = useState(getSettings);
  const [queue, setQueue] = useState(() => getDueQueue(scope));
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [ready, setReady] = useState(() => countReadyNow(queue, shownAt));
  // Changes every time a card is put on screen, so the card view starts face-down.
  const [turn, setTurn] = useState(0);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [history, setHistory] = useState<Answered[]>([]);

  const card = queue[0] ?? null;

  const show = (next: CardRow[]) => {
    const now = Date.now();
    setQueue(next);
    setReady(countReadyNow(next, now));
    setRevealed(null);
    setTurn((t) => t + 1);
    setShownAt(now);
  };

  const flip = () => {
    if (!card || revealed) return;
    // The intervals on the buttons are computed now, and exactly these results are saved when a
    // button is tapped, so "Got it · 3d" always means 3 days.
    const at = Date.now();
    setRevealed({ at, previews: previewIntervals(card, at, settings.retention) });
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
    show(getDueQueue(scope));
  };

  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    undoAnswer(last.before, last.logId);
    setHistory((h) => h.slice(0, -1));
    const restored = getCard(last.before.id);
    const rest = getDueQueue(scope).filter((c) => c.id !== last.before.id);
    show(restored ? [restored, ...rest] : rest);
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
    flip,
    answer,
    undo,
  };
}
