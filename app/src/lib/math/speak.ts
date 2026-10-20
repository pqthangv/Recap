// Formulas in words, for Read aloud and TalkBack: "x squared", "a over b", "x bình phương", "a trên
// b". Spoken in the card side's language (not the app's). English and Vietnamese have their own
// words (math.* in en.ts / vi.ts); other languages read the plain-text version (x², √x), which
// their voices mostly know.
import { tIn, type Language, type StringKey } from '@/lib/i18n';
import { detectLanguage, type CardLanguage } from '@/lib/language';

import { isSpace, readTex, type Node } from './nodes';
import { hasMath, isMath, splitMath } from './parse';
import { mathToText, sideToText, SYMBOLS } from './plainText';

const GREEK = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'chi',
  'psi',
  'omega',
] as const;

/** Symbols with their own words; the rest are read as their character (∂, ⊕ …). */
const SYMBOL_WORDS: Record<string, StringKey> = {
  ...Object.fromEntries(
    GREEK.flatMap((name) => {
      const key = `math.${name}` as StringKey;
      const capital = name[0].toUpperCase() + name.slice(1);
      return [
        [name, key],
        [capital, key],
        [`var${name}`, key],
      ];
    }),
  ),
  pm: 'math.plusMinus',
  times: 'math.times',
  cdot: 'math.times',
  ast: 'math.times',
  div: 'math.dividedBy',
  le: 'math.lessEq',
  leq: 'math.lessEq',
  ge: 'math.greaterEq',
  geq: 'math.greaterEq',
  ne: 'math.notEqual',
  neq: 'math.notEqual',
  approx: 'math.approx',
  simeq: 'math.approx',
  infty: 'math.infinity',
  to: 'math.goesTo',
  rightarrow: 'math.goesTo',
  longrightarrow: 'math.goesTo',
  rightleftharpoons: 'math.yields',
  Rightarrow: 'math.implies',
  implies: 'math.implies',
  Leftrightarrow: 'math.iff',
  iff: 'math.iff',
  in: 'math.in',
  notin: 'math.notIn',
  subset: 'math.subset',
  subseteq: 'math.subset',
  cup: 'math.union',
  cap: 'math.intersection',
  emptyset: 'math.emptySet',
  varnothing: 'math.emptySet',
  forall: 'math.forAll',
  exists: 'math.exists',
  perp: 'math.perpendicular',
  parallel: 'math.parallel',
  angle: 'math.angle',
  measuredangle: 'math.angle',
  triangle: 'math.triangle',
};

const CHAR_WORDS: Record<string, StringKey> = {
  '+': 'math.plus',
  '-': 'math.minus',
  '−': 'math.minus',
  '=': 'math.equals',
  '<': 'math.less',
  '>': 'math.greater',
  '*': 'math.times',
  '×': 'math.times',
  '·': 'math.times',
  '/': 'math.dividedBy',
  '÷': 'math.dividedBy',
  '±': 'math.plusMinus',
  '≤': 'math.lessEq',
  '≥': 'math.greaterEq',
  '≠': 'math.notEqual',
  '≈': 'math.approx',
  '∞': 'math.infinity',
  '→': 'math.goesTo',
  '!': 'math.factorial',
};

const FUNCTION_WORDS: Record<string, StringKey> = {
  sin: 'math.sin',
  cos: 'math.cos',
  tan: 'math.tan',
  log: 'math.log',
  ln: 'math.ln',
  lim: 'math.limit',
};

const BIG = {
  sum: ['math.sumFromTo', 'math.sum'],
  prod: ['math.productFromTo', 'math.product'],
  int: ['math.integralFromTo', 'math.integral'],
  oint: ['math.integralFromTo', 'math.integral'],
} as const satisfies Record<string, [StringKey, StringKey]>;

const MATRICES = /matrix/;

/** The letters usually used as function names: f(x), g(t), h(x), P(A). */
const FUNCTION_LETTERS = /^[fghFGHP]$/;

