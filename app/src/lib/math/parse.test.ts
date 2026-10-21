import { hasMath, splitMath } from './parse';

describe('splitMath', () => {
  it('finds formulas in a sentence', () => {
    expect(splitMath('What is $\\sqrt{2}$ to two places?')).toEqual([
      { text: 'What is ' },
      { tex: '\\sqrt{2}', display: false },
      { text: ' to two places?' },
    ]);
    expect(splitMath('$a$ and $b$')).toEqual([
      { tex: 'a', display: false },
      { text: ' and ' },
      { tex: 'b', display: false },
    ]);
  });

  it('draws a formula alone on its line on its own', () => {
    expect(splitMath('$x^2$')).toEqual([{ tex: 'x^2', display: true }]);
    expect(splitMath('Solve:\n  $x^2 = 9$  \nfor x.')).toEqual([
      { text: 'Solve:\n  ' },
      { tex: 'x^2 = 9', display: true },
      { text: '  \nfor x.' },
    ]);
    expect(splitMath('$$\\frac{a}{b}$$ is a fraction')[0]).toEqual({
      tex: '\\frac{a}{b}',
      display: true,
    });
  });

  it("reads Anki's \\( \\) and \\[ \\] as math", () => {
    expect(splitMath('Area: \\(\\pi r^2\\)')).toEqual([
      { text: 'Area: ' },
      { tex: '\\pi r^2', display: false },
    ]);
    expect(splitMath('\\[ E = mc^2 \\]')).toEqual([{ tex: 'E = mc^2', display: true }]);
  });

  it('keeps prices as text', () => {
    for (const text of [
      'Delivery is free for orders over $50.',
      'between $5 and $10',
      'from $5 to $10 or $20',
      'about $5-$10 a day',
      'US$5 or US$10',
      'price: $5/$10',
      'It costs $ 5 and $ 6.',
      'a lone $ sign',
    ]) {
      expect({ text, math: hasMath(text) }).toEqual({ text, math: false });
    }
  });

  it('finds a formula after a price on the same line', () => {
    expect(splitMath('$5 and I have $x$ dollars')).toEqual([
      { text: '$5 and I have ' },
      { tex: 'x', display: false },
      { text: ' dollars' },
    ]);
    expect(splitMath('Pay $10, then solve $y=2$.')).toEqual([
      { text: 'Pay $10, then solve ' },
      { tex: 'y=2', display: false },
      { text: '.' },
    ]);
  });

  it('treats \\$ as a dollar sign, also next to a formula', () => {
    expect(splitMath('\\$5 or $x$')).toEqual([{ text: '$5 or ' }, { tex: 'x', display: false }]);
    expect(splitMath('cost: \\$3\\$')).toEqual([{ text: 'cost: $3$' }]);
    expect(splitMath('$\\$5 + x$')).toEqual([{ tex: '\\$5 + x', display: true }]);
  });

  it("doesn't open a formula across a line or blank line", () => {
    expect(hasMath('$a\nb$')).toBe(false);
    expect(hasMath('$$a\n\nb$$')).toBe(false);
    expect(splitMath('$$\na + b\n$$')).toEqual([{ tex: 'a + b', display: true }]);
    expect(hasMath('$$  $$')).toBe(false);
    expect(hasMath('\\( no end')).toBe(false);
  });

  it('keeps text without math as one part', () => {
    expect(splitMath('plain text')).toEqual([{ text: 'plain text' }]);
    expect(splitMath('')).toEqual([]);
    expect(hasMath('plain text')).toBe(false);
  });
});
