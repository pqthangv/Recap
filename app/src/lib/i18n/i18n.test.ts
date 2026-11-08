import { getLocales } from 'expo-localization';

import { errorFromResponse } from '@/lib/ai';
import { reminderText } from '@/lib/reminders';

import { en } from './en';
import {
  APP_LANGUAGES,
  decimal,
  groupDigits,
  LANGUAGE_NAMES,
  language,
  phoneLanguage,
  refreshLanguage,
  setLanguage,
  setLanguageChoice,
  t,
  tn,
} from './index';
import { LANGUAGE_INFO } from './languages';
import { translationNow } from './load';
import * as web from './load.web';
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
    const same = new Set(['paste.tab', 'ai.tabPdf', 'math.phi']);
    const untranslated = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => !same.has(key) && /[a-z]{3}/i.test(en[key]) && vi[key] === en[key],
    );
    expect(untranslated).toEqual([]);
  });
});

describe('the app languages', () => {
  it('each have their own name, a locale and number marks', () => {
    for (const lang of APP_LANGUAGES) {
      const info = LANGUAGE_INFO[lang];
      expect(info.locale).toMatch(new RegExp(`^${lang}-([A-Z]{2}|419)$`)); // es-419: Latin America
      expect(info.thousands).not.toBe(info.decimal);
      expect(['one', 'other']).toContain(info.plural(1));
    }
    const names = APP_LANGUAGES.map((lang) => LANGUAGE_NAMES[lang]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only use keys English has, and the same blanks', () => {
    for (const lang of APP_LANGUAGES.filter((l) => l !== 'en')) {
      const text = translationNow(lang)!;
      for (const key of Object.keys(text) as (keyof typeof en)[]) {
        expect({ lang, key, known: key in en }).toEqual({ lang, key, known: true });
        expect({ lang, key, blanks: placeholders(text[key]!) }).toEqual({
          lang,
          key,
          blanks: placeholders(en[key]),
        });
      }
    }
  });

  // The newer ones download on the website (load.web.ts): TypeScript makes sure each has a
  // loader, but Jest can't run import().
  it('include Vietnamese in the website’s own file', async () => {
    expect(web.translationNow('vi')).toBe(vi);
    await expect(web.fetchTranslation('vi')).resolves.toBe(vi);
    expect(web.translationNow('hi')).toBeNull();
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

  it('group digits by thousands, or as India does', () => {
    expect(groupDigits('7936', ',')).toBe('7,936');
    expect(groupDigits('1234567', '.')).toBe('1.234.567');
    expect(groupDigits('999', ',', true)).toBe('999');
    expect(groupDigits('7936', ',', true)).toBe('7,936');
    expect(groupDigits('123456', ',', true)).toBe('1,23,456');
    expect(groupDigits('12345678', ',', true)).toBe('1,23,45,678');
    expect(groupDigits('-1234567', ',', true)).toBe('-12,34,567');
  });

  it('write decimals with each language’s marks', () => {
    expect(decimal(2.5, 1)).toBe('2.5');
    expect(decimal(1234.56, 1)).toBe('1,234.6');
    expect(decimal(3, 0)).toBe('3');
    setLanguage('vi');
    expect(decimal(2.5, 1)).toBe('2,5');
    expect(decimal(1234.56, 1)).toBe('1.234,6');
    setLanguage('hi');
    expect(decimal(1234567.5, 1)).toBe('12,34,567.5');
    setLanguage('fr');
    expect(decimal(7936.25, 2)).toBe('7 936,25');
  });

  it('take the singular for 0 where the language does', () => {
    const forms = (lang: keyof typeof LANGUAGE_INFO) =>
      [0, 1, 2, 21].map((n) => LANGUAGE_INFO[lang].plural(n));
    expect(forms('en')).toEqual(['other', 'one', 'other', 'other']);
    expect(forms('es')).toEqual(['other', 'one', 'other', 'other']);
    for (const lang of ['fr', 'pt', 'hi', 'bn'] as const) {
      expect(forms(lang)).toEqual(['one', 'one', 'other', 'other']);
    }
  });
});

describe('phoneLanguage', () => {
  it("picks the first of the phone's languages that Recap has", () => {
    mockLocales.mockImplementation(() => [{ languageCode: 'vi' }, { languageCode: 'en' }]);
    expect(phoneLanguage()).toBe('vi');
    mockLocales.mockImplementation(() => [{ languageCode: 'sw' }, { languageCode: 'vi' }]);
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
});
