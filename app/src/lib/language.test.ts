import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CARD_LANGUAGES,
  cardLanguageName,
  cardSideLanguages,
  detectLanguage,
  isCardLanguage,
  SPEECH_LOCALES,
} from './language';

describe('detectLanguage', () => {
  it.each([
    ['Capital of Vietnam', 'en'],
    ['What do "Forgot" and "Got it" do?', 'en'],
    ['café', 'en'],
    ['Hà Nội', 'vi'],
    ['Việt Nam', 'vi'],
    ['đi', 'vi'],
    ['cá', 'vi'],
    ['tôi là sinh viên', 'vi'],
    ['Thủ đô của Pháp là gì?', 'vi'],
    // Decomposed (NFD) text from some keyboards: "Hà Nội" written with combining marks.
    ['Hà Nội', 'vi'],
    // Their own alphabets.
    ['안녕하세요', 'ko'],
    ['ありがとう', 'ja'],
    ['光合成は葉緑体で行われます', 'ja'],
    ['你好', 'zh'],
    ['สวัสดี', 'th'],
    ['Привет', 'ru'],
    // Their own letters.
    ['der Käse', 'de'],
    ['die Straße', 'de'],
    ['Käse'.normalize('NFD'), 'de'],
    ['el niño', 'es'],
    ['¿Dónde está?', 'es'],
    ['le garçon', 'fr'],
    ['un œuf', 'fr'],
  ])('%s → %s', (text, lang) => {
    expect(detectLanguage(text)).toBe(lang);
  });
});

describe('card languages', () => {
  it("are exactly the server's list for Create with AI, so the server never refuses one", () => {
    const python = readFileSync(
      join(__dirname, '..', '..', '..', 'server', 'app', 'llm', 'languages.py'),
      'utf8',
    );
    const literal = /LanguageCode = Literal\[([^\]]+)\]/.exec(python)?.[1] ?? '';
    const serverCodes = [...literal.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(serverCodes.length).toBeGreaterThan(0);
    expect(CARD_LANGUAGES.map((l) => l.code).sort()).toEqual(serverCodes.sort());
  });

  it('each have a voice and a name', () => {
    for (const { code, name } of CARD_LANGUAGES) {
      expect(SPEECH_LOCALES[code]).toMatch(new RegExp(`^${code}-[A-Z]{2}$`));
      expect(cardLanguageName(code)).toBe(name);
    }
    expect(cardLanguageName(null)).toBeNull();
  });

  it('checks stored values', () => {
    expect(isCardLanguage('de')).toBe(true);
    expect(isCardLanguage('German')).toBe(false);
    expect(isCardLanguage(null)).toBe(false);
  });
});

describe('cardSideLanguages', () => {
  const deck = { front_lang: 'de', back_lang: 'vi' };

  it("uses the deck's languages, swapped on reverse cards", () => {
    expect(cardSideLanguages(deck, false)).toEqual({ front: 'de', back: 'vi' });
    expect(cardSideLanguages(deck, true)).toEqual({ front: 'vi', back: 'de' });
  });

  it('is Auto without a deck, without a setting, or with an unknown code', () => {
    expect(cardSideLanguages(undefined, false)).toEqual({ front: null, back: null });
    expect(cardSideLanguages({ front_lang: null, back_lang: 'xx' }, false)).toEqual({
      front: null,
      back: null,
    });
  });
});
