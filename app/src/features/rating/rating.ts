// "Rate Recap": the store's own rating sheet, asked for once on this phone, when a study session
// ends with a streak of a week or more (someone who studied 7 days in a row likely finds Recap
// useful). Only the store's sheet, never a question of ours first: Apple 5.6.1 allows only its own
// API, and Google Play's In-App Review rules forbid asking "Do you like the app?" first or steering
// only happy people to it. The stores decide whether the sheet really appears (Apple: at most 3
// times a year; Google: a quota), so Recap never knows whether someone rated.
import * as StoreReview from 'expo-store-review';

import { getRawSetting, setRawSetting } from '@/db/settings';
import { getStreak } from '@/db/stats';
import { can } from '@/lib/platform';
import { RATING_ASKED_KEY } from '@/lib/settings';

/** Days in a row (Statistics' goal-based streak) before asking. */
export const RATING_STREAK = 7;

/** Due at the end of a session with `answered` cards answered. */
export function shouldAskForRating(answered: number, now = Date.now()): boolean {
  return (
    can.rateApp &&
    answered > 0 &&
    getRawSetting(RATING_ASKED_KEY) !== true &&
    getStreak(now) >= RATING_STREAK
  );
}

/** Shows the store's sheet if it's due. Never throws: studying goes on either way. */
export async function askForRatingIfDue(answered: number, now = Date.now()): Promise<void> {
  try {
    if (!shouldAskForRating(answered, now)) return;
    // False in TestFlight and wherever the store's sheet can't show. Then nothing at all opens
    // (requestReview would fall back to a store link, which this app.json doesn't have anyway),
    // and it's asked once the app comes from the store.
    if (!(await StoreReview.isAvailableAsync())) return;
    // Marked first, so it's never asked twice, even if the app is closed with the sheet open.
    setRawSetting(RATING_ASKED_KEY, true, now);
    await StoreReview.requestReview();
  } catch {
    // E.g. no Play Store on the phone: there's no sheet to show.
  }
}
