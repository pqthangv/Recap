// The first-launch tip on the home screen: it points at "How to use Recap", whose cards teach
// the app while you study them (in the order written, see getQueueOrder). One step, with Skip.
import { getDeck } from '@/db/decks';
import { getRawSetting, setRawSetting } from '@/db/settings';
import { TUTORIAL_DECK_KEY, TUTORIAL_TIP_DONE_KEY } from '@/lib/settings';

/** The deck the tip points at, or null once it's been used, skipped, or the deck deleted. */
export function getTutorialDeckId(): string | null {
  if (getRawSetting(TUTORIAL_TIP_DONE_KEY) === true) return null;
  const id = getRawSetting(TUTORIAL_DECK_KEY);
  return typeof id === 'string' && getDeck(id) ? id : null;
}

/** Hides the tip for good (the deck keeps its order). */
export function endTutorial(now = Date.now()): void {
  setRawSetting(TUTORIAL_TIP_DONE_KEY, true, now);
}