/** True when the "(" at `i` follows a function name: f, f', f'', f^{\prime}, f^2. */
function isFunctionName(nodes: Node[], i: number): boolean {
  let j = i - 1;
  while (j >= 0 && nodes[j].kind === 'char' && (nodes[j] as { value: string }).value === "'") j--;
  const before = nodes[j];
  const name = before?.kind === 'scripts' && !before.sub ? before.base : before;
  return name?.kind === 'char' && FUNCTION_LETTERS.test(name.value);
}

class Speaker {
  constructor(private readonly lang: Language) {}

  private t(key: StringKey, params?: Record<string, string>) {
    return tIn(this.lang, key, params);
  }

  /** The nodes as words, joined. */
  say(nodes: Node[]): string {
    const words: string[] = [];
    let number = '';
    const endNumber = () => {
      if (number) words.push(number);
      number = '';
    };
    nodes.forEach((node, i) => {
      if (node.kind === 'char' && /[0-9]/.test(node.value)) {
        number += node.value;
        return;
      }
      // TeX puts a power on the last digit only; it's said for the whole number ("90 degrees").
      if (node.kind === 'scripts' && number && node.base?.kind === 'char') {
        if (/[0-9]/.test(node.base.value)) {
          const base = { kind: 'char' as const, value: number + node.base.value };
          number = '';
          words.push(this.scripts({ ...node, base }));
          return;
        }
      }
      // A decimal point inside a number ("3.14"); a full stop elsewhere is dropped.
      const next = nodes[i + 1];
      if (node.kind === 'char' && node.value === '.' && number && next?.kind === 'char') {
        if (/[0-9]/.test(next.value)) {
          number += '.';
          return;
        }
      }
      endNumber();
      // A function of something: "f(x)" is "f of x", also "f'(x)" ("f prime of x").
      if (node.kind === 'char' && node.value === '(' && isFunctionName(nodes, i)) {
        const of = this.t('math.of');
        if (of) words.push(of);
        return;
      }
      const spoken = this.node(node);
      if (spoken) words.push(spoken);
    });
    endNumber();
    return words.join(' ');
  }

  /** Several words need a pause after them, so "x plus 1, squared" isn't "x plus 1 squared". */
  private paused(words: string): string {
    return words.includes(' ') ? `${words},` : words;
  }

  private node(node: Node): string {
    switch (node.kind) {
      case 'char': {
        if (isSpace(node) || /[()[\]{}|.;:]/.test(node.value)) return '';
        if (node.value === ',') return ',';
        if (node.value === "'") return this.t('math.prime', { x: '' }).trim();
        const key = CHAR_WORDS[node.value];
        return key ? this.t(key) : node.value;
      }
      case 'symbol': {
        const key = SYMBOL_WORDS[node.name];
        if (key) return this.t(key);
        if (node.name in BIG) return this.t(BIG[node.name as keyof typeof BIG][1]);
        if (node.name === 'prime') return this.t('math.prime', { x: '' }).trim();
        const symbol = SYMBOLS[node.name] ?? '';
        return CHAR_WORDS[symbol] ? this.t(CHAR_WORDS[symbol]) : symbol;
      }
      case 'function': {
        const key = FUNCTION_WORDS[node.name];
        return key ? this.t(key) : node.name;
      }
      case 'group':
        return this.say(node.body);
      case 'frac': {
        const top = this.say(node.top);
        const bottom = this.say(node.bottom);
        const simple = !top.includes(' ') && !bottom.includes(' ');
        return this.t(simple ? 'math.over' : 'math.fraction', { top, bottom });
      }
      case 'binom':
        return this.t('math.choose', { n: this.say(node.n), k: this.say(node.k) });
      case 'sqrt': {
        const x = this.paused(this.say(node.body));
        const n = node.index ? this.say(node.index) : '2';
        if (n === '2') return this.t('math.sqrt', { x });
        if (n === '3') return this.t('math.cubeRoot', { x });
        return this.t('math.root', { n, x });
      }
      case 'scripts':
        return this.scripts(node);
      case 'text':
        return node.value.trim();
      case 'accent': {
        const x = this.say(node.body);
        if (node.name === 'bar' || node.name === 'overline') return this.t('math.bar', { x });
        if (node.name === 'vec' || node.name === 'overrightarrow') {
          return this.t('math.vector', { x });
        }
        if (node.name === 'hat' || node.name === 'widehat') return this.t('math.hat', { x });
        return x;
      }
      case 'rows': {
        const cells = MATRICES.test(node.env) ? ', ' : ' ';
        const rows = node.rows
          .map((row) => row.map((cell) => this.say(cell)).join(cells))
          .join('; ');
        return MATRICES.test(node.env) ? this.t('math.matrix', { rows }) : rows;
      }
      case 'chem':
        return this.chem(node.value);
    }
  }

