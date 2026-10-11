import { reminderText, reminderTimes } from './reminders';

describe('reminderTimes', () => {
  it('starts today if the time is still ahead, then once a day', () => {
    const morning = new Date(2026, 9, 11, 9, 0).getTime();
    const times = reminderTimes(morning, 20 * 60, 3);
    expect(times.map((t) => new Date(t).toString())).toEqual([
      new Date(2026, 9, 11, 20, 0).toString(),
      new Date(2026, 9, 12, 20, 0).toString(),
      new Date(2026, 9, 13, 20, 0).toString(),
    ]);
  });

  it('starts tomorrow if the time has passed', () => {
    const night = new Date(2026, 9, 11, 21, 0).getTime();
    expect(new Date(reminderTimes(night, 20 * 60, 1)[0]).getDate()).toBe(12);
  });
});

describe('reminderText', () => {
  it('says how many cards are due', () => {
    expect(reminderText(1)).toBe('You have 1 card due');
    expect(reminderText(12)).toBe('You have 12 cards due');
  });
});
