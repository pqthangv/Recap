import * as StoreReview from 'expo-store-review';

import { clearTestDb, migrateTestDb } from '../../../test/db';

import { getRawSetting } from '@/db/settings';
import { getStreak } from '@/db/stats';
import { can } from '@/lib/platform';
import { RATING_ASKED_KEY } from '@/lib/settings';

import { askForRatingIfDue, RATING_STREAK, shouldAskForRating } from './rating';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../../test/db').createTestClient());
jest.mock('@/db/stats', () => ({ getStreak: jest.fn() }));
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}));

const streak = jest.mocked(getStreak);
const available = jest.mocked(StoreReview.isAvailableAsync);
const requestReview = jest.mocked(StoreReview.requestReview);

beforeAll(() => migrateTestDb());
beforeEach(() => {
  clearTestDb();
  jest.clearAllMocks();
  streak.mockReturnValue(RATING_STREAK);
  available.mockResolvedValue(true);
  requestReview.mockResolvedValue();
});

describe('the rating request', () => {
  it('shows the store sheet once, at the end of a session with a 7-day streak', async () => {
    expect(RATING_STREAK).toBe(7);
    await askForRatingIfDue(12);
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(getRawSetting(RATING_ASKED_KEY)).toBe(true);

    streak.mockReturnValue(30);
    await askForRatingIfDue(5);
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(shouldAskForRating(5)).toBe(false);
  });

  it('waits for the streak to reach 7 days', async () => {
    streak.mockReturnValue(RATING_STREAK - 1);
    await askForRatingIfDue(20);
    expect(requestReview).not.toHaveBeenCalled();
    expect(getRawSetting(RATING_ASKED_KEY)).toBeUndefined();

    streak.mockReturnValue(RATING_STREAK);
    await askForRatingIfDue(20);
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it('needs at least one card answered in the session', async () => {
    await askForRatingIfDue(0);
    expect(requestReview).not.toHaveBeenCalled();
    expect(streak).not.toHaveBeenCalled(); // no database work for an empty session
  });

  it("opens nothing where the store's sheet can't show (TestFlight), and asks later", async () => {
    available.mockResolvedValue(false);
    await askForRatingIfDue(10);
    expect(requestReview).not.toHaveBeenCalled();
    expect(getRawSetting(RATING_ASKED_KEY)).toBeUndefined();

    available.mockResolvedValue(true);
    await askForRatingIfDue(10);
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it('never throws, and a failed sheet is not asked again', async () => {
    requestReview.mockRejectedValue(new Error('no Play Store'));
    await expect(askForRatingIfDue(10)).resolves.toBeUndefined();
    expect(getRawSetting(RATING_ASKED_KEY)).toBe(true);

    available.mockRejectedValue(new Error('native module missing'));
    await expect(askForRatingIfDue(10)).resolves.toBeUndefined();
  });

  it('is off on the website', async () => {
    const phone = can.rateApp;
    can.rateApp = false;
    try {
      await askForRatingIfDue(10);
      expect(available).not.toHaveBeenCalled();
      expect(requestReview).not.toHaveBeenCalled();
    } finally {
      can.rateApp = phone;
    }
  });
});
