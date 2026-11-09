// The tour's steps (roadmap 1.0.9 "An easier app tour"). Part one runs on Home the first time
// the app opens; part two the first time a card is studied, with only the steps that fit it.
import type { StringKey } from '@/lib/i18n';

export type TourPart = 'home' | 'study';

/** What a step points at: a button marked with useTourTarget on its screen. */
export type TargetId =
  'study' | 'add' | 'stats' | 'settings' | 'library' | 'answer' | 'reveal' | 'speaker' | 'grades';

export type TourStep = {
  id: string;
  /** Null: the card sits in the middle and nothing stays sharp. */
  target: TargetId | null;
  title?: StringKey;
  text: StringKey;
  /** Shown only once its screen is ready for it (the grades, once the answer is showing), so the
   *  step before it hides the tour until then, and this one has no Back. */
  waits?: true;
};

export const HOME_STEPS: readonly TourStep[] = [
  { id: 'welcome', target: null, title: 'tour.welcomeTitle', text: 'tour.welcome' },
  { id: 'study', target: 'study', text: 'tour.study' },
  { id: 'add', target: 'add', text: 'tour.add' },
  { id: 'stats', target: 'stats', text: 'tour.stats' },
  { id: 'settings', target: 'settings', text: 'tour.settings' },
  { id: 'library', target: 'library', text: 'tour.library' },
];

/** The first card studied: typed or shown with a tap, read aloud or not, four or two buttons. */
export type FirstCard = { typed: boolean; readAloud: boolean; fourButtons: boolean };

/** The speaker, then what to do with the card (the tour waits while it's done), then the grades. */
export function studySteps({ typed, readAloud, fourButtons }: FirstCard): TourStep[] {
  return [
    ...(readAloud ? [{ id: 'speaker', target: 'speaker', text: 'tour.speaker' } as const] : []),
    typed
      ? { id: 'answer', target: 'answer', text: 'tour.answer' }
      : { id: 'reveal', target: 'reveal', text: 'tour.reveal' },
    {
      id: 'grades',
      target: 'grades',
      // Only a typed answer has a button picked for it.
      text: !fourButtons ? 'tour.gradesTwo' : typed ? 'tour.grades' : 'tour.gradesFour',
      waits: true,
    },
  ];
}
