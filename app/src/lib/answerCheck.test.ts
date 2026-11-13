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

  it('keeps tap for answers with math, but not for prices', () => {
    expect(isTypeable('$x = 3$')).toBe(false);
    expect(isTypeable('\\(\\frac{1}{2}\\)')).toBe(false);
    expect(isTypeable('$50')).toBe(true);
  });

  it('checks a price written as \\$ against what the card shows', () => {
    expect(expectedAnswer('\\$2')).toBe('$2');
    expect(checkAnswer('$2', '\\$2')).toBe('correct');
  });
});

describe('isTypeable with the deck language', () => {
  it("gives Vietnamese its longer allowance when the deck says so, even if the text can't tell", () => {
    const unaccented = 'thanh pho ho chi minh'; // typed without accents: looks English
    expect(isTypeable(unaccented)).toBe(false);
    expect(isTypeable(unaccented, 'vi')).toBe(true);
  });

  it('doesn\'t count articles and "se" in Spanish, Portuguese, French, Italian and German', () => {
    expect(isTypeable('se brosser les dents', 'fr')).toBe(true);
    expect(isTypeable('ir a la escuela', 'es')).toBe(true);
    expect(isTypeable('fazer o dever de casa', 'pt')).toBe(false); // still four
    // English counts them: a definition stays tapped.
    expect(isTypeable('to give someone a job', 'en')).toBe(false);
    expect(isTypeable('se brosser les dents')).toBe(false); // no deck language: counted
  });
});

