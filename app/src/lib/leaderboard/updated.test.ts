import { setLanguage } from '../i18n';

import { minutesSinceUpdate, updatedText } from './updated';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));

const AT = Date.UTC(2026, 10, 6, 12);
const MIN = 60_000;

afterEach(() => setLanguage('en'));

describe('"Updated 12 min ago"', () => {
  it("adds the time since the Worker's answer to the board's age then", () => {
    expect(minutesSinceUpdate(0, AT, AT)).toBe(0);
    expect(minutesSinceUpdate(12, AT, AT + 30_000)).toBe(12);
    expect(minutesSinceUpdate(12, AT, AT + 3 * MIN)).toBe(15);
    // The phone's clock going back doesn't take minutes off.
    expect(minutesSinceUpdate(5, AT, AT - 10 * MIN)).toBe(5);
  });

  it('says nothing for an answer without it (an older Worker) or a broken one', () => {
    expect(minutesSinceUpdate(undefined, AT, AT)).toBeNull();
    expect(minutesSinceUpdate(-1, AT, AT)).toBeNull();
    expect(minutesSinceUpdate(Number.NaN, AT, AT)).toBeNull();
    expect(minutesSinceUpdate('12', AT, AT)).toBeNull();
    expect(updatedText(undefined, AT, AT)).toBeNull();
  });

  it('in English and Vietnamese', () => {
    expect(updatedText(0, AT, AT)).toBe('Updated just now');
    expect(updatedText(1, AT, AT)).toBe('Updated 1 min ago');
    expect(updatedText(12, AT, AT)).toBe('Updated 12 min ago');
    setLanguage('vi');
    expect(updatedText(0, AT, AT)).toBe('Vừa cập nhật');
    expect(updatedText(12, AT, AT)).toBe('Cập nhật 12 phút trước');
  });
});
