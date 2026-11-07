// The website's path for a newer language: its text downloads first, and lines it doesn't have yet
// show in English. Vietnamese stands in for that language here (the real vi.ts is complete and
// on the phone at once: i18n.test.ts).
import { language, setLanguageChoice, t, tn } from './index';

const mockSite = {
  text: {} as Record<string, string>,
  downloaded: false,
  offline: false,
  pending: [] as (() => void)[],
};
jest.mock('./load', () => ({
  translationNow: () => (mockSite.downloaded ? mockSite.text : null),
  fetchTranslation: () =>
    new Promise((resolve, reject) => {
      mockSite.pending.push(() => {
        if (mockSite.offline) return reject(new Error('offline'));
        mockSite.downloaded = true;
        resolve(mockSite.text);
      });
    }),
}));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));

/** The browser finishes every download asked for so far. */
const finishDownloads = () => mockSite.pending.splice(0).forEach((finish) => finish());

beforeEach(async () => {
  await setLanguageChoice('en');
  Object.assign(mockSite, { downloaded: false, offline: false, pending: [] });
  mockSite.text = { 'home.study': 'Học · {n} thẻ cần ôn', 'count.deck_other': '{n} bộ thẻ' };
});

it('waits for the download, then shows English for the lines it lacks', async () => {
  const shown = setLanguageChoice('vi');
  expect(language()).toBe('en'); // still downloading: the screens wait (app/_layout.tsx)
  finishDownloads();
  await shown;
  expect(language()).toBe('vi');
  expect(t('home.study', { n: 1234 })).toBe('Học · 1.234 thẻ cần ôn');
  expect(t('common.cancel')).toBe('Cancel');
  expect(tn('count.deck', 2)).toBe('2 bộ thẻ');
  expect(tn('count.deck', 1)).toBe('1 deck');
});

it('stays as it was when the download fails', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockSite.offline = true;
  const shown = setLanguageChoice('vi');
  finishDownloads();
  await shown;
  expect(language()).toBe('en');
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

it('shows the last language picked, not one that finished downloading later', async () => {
  const first = setLanguageChoice('vi');
  await setLanguageChoice('en');
  finishDownloads();
  await first;
  expect(language()).toBe('en');
});
