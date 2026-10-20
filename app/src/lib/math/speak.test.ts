import { speakMath, speakSide } from './speak';

describe('speakMath in English', () => {
  it.each([
    ['x^2', 'x squared'],
    ['x^3', 'x cubed'],
    ['x^n', 'x to the power of n'],
    ['e^{x+1}', 'e to the power of x plus 1'],
    ['x_1', 'x sub 1'],
    ['x_1^2', 'x sub 1 squared'],
    ['(a+b)^2', 'a plus b, squared'],
    ['\\frac{a}{b}', 'a over b'],
    ['\\frac{1}{2}', '1 over 2'],
    ['\\frac{x+1}{2}', 'the fraction x plus 1, over 2'],
    ['\\sqrt{2}', 'the square root of 2'],
    ['\\sqrt{x+1}', 'the square root of x plus 1'],
    ['\\sqrt[3]{8} = 2', 'root 3 of 8 equals 2'],
    ['3.14 < \\pi', '3.14 is less than pi'],
    ['a \\le b', 'a is less than or equal to b'],
    ['a \\ne b', 'a is not equal to b'],
    ['\\alpha + \\beta', 'alpha plus beta'],
    ['\\Delta x', 'delta x'],
    ['90^\\circ', '90 degrees'],
    ["f'(x)", 'f prime x'],
    ['\\sin x', 'sine x'],
    ['\\sum_{i=1}^{n} i', 'the sum from i equals 1 to n of i'],
    ['\\int_0^1 x^2\\,dx', 'the integral from 0 to 1 of x squared d x'],
    ['\\lim_{x \\to 0} f(x)', 'the limit as x goes to 0 of f x'],
    ['\\binom{n}{k}', 'n choose k'],
    ['\\vec{v}', 'vector v'],
    ['\\text{speed} = \\frac{d}{t}', 'speed equals d over t'],
    ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'the matrix a, b; c, d'],
    ['\\ce{2H2 + O2 -> 2H2O}', '2 H 2 plus O 2 gives 2 H 2 O'],
    ['5!', '5 factorial'],
  ])('%s → %s', (tex, words) => {
    expect(speakMath(tex, 'en')).toBe(words);
  });

  it('says "formula" when there is nothing to say', () => {
    expect(speakMath('\\displaystyle', 'en')).toBe('formula');
  });
});

describe('speakMath in Vietnamese', () => {
  it.each([
    ['x^2', 'x bình phương'],
    ['x^3', 'x lập phương'],
    ['x^n', 'x mũ n'],
    ['\\frac{a}{b}', 'a trên b'],
    ['\\sqrt{2}', 'căn bậc hai của 2'],
    ['x_1 + x_2 = 5', 'x 1 cộng x 2 bằng 5'],
    ['a \\ge b', 'a lớn hơn hoặc bằng b'],
    ['\\alpha', 'an-pha'],
    ['\\cos x', 'côsin x'],
    ['\\int_0^1 f(x)\\,dx', 'tích phân từ 0 đến 1 của f x d x'],
    ['\\displaystyle', 'công thức'],
  ])('%s → %s', (tex, words) => {
    expect(speakMath(tex, 'vi')).toBe(words);
  });
});

describe('other languages', () => {
  it('read the plain-text version', () => {
    expect(speakMath('x^2 + \\sqrt{y}', 'de')).toBe('x² + √y');
  });
});

describe('speakSide', () => {
  it('reads the text with each formula in words', () => {
    expect(speakSide('What is $\\sqrt{2}$ to two places?', 'en')).toBe(
      'What is the square root of 2 to two places?',
    );
    expect(speakSide('Giải $x^2 = 9$.', 'vi')).toBe('Giải x bình phương bằng 9.');
    expect(speakSide('Orders over $50 ship free.', 'en')).toBe('Orders over $50 ship free.');
  });
});
