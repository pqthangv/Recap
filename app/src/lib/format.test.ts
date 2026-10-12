import {
  count,
  daysAgo,
  formatStudyTime,
  formatStudyTimeLong,
  plural,
  studyButtonLabel,
} from '@/lib/format';

describe('formatStudyTime', () => {
  const MIN = 60 * 1000;
  it('shows minutes, then hours and minutes', () => {
    expect(formatStudyTime(0)).toBe('0 min');
    expect(formatStudyTime(20 * 1000)).toBe('<1 min');
    expect(formatStudyTime(12 * MIN)).toBe('12 min');
    expect(formatStudyTime(65 * MIN)).toBe('1 h 5 min');
    expect(formatStudyTime(180 * MIN)).toBe('3 h');
    expect(formatStudyTime(1500 * 60 * MIN)).toBe('1,500 h');
  });
  it('has a spoken version', () => {
    expect(formatStudyTimeLong(0)).toBe('no time');
    expect(formatStudyTimeLong(20 * 1000)).toBe('less than a minute');
    expect(formatStudyTimeLong(61 * MIN)).toBe('1 hour 1 minute');
    expect(formatStudyTimeLong(120 * MIN)).toBe('2 hours');
  });
});

describe('count', () => {
  it('adds thousands separators', () => {
    expect(count(7)).toBe('7');
    expect(count(999)).toBe('999');
    expect(count(7936)).toBe('7,936');
    expect(count(1234567)).toBe('1,234,567');
    expect(plural(10000, 'card')).toBe('10,000 cards');
  });
});

describe('studyButtonLabel', () => {
  it('shows the due count', () => {
    expect(studyButtonLabel(0)).toBe('Study · 0 due');
    expect(studyButtonLabel(12)).toBe('Study · 12 due');
  });
});

describe('daysAgo', () => {
  it('counts calendar days', () => {
    const now = new Date(2026, 9, 12, 9, 0).getTime();
    expect(daysAgo(new Date(2026, 9, 12, 0, 5).getTime(), now)).toBe('today');
    expect(daysAgo(new Date(2026, 9, 11, 23, 50).getTime(), now)).toBe('yesterday');
    expect(daysAgo(new Date(2026, 9, 2, 12, 0).getTime(), now)).toBe('10 days ago');
  });
});
