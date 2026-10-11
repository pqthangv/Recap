import { detectLanguage } from './language';

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
    ['Hà Nội', 'vi'],
  ])('%s → %s', (text, lang) => {
    expect(detectLanguage(text)).toBe(lang);
  });
});
