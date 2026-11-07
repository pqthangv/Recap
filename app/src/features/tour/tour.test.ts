import { clearTestDb, migrateTestDb } from '../../../test/db';

import { createCard } from '@/db/cards';
import { createDeck } from '@/db/decks';
import { getRawSetting } from '@/db/settings';
import { answerCard, getDueQueue } from '@/db/study';
import { previewIntervals, Rating } from '@/lib/scheduler';
import { DEVICE_SETTING_KEYS, TOUR_HOME_DONE_KEY, TOUR_STUDY_DONE_KEY } from '@/lib/settings';

import { HOME_STEPS, studySteps } from './steps';
import {
  finishPart,
  isDue,
  nextStep,
  previousStep,
  resumeTour,
  showTourAgain,
  skipTour,
  startTour,
  stopTour,
  tourActiveNow,
  tourDue,
  tourShowing,
} from './tour';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../../test/db').createTestClient());

const NOW = new Date(2026, 10, 6, 12, 0, 0).getTime();

beforeAll(() => migrateTestDb());
beforeEach(() => {
  clearTestDb();
  stopTour('home');
  stopTour('study');
});

function studyOneCard() {
  const deck = createDeck({ name: 'Words', color: '#5A31D6' }, NOW);
  createCard({ deckId: deck.id, front: 'chó', back: 'dog', tags: [], reverse: false }, NOW);
  const [card] = getDueQueue(deck.id, NOW);
  answerCard(card.id, previewIntervals(card, NOW, 0.95)[Rating.Good].result, 4000, NOW);
}

describe('who sees the tour', () => {
  it('shows a part that was never seen only before anything was studied', () => {
    const studied = jest.fn(() => false);
    expect(isDue(undefined, studied)).toBe(true);
    expect(isDue(undefined, () => true)).toBe(false);
    // Finished or skipped: never again, without looking at what was studied.
    expect(isDue(true, studied)).toBe(false);
    expect(studied).toHaveBeenCalledTimes(1);
    // "Show the tour again": also after studying.
    expect(isDue(false, () => true)).toBe(true);
    // Never in the store screenshot builds.
    expect(isDue(undefined, studied, true)).toBe(false);
    expect(isDue(false, studied, true)).toBe(false);
  });

  it('reads this device: a new install, someone who studied, finishing and showing it again', () => {
    expect(tourDue('home')).toBe(true);
    expect(tourDue('study')).toBe(true);
    studyOneCard();
    // Updating from an older version: whoever studied here doesn't get the tour.
    expect(tourDue('home')).toBe(false);
    expect(tourDue('study')).toBe(false);
    showTourAgain(NOW);
    expect(tourDue('home')).toBe(true);
    expect(tourDue('study')).toBe(true);
    finishPart('home', NOW);
    expect(tourDue('home')).toBe(false);
    expect(tourDue('study')).toBe(true);
  });

  it('keeps its settings on this device (not synced or backed up)', () => {
    expect(DEVICE_SETTING_KEYS).toEqual(
      expect.arrayContaining([TOUR_HOME_DONE_KEY, TOUR_STUDY_DONE_KEY]),
    );
  });
});

describe('the studying steps', () => {
  const ids = (typed: boolean, readAloud: boolean, fourButtons: boolean) =>
    studySteps({ typed, readAloud, fourButtons }).map((s) => s.id);

  it('fits the first card: the speaker if it reads aloud, typing or a tap, then the grades', () => {
    expect(ids(true, true, true)).toEqual(['speaker', 'answer', 'grades']);
    expect(ids(false, true, true)).toEqual(['speaker', 'reveal', 'grades']);
    expect(ids(true, false, false)).toEqual(['answer', 'grades']);
  });

  it('only mentions the highlighted grade for a typed answer with four buttons', () => {
    const grades = (typed: boolean, fourButtons: boolean) =>
      studySteps({ typed, readAloud: false, fourButtons }).at(-1)!;
    expect(grades(true, true).text).toBe('tour.grades');
    expect(grades(false, true).text).toBe('tour.gradesFour');
    expect(grades(true, false).text).toBe('tour.gradesTwo');
    expect(grades(false, false).text).toBe('tour.gradesTwo');
    // The grades wait for the answer; nothing else does.
    const steps = studySteps({ typed: true, readAloud: true, fourButtons: true });
    expect(steps.map((s) => s.waits === true)).toEqual([false, false, true]);
  });

  it('points every Home step but the welcome at a button', () => {
    expect(HOME_STEPS.map((s) => s.target)).toEqual([
      null,
      'study',
      'add',
      'stats',
      'settings',
      'library',
    ]);
    expect(HOME_STEPS.at(-1)!.text).toBe('tour.library');
  });
});

describe('moving through the tour', () => {
  it('goes forward and back, and finishing the last step ends that part for good', () => {
    startTour('home', HOME_STEPS);
    expect(tourShowing()).toMatchObject({ part: 'home', index: 0, paused: false });
    expect(tourActiveNow()).toBe(true);
    previousStep(); // nothing before the first
    expect(tourShowing()?.index).toBe(0);
    nextStep();
    nextStep();
    previousStep();
    expect(tourShowing()?.index).toBe(1);
    for (let i = 1; i < HOME_STEPS.length; i++) nextStep();
    expect(tourShowing()).toBeNull();
    expect(getRawSetting(TOUR_HOME_DONE_KEY)).toBe(true);
    expect(getRawSetting(TOUR_STUDY_DONE_KEY)).toBeUndefined();
  });

  it('hides the grades step until the answer shows, and it has no Back', () => {
    startTour('study', studySteps({ typed: true, readAloud: true, fourButtons: true }));
    nextStep();
    nextStep();
    expect(tourShowing()).toMatchObject({ index: 2, paused: true });
    expect(tourActiveNow()).toBe(false);
    resumeTour('home'); // another part's screen can't bring it back
    expect(tourShowing()?.paused).toBe(true);
    resumeTour('study');
    expect(tourShowing()).toMatchObject({ index: 2, paused: false });
    previousStep();
    expect(tourShowing()?.index).toBe(2);
    nextStep();
    expect(tourShowing()).toBeNull();
    expect(getRawSetting(TOUR_STUDY_DONE_KEY)).toBe(true);
  });

  it('skipping ends both parts; leaving the screen only hides it', () => {
    startTour('home', HOME_STEPS);
    stopTour('study'); // another part: nothing happens
    expect(tourShowing()?.part).toBe('home');
    stopTour('home');
    expect(tourShowing()).toBeNull();
    expect(tourDue('home')).toBe(true);
    startTour('home', HOME_STEPS);
    skipTour(NOW);
    expect(tourShowing()).toBeNull();
    expect(tourDue('home')).toBe(false);
    expect(tourDue('study')).toBe(false);
  });
});
