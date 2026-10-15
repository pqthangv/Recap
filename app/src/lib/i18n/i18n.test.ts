import { getLocales } from 'expo-localization';

import { WELCOME_DECKS } from '@/features/onboarding/seed';
import { errorFromResponse } from '@/lib/ai';
import { isTypeable } from '@/lib/answerCheck';
import { reminderText } from '@/lib/reminders';

import { en } from './en';
import {
  language,
  phoneLanguage,
  refreshLanguage,
  setLanguage,
  setLanguageChoice,
  t,
  tn,
} from './index';
import { vi } from './vi';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../../test/db').createTestClient());
const mockLocales = getLocales as jest.Mock;

afterEach(() => {
  mockLocales.mockImplementation(() => [{ languageCode: 'en' }]);
  setLanguageChoice('auto');
});

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the Vietnamese text', () => {
  it('has every English key and no others', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it('fills in the same blanks as the English', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect({ key, blanks: placeholders(vi[key]) }).toEqual({
        key,
        blanks: placeholders(en[key]),
      });
    }
  });

  it('has both forms of every count', () => {
    const keys = Object.keys(en);
    for (const key of keys) {
      if (key.endsWith('_one')) expect(keys).toContain(key.replace(/_one$/, '_other'));
    }
  });

  it('is not left in English by mistake', () => {
    // Words that are the same in both languages.
    const same = new Set(['paste.tab', 'ai.tabPdf']);
    const untranslated = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => !same.has(key) && /[a-z]{3}/i.test(en[key]) && vi[key] === en[key],
    );
    expect(untranslated).toEqual([]);
  });
});

describe('t and tn', () => {
  it('fill in blanks and format numbers', () => {
    expect(t('home.study', { n: 1234 })).toBe('Study · 1,234 due');
    expect(t('deck.inside', { name: 'SAT' })).toBe('Inside “SAT”');
    expect(tn('count.deck', 1)).toBe('1 deck');
    expect(tn('count.deck', 2)).toBe('2 decks');
  });

  it('switch language', () => {
    setLanguage('vi');
    expect(language()).toBe('vi');
    expect(t('home.study', { n: 1234 })).toBe('Học · 1.234 thẻ cần ôn');
    expect(tn('count.deck', 2)).toBe('2 bộ thẻ');
  });

  it('leave a blank alone when nothing is given for it', () => {
    expect(t('deck.inside', {})).toBe('Inside “{name}”');
  });
});

describe('phoneLanguage', () => {
  it("picks the first of the phone's languages that Recap has", () => {
    mockLocales.mockImplementation(() => [{ languageCode: 'vi' }, { languageCode: 'en' }]);
    expect(phoneLanguage()).toBe('vi');
    mockLocales.mockImplementation(() => [{ languageCode: 'fr' }, { languageCode: 'vi' }]);
    expect(phoneLanguage()).toBe('vi');
    mockLocales.mockImplementation(() => [{ languageCode: 'ja' }]);
    expect(phoneLanguage()).toBe('en');
  });

  it('falls back to English if the phone can’t say', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLocales.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(phoneLanguage()).toBe('en');
    warn.mockRestore();
  });

  it("gives way to the language picked in Settings, until it's back on the phone's", () => {
    mockLocales.mockImplementation(() => [{ languageCode: 'en' }]);
    setLanguageChoice('vi');
    expect(language()).toBe('vi');
    refreshLanguage(); // coming back to the app keeps the choice
    expect(language()).toBe('vi');
    setLanguageChoice('auto');
    expect(language()).toBe('en');
    mockLocales.mockImplementation(() => [{ languageCode: 'vi' }]);
    setLanguageChoice('en');
    expect(language()).toBe('en');
  });

  it('is picked up again when the app comes back', () => {
    expect(language()).toBe('en');
    mockLocales.mockImplementation(() => [{ languageCode: 'vi' }]);
    refreshLanguage();
    expect(language()).toBe('vi');
  });
});

describe('Vietnamese around the app', () => {
  it('reminds in Vietnamese', () => {
    setLanguage('vi');
    expect(reminderText(12)).toBe('Bạn có 12 thẻ cần ôn');
  });

  it("shows the app's own text for server errors (the server writes English)", () => {
    const body = { error: 'quota_exceeded', message: "You've made 50 AI cards today." };
    expect(errorFromResponse(429, body).message).toBe("You've made 50 AI cards today.");
    setLanguage('vi');
    expect(errorFromResponse(429, body).message).toBe(vi['aiError.quota']);
    expect(errorFromResponse(500, { error: 'boom', message: 'Internal' }).message).toBe(
      vi['aiError.server'],
    );
    // A code the app doesn't know yet: its kind decides.
    expect(errorFromResponse(503, { error: 'new_code', message: 'Busy' }).message).toBe(
      vi['aiError.busy'],
    );
  });

  it('has welcome cards that name the real buttons', () => {
    for (const lang of ['en', 'vi'] as const) {
      setLanguage(lang);
      const text = WELCOME_DECKS[lang][0].cards.flat().join('\n');
      for (const grade of ['grade.again', 'grade.hard', 'grade.good', 'grade.easy'] as const) {
        expect(text).toContain(t(grade));
      }
      expect(text).toContain(t('study.check'));
      expect(text).toContain(t('settings.readAloud'));
      expect(text).toContain(t('screen.addCard'));
      expect(text).toContain(t('deck.delete'));
    }
    // "3 ngày" on the button has a no-break space; the card text has a plain one.
    const threeDays = () => t('interval.days', { n: 3 }).replace(/ /g, ' ');
    setLanguage('vi');
    expect(WELCOME_DECKS.vi[0].cards.flat().join('\n')).toContain(threeDays());
    setLanguage('en');
    expect(WELCOME_DECKS.en[0].cards.flat().join('\n')).toContain(threeDays());
  });

  it('starts the welcome deck with a card to type, then one to tap', () => {
    for (const lang of ['en', 'vi'] as const) {
      const [first, second] = WELCOME_DECKS[lang][0].cards;
      expect(isTypeable(first[1])).toBe(true);
      expect(isTypeable(second[1])).toBe(false);
    }
  });
});
