// The Math sheet's buttons and the editing they do, so nobody has to type `$` or `\frac`.
import type { StringKey } from '@/lib/i18n';

import type { FormulaAt } from './parse';

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };

/** `label` is what the button shows (the same in every language); `a11y` is what TalkBack says. */
export type MathButton = { label: string; a11y: StringKey; tex: string };

const button = (label: string, a11y: StringKey, tex: string): MathButton => ({ label, a11y, tex });

/** First row: the shapes and operators people use most. */
export const BASICS: readonly MathButton[] = [
  button('a/b', 'math.btnFraction', '\\frac{}{}'),
  button('x²', 'math.btnSquared', '^2'),
  button('xⁿ', 'math.btnPower', '^{}'),
  button('x₁', 'math.btnIndex', '_{}'),
  button('√x', 'math.btnSqrt', '\\sqrt{}'),
  button('ⁿ√x', 'math.btnRoot', '\\sqrt[]{}'),
  button('( )', 'math.btnBrackets', '\\left(\\right)'),
  button('±', 'math.plusMinus', '\\pm '),
  button('×', 'math.times', '\\times '),
  button('÷', 'math.dividedBy', '\\div '),
  button('≤', 'math.lessEq', '\\le '),
  button('≥', 'math.greaterEq', '\\ge '),
  button('≠', 'math.notEqual', '\\ne '),
  button('≈', 'math.approx', '\\approx '),
  button('°', 'math.btnDegrees', '^\\circ '),
  button('∞', 'math.infinity', '\\infty '),
  button('→', 'math.goesTo', '\\to '),
];

/** Second row: calculus, functions and Greek letters. */
export const SYMBOLS: readonly MathButton[] = [
  button('π', 'math.pi', '\\pi '),
  button('∫', 'math.btnIntegral', '\\int_{}^{} '),
  button('∑', 'math.btnSum', '\\sum_{}^{} '),
  button('lim', 'math.btnLimit', '\\lim_{} '),
  button('sin', 'math.sin', '\\sin '),
  button('cos', 'math.cos', '\\cos '),
  button('tan', 'math.tan', '\\tan '),
  button('log', 'math.log', '\\log '),
  button('ln', 'math.ln', '\\ln '),
  ...(
    [
      ['α', 'alpha'],
      ['β', 'beta'],
      ['γ', 'gamma'],
      ['δ', 'delta'],
      ['ε', 'epsilon'],
      ['θ', 'theta'],
      ['λ', 'lambda'],
      ['μ', 'mu'],
      ['ρ', 'rho'],
      ['σ', 'sigma'],
      ['φ', 'phi'],
      ['ω', 'omega'],
      ['Δ', 'Delta'],
      ['Σ', 'Sigma'],
      ['Ω', 'Omega'],
    ] as const
  ).map(([label, name]) => button(label, `math.${name.toLowerCase()}` as StringKey, `\\${name} `)),
];

/** Where the cursor goes in a piece: its first empty `{}` or `[]`, else inside `\left(`…. */
function slotIn(tex: string, from = 0): number {
  const slots = [tex.indexOf('{}', from), tex.indexOf('[]', from)].filter((i) => i >= 0);
  if (slots.length) return Math.min(...slots) + 1;
  if (tex.startsWith('\\left(', from)) return from + '\\left('.length;
  return -1;
}

/**
 * A button pressed in the formula box: its piece goes in at the cursor, with the cursor in its
 * first empty slot. Selected text goes into that slot instead (select `x+1`, tap √ →
 * `\sqrt{x+1}`), and the cursor moves to the next empty slot, or after the piece.
 */
export function applyButton(text: string, selection: Selection, { tex }: MathButton): Edit {
  const { start, end } = selection;
  const selected = text.slice(start, end);
  const slot = slotIn(tex);
  let piece = tex;
  let cursor = slot >= 0 ? slot : tex.length;
  if (selected && slot >= 0) {
    piece = tex.slice(0, slot) + selected + tex.slice(slot);
    const next = slotIn(piece, slot + selected.length);
    cursor = next >= 0 ? next : piece.length;
  } else if (slot < 0 && start === end && /\S/.test(text[start] ?? '') && !piece.endsWith(' ')) {
    piece += ' ';
  }
  return {
    text: text.slice(0, start) + piece + text.slice(end),
    selection: { start: start + cursor, end: start + cursor },
  };
}

/**
 * A finished formula put into a card side at the cursor, as `$…$`, with a space on each side
 * where it would otherwise touch a word. The cursor ends after it.
 */
export function insertFormula(text: string, selection: Selection, tex: string): Edit {
  const { start, end } = selection;
  const before = start > 0 && /\S/.test(text[start - 1]) ? ' ' : '';
  const after = end < text.length && /[\p{L}\p{N}$]/u.test(text[end]) ? ' ' : '';
  const piece = `${before}$${tex}$${after}`;
  const at = start + before.length + tex.length + 2;
  return {
    text: text.slice(0, start) + piece + text.slice(end),
    selection: { start: at, end: at },
  };
}

/** An edited formula put back where it was, keeping its delimiters; an empty one is removed. */
export function replaceFormula(text: string, formula: FormulaAt, tex: string): string {
  if (!tex.trim()) {
    const before = text.slice(0, formula.start);
    const after = text.slice(formula.end);
    // Don't leave two spaces where the formula was.
    return / $/.test(before) && /^ /.test(after) ? before + after.slice(1) : before + after;
  }
  const [from, to] = formula.inner;
  return text.slice(0, from) + tex + text.slice(to);
}

/** True when every `{` has its `}` (`\{` and `\}` are braces drawn, not groups). */
function bracesMatch(tex: string): boolean {
  let depth = 0;
  for (let i = 0; i < tex.length; i++) {
    if (tex[i] === '\\') i++;
    else if (tex[i] === '{') depth++;
    else if (tex[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/** What the sheet says about a formula MathJax couldn't draw; `knows` is tex.ts's knowsCommand. */
export function formulaProblem(
  tex: string,
  knows: (name: string) => boolean,
): { key: StringKey; command?: string } {
  if (!bracesMatch(tex)) return { key: 'math.errorBraces' };
  const unknown = [...tex.matchAll(/\\([a-zA-Z]+)/g)].find((m) => !knows(m[1]));
  if (unknown) return { key: 'math.errorUnknown', command: `\\${unknown[1]}` };
  return { key: 'math.error' };
}