describe('natural answers', () => {
  const yes = 'vâng\n\nVâng, tôi hiểu.\n\nCũng nói: dạ, có';

  it('takes an article or classifier the typed answer adds', () => {
    expect(checkAnswer('la familia', 'familia', 'es')).toBe('correct');
    expect(checkAnswer('a família', 'família', 'pt')).toBe('correct');
    expect(checkAnswer('l’école', 'école', 'fr')).toBe('correct');
    expect(checkAnswer("l'ecole", 'école', 'fr')).toBe('accents');
    expect(checkAnswer('der Apfel', 'Apfel', 'de')).toBe('correct');
    expect(checkAnswer('to go', 'go', 'en')).toBe('correct');
    expect(checkAnswer('quả táo', 'táo', 'vi')).toBe('correct');
    expect(checkAnswer('con mèo', 'mèo', 'vi')).toBe('correct');
    // A deck without a language: any of the common articles.
    expect(checkAnswer('la familia', 'familia')).toBe('correct');
    expect(checkAnswer('der Apfel', 'Apfel')).toBe('correct');
  });

  it("doesn't take one that makes another word or phrase", () => {
    expect(checkAnswer('a few', 'few', 'en')).toBe('wrong'); // some, not hardly any
    expect(checkAnswer('un peu', 'peu', 'fr')).toBe('wrong');
    expect(checkAnswer('una vez', 'vez', 'es')).toBe('wrong');
    expect(checkAnswer('trái cây', 'cây', 'vi')).toBe('wrong'); // fruit, not a tree
    expect(checkAnswer('cây xăng', 'xăng', 'vi')).toBe('wrong'); // a petrol station
    expect(checkAnswer('tòa nhà', 'nhà', 'vi')).toBe('wrong'); // a building
    expect(checkAnswer('cây bút', 'bút', 'vi')).toBe('correct');
  });

  it("says almost when the card's article is left out, which shows if a word is feminine", () => {
    expect(checkAnswer('libro', 'el libro', 'es')).toBe('typo');
    expect(checkAnswer('semaine prochaine', 'la semaine prochaine', 'fr')).toBe('typo');
    expect(checkAnswer('la libro', 'el libro', 'es')).toBe('typo'); // the wrong article
    expect(checkAnswer('mèo', 'con mèo', 'vi')).toBe('typo');
    expect(checkAnswer('trai', 'con trai', 'vi')).toBe('typo'); // only almost: a son isn't a boy
    expect(checkAnswer('few', 'a few', 'en')).toBe('wrong');
    // "to" says nothing: leaving it out is right.
    expect(checkAnswer('give up', 'to give up', 'en')).toBe('correct');
  });

  it('takes the other answers a note gives for the same meaning', () => {
    expect(checkAnswer('dạ', yes, 'vi')).toBe('correct');
    expect(checkAnswer('có', yes, 'vi')).toBe('correct');
    expect(checkAnswer('da', yes, 'vi')).toBe('accents');
    expect(checkAnswer('zumo', 'jugo\n\nQuiero un jugo.\n\nEn España: zumo', 'es')).toBe('correct');
    expect(checkAnswer('chum', 'copain\n\nC’est mon copain.\n\nAu Québec : chum', 'fr')).toBe(
      'correct',
    );
    const we = 'chúng tôi\n\nChúng tôi sống ở đây.\n\nCũng nói: chúng ta (gồm cả người nghe)';
    expect(checkAnswer('chúng ta', we, 'vi')).toBe('correct');
    const you = 'bạn\n\nBạn thật tốt.\n\nCũng nói: anh, chị, em… tùy người nghe';
    expect(checkAnswer('em', you, 'vi')).toBe('correct');
  });

  it("doesn't take another meaning, an English variant, a hint or an opposite from a note", () => {
    const old = 'già\n\nÔng tôi đã già.\n\nVới đồ vật: cũ';
    expect(checkAnswer('cũ', old, 'vi')).toBe('wrong'); // old things, not old people
    const take = 'quitarse\n\nQuítate la chaqueta.\n\nTambién significa: despegar';
    expect(checkAnswer('despegar', take, 'es')).toBe('wrong');
    expect(
      checkAnswer('fall', 'otoño\n\nMe gusta el otoño.\n\nEn inglés americano: fall', 'es'),
    ).toBe('wrong');
    expect(checkAnswer('fall', 'mùa thu\n\nMùa thu đẹp.\n\nTiếng Anh Mỹ: fall', 'vi')).toBe(
      'wrong',
    );
    expect(checkAnswer('cold', 'hot\n\nOpposite: cold')).toBe('wrong');
    expect(checkAnswer('cotonou', 'Porto-Novo\n\nCotonou is the seat of government.')).toBe(
      'wrong',
    );
  });

  it('takes "se tornar" for "tornar-se", and the other way round', () => {
    expect(checkAnswer('se tornar', 'tornar-se', 'pt')).toBe('correct');
    expect(checkAnswer('tornar-se', 'se tornar', 'pt')).toBe('correct');
    expect(checkAnswer('se vestir', 'vestir-se\n\nVai se vestir.', 'pt')).toBe('correct');
  });

  it('takes spellings that are both right', () => {
    expect(checkAnswer('Strasse', 'Straße', 'de')).toBe('correct');
    expect(checkAnswer('fuer', 'für', 'de')).toBe('correct');
    expect(checkAnswer('Oel', 'Öl', 'de')).toBe('correct');
    expect(checkAnswer('fur', 'für', 'de')).toBe('accents');
    expect(checkAnswer('ténis', 'tênis', 'pt')).toBe('correct'); // Portugal, Brazil
    expect(checkAnswer('avó', 'avô', 'pt')).toBe('accents'); // grandmother, grandfather
    expect(checkAnswer('khoẻ', 'khỏe', 'vi')).toBe('correct'); // the tone on either vowel
    expect(checkAnswer('tàu hoả', 'tàu hỏa', 'vi')).toBe('correct');
    expect(checkAnswer('thuỷ', 'thủy', 'vi')).toBe('correct');
    expect(checkAnswer('Mĩ', 'Mỹ', 'vi')).toBe('correct');
    expect(checkAnswer('kì thi', 'kỳ thi', 'vi')).toBe('correct');
    expect(checkAnswer('li', 'ly', 'vi')).toBe('wrong'); // a millimetre, a glass
    expect(checkAnswer('tai', 'tay', 'vi')).toBe('wrong'); // an ear, a hand
    expect(checkAnswer('जरूर', 'ज़रूर', 'hi')).toBe('correct'); // without the dot
    expect(checkAnswer('हां', 'हाँ', 'hi')).toBe('correct'); // ं for ँ
    expect(checkAnswer('हिंदी', 'हिन्दी', 'hi')).toBe('correct');
    expect(checkAnswer('संबंध', 'सम्बन्ध', 'hi')).toBe('correct');
    expect(checkAnswer('नयी', 'नई', 'hi')).toBe('correct');
    expect(checkAnswer('गये', 'गए', 'hi')).toBe('correct');
    expect(checkAnswer('बडा', 'बड़ा', 'hi')).toBe('accents'); // ड़ is another letter: almost
    expect(checkAnswer('রং', 'রঙ', 'bn')).toBe('correct');
    expect(checkAnswer('সংগীত', 'সঙ্গীত', 'bn')).toBe('correct');
    expect(checkAnswer('বড', 'বড়', 'bn')).toBe('accents'); // another letter: almost
    expect(checkAnswer('কাচা', 'কাঁচা', 'bn')).toBe('accents'); // without the chandrabindu
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

  it('takes "oe" and "ae" for œ and æ, as phone keyboards often type them', () => {
    expect(checkAnswer('oeuf', 'œuf')).toBe('correct');
    expect(checkAnswer('grande soeur', 'grande sœur')).toBe('correct');
    expect(checkAnswer('Cœur', 'coeur')).toBe('correct');
    expect(checkAnswer('aether', 'æther')).toBe('correct');
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
