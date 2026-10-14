import {
  count,
  daysAgo,
  formatInterval,
  formatIntervalLong,
  formatStudyTime,
  formatStudyTimeLong,
  studyButtonLabel,
  weekdayShort,
} from '@/lib/format';
import { setLanguage, tn } from '@/lib/i18n';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

afterEach(() => setLanguage('en'));

describe('formatStudyTime', () => {
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
  it('speaks Vietnamese', () => {
    setLanguage('vi');
    expect(formatStudyTime(65 * MIN)).toBe('1 giờ 5 phút');
    expect(formatStudyTime(1500 * 60 * MIN)).toBe('1.500 giờ');
    expect(formatStudyTimeLong(120 * MIN)).toBe('2 giờ');
  });
});

describe('formatInterval', () => {
  it('is short for the answer buttons', () => {
    expect(formatInterval(30 * 1000)).toBe('<1m');
    expect(formatInterval(10 * MIN)).toBe('10m');
    expect(formatInterval(3 * DAY)).toBe('3d');
    expect(formatInterval(75 * DAY)).toBe('2.5mo');
    expect(formatIntervalLong(DAY)).toBe('in 1 day');
    expect(formatIntervalLong(4 * DAY)).toBe('in 4 days');
  });
  it('writes Vietnamese units and decimal commas', () => {
    setLanguage('vi');
    // A no-break space keeps the number with its unit when a button wraps.
    expect(formatInterval(10 * MIN)).toBe('10 phút');
    expect(formatInterval(3 * DAY)).toBe('3 ngày');
    expect(formatInterval(75 * DAY)).toBe('2,5 tháng');
    expect(formatIntervalLong(4 * DAY)).toBe('sau 4 ngày');
  });
});

describe('count', () => {
  it('adds thousands separators', () => {
    expect(count(7)).toBe('7');
    expect(count(999)).toBe('999');
    expect(count(7936)).toBe('7,936');
    expect(count(1234567)).toBe('1,234,567');
    expect(tn('count.card', 10000)).toBe('10,000 cards');
    expect(tn('count.card', 1)).toBe('1 card');
  });
  it('uses dots in Vietnamese', () => {
    setLanguage('vi');
    expect(count(1234567)).toBe('1.234.567');
    expect(tn('count.card', 10000)).toBe('10.000 thẻ');
  });
});

describe('studyButtonLabel', () => {
  it('shows the due count', () => {
    expect(studyButtonLabel(0)).toBe('Study · 0 due');
    expect(studyButtonLabel(12)).toBe('Study · 12 due');
    setLanguage('vi');
    expect(studyButtonLabel(12)).toBe('Học · 12 thẻ cần ôn');
  });
});

describe('daysAgo', () => {
  it('counts calendar days', () => {
    const now = new Date(2026, 9, 12, 9, 0).getTime();
    expect(daysAgo(new Date(2026, 9, 12, 0, 5).getTime(), now)).toBe('today');
    expect(daysAgo(new Date(2026, 9, 11, 23, 50).getTime(), now)).toBe('yesterday');
    expect(daysAgo(new Date(2026, 9, 2, 12, 0).getTime(), now)).toBe('10 days ago');
    setLanguage('vi');
    expect(daysAgo(new Date(2026, 9, 2, 12, 0).getTime(), now)).toBe('10 ngày trước');
  });
});

describe('weekdayShort', () => {
  it('names the day', () => {
    const monday = new Date(2026, 9, 12).getTime();
    expect(weekdayShort(monday)).toBe('Mon');
    setLanguage('vi');
    expect(weekdayShort(monday)).toBe('T2');
    expect(weekdayShort(new Date(2026, 9, 11).getTime())).toBe('CN');
  });
});
