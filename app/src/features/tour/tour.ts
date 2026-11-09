// Which part of the tour is showing, and who sees it. Each part shows once per device (device
// settings, never synced or backed up), only before anything was studied here, and never in the
// store screenshot builds. Settings › Show the tour again brings both parts back.
import { create } from 'zustand';

import { getRawSetting, setRawSetting } from '@/db/settings';
import { hasStudied } from '@/db/stats';
import { TOUR_HOME_DONE_KEY, TOUR_STUDY_DONE_KEY } from '@/lib/settings';

import type { TourPart, TourStep } from './steps';

/** The store screenshot builds (the made-up leaderboard): every picture would show the tour. */
const SCREENSHOT_BUILD = process.env.EXPO_PUBLIC_DEMO_BOARD === '1';

const DONE_KEY: Record<TourPart, string> = {
  home: TOUR_HOME_DONE_KEY,
  study: TOUR_STUDY_DONE_KEY,
};

/**
 * A part's setting: true = finished or skipped; false = "Show the tour again"; unset = not seen
 * yet, so it shows only to a device that never studied (a new install, or one that never used
 * Recap), not to everyone updating from an older version.
 */
export function isDue(done: unknown, studied: () => boolean, screenshots = false): boolean {
  if (screenshots || done === true) return false;
  return done === false || !studied();
}

export function tourDue(part: TourPart): boolean {
  return isDue(getRawSetting(DONE_KEY[part]), hasStudied, SCREENSHOT_BUILD);
}

export type Showing = {
  part: TourPart;
  steps: readonly TourStep[];
  index: number;
  /** Hidden until the screen is ready for the next step (TourStep.waits). */
  paused: boolean;
};

const useTour = create<{ showing: Showing | null }>(() => ({ showing: null }));

export function useTourShowing(): Showing | null {
  return useTour((s) => s.showing);
}

/** The same, outside React (tests). */
export function tourShowing(): Showing | null {
  return useTour.getState().showing;
}

const active = (showing: Showing | null) => showing !== null && !showing.paused;

/** A step is on screen (not paused): the screen under it ignores keys and keeps the keyboard down. */
export function useTourActive(): boolean {
  return useTour((s) => active(s.showing));
}

/** The same, read in an effect that runs before the screen draws again. */
export function tourActiveNow(): boolean {
  return active(useTour.getState().showing);
}

/** The part waits for its screen (TourStep.waits): the screen says when with resumeTour. */
export function useTourWaiting(part: TourPart): boolean {
  return useTour((s) => s.showing?.part === part && s.showing.paused);
}

export function startTour(part: TourPart, steps: readonly TourStep[]): void {
  if (steps.length === 0) return;
  useTour.setState({ showing: { part, steps, index: 0, paused: false } });
}

export function nextStep(): void {
  const { showing } = useTour.getState();
  if (!showing) return;
  const index = showing.index + 1;
  if (index >= showing.steps.length) {
    finishPart(showing.part);
    return;
  }
  useTour.setState({ showing: { ...showing, index, paused: showing.steps[index].waits === true } });
}

export function previousStep(): void {
  const { showing } = useTour.getState();
  if (!showing || showing.index === 0 || showing.steps[showing.index].waits) return;
  useTour.setState({ showing: { ...showing, index: showing.index - 1 } });
}

/** The screen is ready for the waiting step (the answer is showing). */
export function resumeTour(part: TourPart): void {
  const { showing } = useTour.getState();
  if (showing?.part === part && showing.paused) {
    useTour.setState({ showing: { ...showing, paused: false } });
  }
}

/** The part's last step was done: it doesn't come back. */
export function finishPart(part: TourPart, now = Date.now()): void {
  setRawSetting(DONE_KEY[part], true, now);
  if (useTour.getState().showing?.part === part) useTour.setState({ showing: null });
}

/** Its screen was left (the browser's Back, a link): hidden, and shown again next time if it's
 *  still due. */
export function stopTour(part: TourPart): void {
  if (useTour.getState().showing?.part === part) useTour.setState({ showing: null });
}

/** Skip ends the whole tour: this part and the other. */
export function skipTour(now = Date.now()): void {
  setRawSetting(TOUR_HOME_DONE_KEY, true, now);
  setRawSetting(TOUR_STUDY_DONE_KEY, true, now);
  useTour.setState({ showing: null });
}

/** Settings › Show the tour again: both parts, from Home. */
export function showTourAgain(now = Date.now()): void {
  setRawSetting(TOUR_HOME_DONE_KEY, false, now);
  setRawSetting(TOUR_STUDY_DONE_KEY, false, now);
}
