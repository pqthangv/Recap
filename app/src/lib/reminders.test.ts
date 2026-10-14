import { setLanguage } from './i18n';
import {
  lastCallMinutes,
  planReminders,
  REMINDER_DAYS,
  reminderText,
  reminderTimes,
  type CountsAt,
} from './reminders';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const when = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const counts =
  (total: number, fresh = 0): CountsAt =>
  () => ({ total, new: fresh });
const noStreak = { streak: 0, goalMetToday: false };

afterEach(() => setLanguage('en'));

describe('reminderTimes', () => {
  it('starts today if the time is still ahead, then once a day', () => {
    const times = reminderTimes(at(11, 9), 20 * 60, 3);
    expect(times.map(when)).toEqual(['11 20:00', '12 20:00', '13 20:00']);
  });

  it('starts tomorrow if the time has passed', () => {
    expect(new Date(reminderTimes(at(11, 21), 20 * 60, 1)[0]).getDate()).toBe(12);
  });

  it('plans two weeks by default', () => {
    expect(reminderTimes(at(11, 9), 20 * 60)).toHaveLength(REMINDER_DAYS);
    expect(REMINDER_DAYS).toBe(14);
  });
});

describe('reminderText', () => {
  it('says how many cards are due', () => {
    expect(reminderText(1)).toBe('You have 1 card due');
    expect(reminderText(12)).toBe('You have 12 cards due');
  });
});

describe('lastCallMinutes', () => {
  it('is in the evening, at least 90 minutes after the daily reminder', () => {
    expect(lastCallMinutes(8 * 60)).toBe(21 * 60);
    expect(lastCallMinutes(20 * 60)).toBe(21 * 60 + 30);
    expect(lastCallMinutes(22 * 60)).toBe(23 * 60 + 30);
  });

  it('is skipped when the daily reminder is already late at night', () => {
    expect(lastCallMinutes(22 * 60 + 15)).toBeNull();
    expect(lastCallMinutes(1 * 60)).toBeNull(); // after midnight: still the day before
  });
});

describe('planReminders', () => {
  it('says what is due each day, skipping days with nothing to study', () => {
    const plan = planReminders({
      now: at(11, 9),
      minutes: 20 * 60,
      streak: noStreak,
      countsAt: (t) => (new Date(t).getDate() === 12 ? { total: 0, new: 0 } : { total: 5, new: 0 }),
      days: 3,
    });
    expect(plan.map((r) => [when(r.at), r.body])).toEqual([
      ['11 20:00', 'You have 5 cards due'],
      ['13 20:00', 'You have 5 cards due'],
    ]);
  });

  it('keeps an unfinished streak today: in the reminder and as a last call', () => {
    const plan = planReminders({
      now: at(11, 9),
      minutes: 20 * 60,
      streak: { streak: 5, goalMetToday: false },
      countsAt: counts(12, 8),
      days: 2,
    });
    expect(plan.map((r) => [when(r.at), r.body])).toEqual([
      ['11 20:00', '5-day streak! 8 new cards left today to keep it going.'],
      ['11 21:30', 'Your 5-day streak ends tonight. 8 new cards left to keep it.'],
      // Tomorrow the streak is gone unless today's is kept (then the app plans again).
      ['12 20:00', 'You have 12 cards due'],
    ]);
  });

  it("moves to tomorrow once today's goal is met", () => {
    const plan = planReminders({
      now: at(11, 9),
      minutes: 8 * 60, // today's has passed
      streak: { streak: 6, goalMetToday: true },
      countsAt: counts(4, 1),
      days: 2,
    });
    expect(plan.map((r) => [when(r.at), r.body])).toEqual([
      ['12 8:00', '6-day streak! 1 new card left today to keep it going.'],
      ['12 21:00', 'Your 6-day streak ends tonight. 1 new card left to keep it.'],
      ['13 8:00', 'You have 4 cards due'],
    ]);
  });

  it("still sends today's last call when the daily reminder has passed", () => {
    const plan = planReminders({
      now: at(11, 20, 30),
      minutes: 20 * 60,
      streak: { streak: 2, goalMetToday: false },
      countsAt: counts(3, 0),
      days: 1,
    });
    // No new cards left: any card keeps the streak.
    expect(plan.map((r) => [when(r.at), r.body])).toEqual([
      ['11 21:30', 'Your 2-day streak ends tonight. Study one card to keep it.'],
      ['12 20:00', 'You have 3 cards due'],
    ]);
  });

  it('says nothing about the streak when there is nothing to study', () => {
    const plan = planReminders({
      now: at(11, 9),
      minutes: 20 * 60,
      streak: { streak: 9, goalMetToday: false },
      countsAt: counts(0),
    });
    expect(plan).toEqual([]);
  });

  it('counts a reminder after midnight as part of the day before', () => {
    // 1 AM on the 12th is still the 11th's study day (it ends at 4 AM): the streak is at stake.
    // That late reminder is the last call itself, so there's no other.
    const plan = planReminders({
      now: at(11, 9),
      minutes: 60,
      streak: { streak: 3, goalMetToday: false },
      countsAt: counts(2, 2),
      days: 1,
    });
    expect(plan.map((r) => [when(r.at), r.body])).toEqual([
      ['12 1:00', '3-day streak! 2 new cards left today to keep it going.'],
    ]);
  });

  it('speaks Vietnamese', () => {
    setLanguage('vi');
    const plan = planReminders({
      now: at(11, 9),
      minutes: 20 * 60,
      streak: { streak: 5, goalMetToday: false },
      countsAt: counts(12, 8),
      days: 1,
    });
    expect(plan.map((r) => r.body)).toEqual([
      'Chuỗi 5 ngày! Hôm nay còn 8 thẻ mới để giữ chuỗi.',
      'Chuỗi 5 ngày sẽ mất tối nay. Còn 8 thẻ mới để giữ chuỗi.',
    ]);
  });
});