  private scripts(node: Extract<Node, { kind: 'scripts' }>): string {
    const { base, sub, sup } = node;
    const from = sub ? this.say(sub) : '';
    const to = sup ? this.say(sup) : '';
    if (base?.kind === 'symbol' && base.name in BIG) {
      const [both, plain] = BIG[base.name as keyof typeof BIG];
      if (sub && sup) return this.t(both, { from, to });
      if (sub && base.name === 'sum') return this.t('math.sumOver', { from });
      return this.t(plain);
    }
    if (base?.kind === 'function' && base.name === 'lim') {
      return sub ? this.t('math.limitAs', { x: from }) : this.t('math.limit');
    }
    // A power on a closing bracket belongs to all of it: "(a + b)²" → "a plus b, squared".
    const closing = base?.kind === 'char' && /[)\]]/.test(base.value);
    let x = closing ? ',' : base ? this.say([base]) : '';
    if (sub) x = this.t('math.sub', { x, i: from });
    if (sup) x = this.power(x, sup, to);
    return x.replace(/\s+,/g, ',').trim();
  }

  private power(x: string, sup: Node[], n: string): string {
    const only = sup.length === 1 ? sup[0] : null;
    if (only?.kind === 'symbol' && (only.name === 'circ' || only.name === 'degree')) {
      return this.t('math.degrees', { x });
    }
    const prime =
      (only?.kind === 'symbol' && only.name === 'prime') ||
      (only?.kind === 'char' && only.value === "'");
    if (prime) return this.t('math.prime', { x });
    if (n === '2') return this.t('math.squared', { x });
    if (n === '3') return this.t('math.cubed', { x });
    return this.t('math.power', { x, n: this.paused(n) });
  }

  /** Chemistry, element by element: "2 H 2 plus O 2 gives 2 H 2 O". */
  private chem(value: string): string {
    const parts = value.replace(/<=>|<->|->/g, ' → ').match(/→|[A-Z][a-z]?|[a-z]|\d+|\+/g) ?? [];
    return parts
      .map((part) =>
        part === '→' ? this.t('math.yields') : part === '+' ? this.t('math.plus') : part,
      )
      .join(' ');
  }
}

const tidy = (words: string) =>
  words.replace(/\s+/g, ' ').replace(/ ,/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '').trim();

const spoken = (lang: CardLanguage): Language | null =>
  lang === 'en' || lang === 'vi' ? lang : null;

/** One formula in words, in `lang`. */
export function speakMath(tex: string, lang: CardLanguage): string {
  const words = spoken(lang);
  if (!words) return mathToText(tex);
  return tidy(new Speaker(words).say(readTex(tex))) || tIn(words, 'math.formula');
}

/**
 * A card side as it's read aloud: the text, with each formula in words. `lang`: the side's
 * language (the deck's setting), or null to guess it from the text without its formulas.
 */
export function speakSide(text: string, lang: CardLanguage | null): string {
  if (!hasMath(text)) return text;
  const language = lang ?? detectLanguage(sideToText(text));
  return splitMath(text)
    .map((part) => (isMath(part) ? ` ${speakMath(part.tex, language)} ` : part.text))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([,.?!:;])/g, '$1')
    .trim();
}
