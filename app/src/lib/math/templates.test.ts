import { en } from '@/lib/i18n/en';

import { findFormulas } from './parse';
import { knowsCommand, texToSvg } from './tex';
import {
  applyButton,
  BASICS,
  formulaProblem,
  insertFormula,
  replaceFormula,
  SYMBOLS,
  type MathButton,
} from './templates';

const find = (label: string): MathButton => [...BASICS, ...SYMBOLS].find((b) => b.label === label)!;
const at = (n: number) => ({ start: n, end: n });

describe('the Math sheet buttons', () => {
  it('each have words for TalkBack and draw once filled in', () => {
    for (const b of [...BASICS, ...SYMBOLS]) {
      expect(en[b.a11y]).toBeTruthy();
      const filled = `x${b.tex.replace(/\{\}/g, '{1}').replace(/\[\]/g, '[3]')}y`;
      expect({ label: b.label, out: texToSvg(filled, false) }).not.toHaveProperty('out.error');
    }
  });

  it('put the cursor in the first empty slot', () => {
    expect(applyButton('', at(0), find('a/b'))).toEqual({ text: '\\frac{}{}', selection: at(6) });
    expect(applyButton('x', at(1), find('x²'))).toEqual({ text: 'x^2', selection: at(3) });
    expect(applyButton('', at(0), find('ⁿ√x'))).toEqual({ text: '\\sqrt[]{}', selection: at(6) });
    expect(applyButton('', at(0), find('( )')).selection).toEqual(at(6));
    expect(applyButton('2r', at(1), find('π'))).toEqual({ text: '2\\pi r', selection: at(5) });
  });

  it('wrap the selected text and move to the next slot', () => {
    expect(applyButton('x+1', { start: 0, end: 3 }, find('√x'))).toEqual({
      text: '\\sqrt{x+1}',
      selection: at(10),
    });
    expect(applyButton('a = b', { start: 4, end: 5 }, find('a/b'))).toEqual({
      text: 'a = \\frac{b}{}',
      selection: at(13),
    });
    expect(applyButton('a+b', { start: 0, end: 3 }, find('( )')).text).toBe('\\left(a+b\\right)');
  });
});

describe('putting a formula into a card side', () => {
  it('goes in at the cursor as $…$, spaced from words', () => {
    expect(insertFormula('', at(0), 'x^2')).toEqual({ text: '$x^2$', selection: at(5) });
    expect(insertFormula('Solve ', at(6), 'x^2=9')).toEqual({
      text: 'Solve $x^2=9$',
      selection: at(13),
    });
    expect(insertFormula('Solvefor x', at(5), 'y').text).toBe('Solve $y$ for x');
    expect(insertFormula('Is ?', at(3), '\\sqrt{2}').text).toBe('Is $\\sqrt{2}$?');
    expect(insertFormula('pick old', { start: 5, end: 8 }, 'n').text).toBe('pick $n$');
  });

  it('replaces an edited formula, keeping its delimiters', () => {
    const text = 'Area: \\(\\pi r^2\\) and $x$.';
    const [anki, dollar] = findFormulas(text);
    expect(replaceFormula(text, anki, '\\pi d')).toBe('Area: \\(\\pi d\\) and $x$.');
    expect(replaceFormula(text, dollar, 'y^2')).toBe('Area: \\(\\pi r^2\\) and $y^2$.');
    expect(replaceFormula('a $x$ b', findFormulas('a $x$ b')[0], '  ')).toBe('a b');
  });
});

describe('formulaProblem', () => {
  it('names what is wrong in plain words', () => {
    const problem = (tex: string) => {
      const out = texToSvg(tex, false);
      return 'error' in out ? formulaProblem(tex, knowsCommand) : null;
    };
    expect(problem('\\frac{1}{')).toEqual({ key: 'math.errorBraces' });
    expect(problem('x}')).toEqual({ key: 'math.errorBraces' });
    expect(problem('\\foo x')).toEqual({ key: 'math.errorUnknown', command: '\\foo' });
    expect(problem('\\frac{1}')).toEqual({ key: 'math.error' });
    expect(problem('x^^2')).toEqual({ key: 'math.error' });
    expect(problem('\\{a\\}')).toBeNull(); // drawn braces are fine
  });
});
