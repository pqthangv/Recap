import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CARD_LANGUAGES,
  cardLanguageName,
  cardSideLanguages,
  detectLanguage,
  isCardLanguage,
  SPEECH_LOCALES,
  speechRequest,
  voiceReads,
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
    ['नमस्ते', 'hi'],
    ['भारत की राजधानी क्या है?', 'hi'],
    ['নমস্কার', 'bn'],
    ['বাংলাদেশের রাজধানী কী?', 'bn'],
    // Traditional characters are read as Mandarin, not Cantonese: set the deck for those.
    ['臺灣', 'zh'],
    // Latin letters with no marks of their own: English unless the deck says otherwise.
    ['Selamat pagi', 'en'],
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
    const serverCodes = [...literal.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
    expect(serverCodes).toHaveLength(19);
    expect(CARD_LANGUAGES.map((l) => l.code).sort()).toEqual(serverCodes.sort());
  });

  it('each have a voice and a name', () => {
    for (const { code, name } of CARD_LANGUAGES) {
      expect(SPEECH_LOCALES[code]).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
      // The tag it's read with fits the language's own voices.
      expect(voiceReads(code, SPEECH_LOCALES[code])).toBe(true);
      expect(cardLanguageName(code)).toBe(name);
    }
    expect(new Set(CARD_LANGUAGES.map((l) => l.name)).size).toBe(CARD_LANGUAGES.length);
    expect(cardLanguageName(null)).toBeNull();
  });

  it('checks stored values', () => {
    expect(isCardLanguage('de')).toBe(true);
    expect(isCardLanguage('zh-Hant')).toBe(true);
    expect(isCardLanguage('fil')).toBe(true);
    expect(isCardLanguage('German')).toBe(false);
    expect(isCardLanguage('zh-hant')).toBe(false);
    expect(isCardLanguage(null)).toBe(false);
  });
});

describe('voiceReads', () => {
  it.each([
    // Most languages take any voice of that language.
    ['de', 'de-DE', true],
    ['de', 'de-AT', true],
    ['en', 'en_GB', true],
    ['de', 'da-DK', false],
    ['fil', 'fi-FI', false],
    ['ms', 'msa', false],
    // Mandarin from anywhere reads Simplified Chinese; Hong Kong's voice speaks Cantonese.
    ['zh', 'zh-CN', true],
    ['zh', 'cmn-CN', true],
    ['zh', 'zh-TW', true],
    ['zh', 'zh-HK', false],
    ['zh', 'yue-HK', false],
    // Taiwan's and Hong Kong's need their own region.
    ['zh-Hant', 'zh-TW', true],
    ['zh-Hant', 'cmn_TW', true],
    ['zh-Hant', 'zh-CN', false],
    ['zh-Hant', 'zh-HK', false],
    ['yue', 'zh-HK', true],
    ['yue', 'yue-HK', true],
    ['yue', 'yue_HK', true],
    ['yue', 'zh-CN', false],
    ['yue', 'zh-TW', false],
    // Older names some engines still use.
    ['id', 'in-ID', true],
    ['id', 'id-ID', true],
    ['fil', 'tl-PH', true],
    ['fil', 'fil-PH', true],
    ['hi', 'hi-IN', true],
    ['bn', 'bn-IN', true],
    ['bn', 'bn-BD', true],
  ] as const)('%s with a %s voice: %s', (lang, voice, fits) => {
    expect(voiceReads(lang, voice)).toBe(fits);
  });
});

describe('speechRequest', () => {
  const voice = (language: string, identifier: string) => ({ language, identifier });
  // Part of the list Google's voices gave on the PixelTablet emulator (2026-11-07).
  const android = [
    voice('zh-TW', 'cmn-tw-x-ctc-network'),
    voice('bn-IN', 'bn-in-x-bnd-local'),
    voice('yue-HK', 'yue-hk-x-yuf-network'),
    voice('bn-BD', 'bn-bd-x-ban-local'),
    voice('bn-BD', 'bn-BD-language'),
    voice('zh-TW', 'zh-TW-language'),
    voice('zh-CN', 'cmn-cn-x-ccc-local'),
    voice('zh-CN', 'zh-CN-language'),
    voice('yue-HK', 'yue-HK-language'),
    voice('fil-PH', 'fil-ph-x-fie-local'),
    voice('fil-PH', 'fil-PH-language'),
    voice('id-ID', 'id-ID-language'),
    voice('de-DE', 'de-DE-language'),
  ];
  // A list as an iPhone gives it (Apple's naming; voices differ between phones).
  const iphone = [
    voice('zh-CN', 'com.apple.voice.compact.zh-CN.Tingting'),
    voice('zh-HK', 'com.apple.voice.compact.zh-HK.Sinji'),
    voice('zh-TW', 'com.apple.voice.compact.zh-TW.Meijia'),
    voice('bn-IN', 'com.apple.voice.compact.bn-IN.Piya'),
    voice('id-ID', 'com.apple.voice.compact.id-ID.Damayanti'),
  ];

  it('names the voice on Android where the region matters', () => {
    expect(speechRequest('zh-Hant', android, true)).toEqual({
      language: 'zh-TW',
      voice: 'zh-TW-language',
    });
    expect(speechRequest('yue', android, true)).toEqual({
      language: 'yue-HK',
      voice: 'yue-HK-language',
    });
    expect(speechRequest('bn', android, true)).toEqual({
      language: 'bn-BD',
      voice: 'bn-BD-language',
    });
  });

  it('only asks for the language elsewhere, so the phone keeps its preferred voice', () => {
    expect(speechRequest('zh', android, true)).toEqual({ language: 'zh-CN' });
    expect(speechRequest('fil', android, true)).toEqual({ language: 'fil-PH' });
    expect(speechRequest('de', android, true)).toEqual({ language: 'de-DE' });
    expect(speechRequest('zh-Hant', iphone, false)).toEqual({ language: 'zh-TW' });
    expect(speechRequest('yue', iphone, false)).toEqual({ language: 'zh-HK' });
    expect(speechRequest('zh', iphone, false)).toEqual({ language: 'zh-CN' });
    // Edge's list (2026-11-07) has dialects too: the plain tag wins.
    const edge = [
      voice('zh-CN-liaoning', 'Microsoft Xiaobei Online (Natural)'),
      voice('zh-CN', 'Microsoft Xiaoxiao Online (Natural)'),
      voice('zh-HK', 'Microsoft HiuMaan Online (Natural)'),
    ];
    expect(speechRequest('zh', edge, false)).toEqual({ language: 'zh-CN' });
    expect(speechRequest('yue', edge, false)).toEqual({ language: 'zh-HK' });
  });

  it("takes another region's voice when the phone has no voice from the usual one", () => {
    // No Bengali voice from Bangladesh on this iPhone: India's, not the phone's English one.
    expect(speechRequest('bn', iphone, false)).toEqual({ language: 'bn-IN' });
    expect(speechRequest('bn', [voice('bn-IN', 'bn-in-x-bnd-local')], true)).toEqual({
      language: 'bn-IN',
      voice: 'bn-in-x-bnd-local',
    });
    expect(speechRequest('id', [voice('in_ID', 'old')], false)).toEqual({ language: 'in-ID' });
  });

  it('uses the usual tag with no voice for the language, or no list at all', () => {
    expect(speechRequest('fil', iphone, false)).toEqual({ language: 'fil-PH' });
    expect(speechRequest('yue', [voice('zh-CN', 'zh-CN-language')], true)).toEqual({
      language: 'zh-HK',
    });
    expect(speechRequest('hi', [], true)).toEqual({ language: 'hi-IN' });
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
