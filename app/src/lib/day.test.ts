import { dayKey, dayStart, dayStartOffset, nextDayStart, ROLLOVER_HOUR } from './day';

describe('study day', () => {
  it('starts at the rollover hour', () => {
    const noon = new Date(2026, 9, 11, 12, 0).getTime();
    expect(new Date(dayStart(noon)).getHours()).toBe(ROLLOVER_HOUR);
    expect(dayKey(noon)).toBe('2026-10-11');
  });

  it('counts a late-night session as the same day', () => {
    const lateNight = new Date(2026, 9, 12, 1, 30).getTime(); // 1:30 AM on the 12th
    expect(dayKey(lateNight)).toBe('2026-10-11');
  });

  it('steps whole days', () => {
    const noon = new Date(2026, 9, 11, 12, 0).getTime();
    expect(nextDayStart(noon)).toBe(new Date(2026, 9, 12, ROLLOVER_HOUR).getTime());
    expect(dayStartOffset(noon, -1)).toBe(new Date(2026, 9, 10, ROLLOVER_HOUR).getTime());
  });
});
