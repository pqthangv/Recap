import {
  checkAnswer,
  editDistance,
  expectedAnswer,
  isTypeable,
  markTyped,
  suggestGrade,
} from './answerCheck';
import { Rating } from './scheduler';

describe('isTypeable', () => {
  it('types short answers', () => {
    for (const back of [
      'Hanoi',
      'Porto-Novo\n\nCotonou is the seat of government.',
      'Washington, D.C.',
      'der Apfel',
      'quả táo',
      'Thành phố Hồ Chí Minh',
      '5',
      '葉緑体',
      'sự giáng thủy (mưa, tuyết)',
    ]) {
      expect([back, isTypeable(back)]).toEqual([back, true]);
    }
  });

  it('keeps tap for explanations, definitions and sentences', () => {
    for (const back of [
      'They decide when you see a card again.',
      '(adjective) causing harm or damage',
      'warm, polite, and friendly',
      'The Treaty of Versailles',
      'Rayleigh scattering\nof light',
      'グルコースが作られ、酸素が放出される',
      '',
      '…',
    ]) {
      expect([back, isTypeable(back)]).toEqual([back, false]);
    }
  });
});

describe('isTypeable with the deck language', () => {
  it("gives Vietnamese its longer allowance when the deck says so, even if the text can't tell", () => {
    const unaccented = 'thanh pho ho chi minh'; // typed without accents: looks English
    expect(isTypeable(unaccented)).toBe(false);
    expect(isTypeable(unaccented, 'vi')).toBe(true);
  });
});

describe('expectedAnswer', () => {
  it('uses the first paragraph without notes in brackets', () => {
    expect(expectedAnswer('Porto-Novo\n\nCotonou is the seat of government.')).toBe('Porto-Novo');
    expect(expectedAnswer('(verb) to rise [informal]')).toBe('to rise');
  });
});

describe('checkAnswer', () => {
  it('ignores letter case, spaces and punctuation', () => {
    expect(checkAnswer('  hanoi ', 'Hanoi')).toBe('correct');
    expect(checkAnswer('washington dc', 'Washington, D.C.')).toBe('correct');
    expect(checkAnswer('porto novo', 'Porto-Novo\n\nCotonou is the seat of government.')).toBe(
      'correct',
    );
    expect(checkAnswer('dont', "don't")).toBe('correct');
  });

  it('accepts any of several answers', () => {
    expect(checkAnswer('hound', 'dog; hound')).toBe('correct');
    expect(checkAnswer('color', 'colour / color')).toBe('correct');
  });

  it('treats accents typed either way as the same', () => {
    const composed = 'Hà Nội';
    const decomposed = composed.normalize('NFD');
    expect(checkAnswer(decomposed, composed)).toBe('correct');
    expect(checkAnswer(composed, decomposed)).toBe('correct');
  });

  it('says "almost" when only the accents are wrong', () => {
    expect(checkAnswer('ha noi', 'Hà Nội')).toBe('accents');
    expect(checkAnswer('ma', 'má')).toBe('accents'); // a different word in Vietnamese
    expect(checkAnswer('dong', 'đồng')).toBe('accents');
    expect(checkAnswer('Apfel', 'Äpfel')).toBe('accents');
  });

  it('allows a typo in longer answers only', () => {
    expect(checkAnswer('Gaboron', 'Gaborone')).toBe('typo');
    expect(checkAnswer('Gabroone', 'Gaborone')).toBe('typo'); // two letters swapped
    expect(checkAnswer('Kuala Lumpr', 'Kuala Lumpur')).toBe('typo');
    expect(checkAnswer('cat', 'car')).toBe('wrong');
    expect(checkAnswer('Paris', 'Gaborone')).toBe('wrong');
  });

  it('knows when nothing was typed', () => {
    expect(checkAnswer('', 'Hanoi')).toBe('skipped');
    expect(checkAnswer('  .  ', 'Hanoi')).toBe('skipped');
  });

  it('checks Chinese and Japanese by character', () => {
    expect(checkAnswer('葉緑体', '葉緑体')).toBe('correct');
    expect(checkAnswer('葉緑', '葉緑体')).toBe('wrong');
  });
});

describe('suggestGrade', () => {
  it('maps the result to Again, Hard, Good or Easy', () => {
    expect(suggestGrade('correct', true)).toBe(Rating.Easy);
    expect(suggestGrade('correct', false)).toBe(Rating.Good);
    expect(suggestGrade('accents', true)).toBe(Rating.Hard);
    expect(suggestGrade('typo', false)).toBe(Rating.Hard);
    expect(suggestGrade('wrong', true)).toBe(Rating.Again);
    expect(suggestGrade('skipped', true)).toBe(Rating.Again);
  });
});

describe('editDistance', () => {
  it('counts inserts, deletes, changes and swaps', () => {
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abc', 'abd')).toBe(1);
    expect(editDistance('abc', 'acb')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('markTyped', () => {
  it('marks the letters that are not in the answer', () => {
    expect(markTyped('Gaboronne', 'Gaborone')).toEqual([
      { text: 'Gaboron', ok: true },
      { text: 'n', ok: false },
      { text: 'e', ok: true },
    ]);
    expect(markTyped('hanoi', 'Hà Nội')).toEqual([
      { text: 'h', ok: true },
      { text: 'a', ok: false },
      { text: 'n', ok: true },
      { text: 'o', ok: false },
      { text: 'i', ok: true },
    ]);
  });
});
