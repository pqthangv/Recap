// A formula's structure (fractions, roots, powers, symbols…), read from its TeX, for the two
// things that can't use MathJax's picture: the plain-text version (lists, search, the fallback)
// and the spoken version (Read aloud, TalkBack). Covers the TeX that cards use; anything unknown
// is kept as a symbol name, so it's dropped or read as is rather than breaking the rest.

export type Node =
  | { kind: 'char'; value: string }
  | { kind: 'symbol'; name: string }
  | { kind: 'function'; name: string }
  | { kind: 'group'; body: Node[] }
  | { kind: 'frac'; top: Node[]; bottom: Node[] }
  | { kind: 'binom'; n: Node[]; k: Node[] }
  | { kind: 'sqrt'; body: Node[]; index: Node[] | null }
  | { kind: 'scripts'; base: Node | null; sup: Node[] | null; sub: Node[] | null }
  | { kind: 'text'; value: string }
  | { kind: 'accent'; name: string; body: Node[] }
  | { kind: 'rows'; env: string; rows: Node[][][] }
  | { kind: 'chem'; value: string };

type Token = { cmd: string } | { ch: string };

function tokenize(tex: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < tex.length;) {
    const c = tex[i];
    if (c === '\\') {
      const word = /^[a-zA-Z]+/.exec(tex.slice(i + 1))?.[0];
      if (word) {
        // TeX ignores the space after \word, but it's kept here: "\alpha + \beta" reads better
        // as "α + β" in plain text. Arguments skip spaces themselves (\frac {a} {b}).
        tokens.push({ cmd: word });
        i += 1 + word.length;
      } else {
        if (i + 1 < tex.length) tokens.push({ cmd: tex[i + 1] });
        i += 2;
      }
    } else if (/\s/.test(c)) {
      const last = tokens[tokens.length - 1];
      if (!last || !('ch' in last) || last.ch !== ' ') tokens.push({ ch: ' ' });
      i++;
    } else {
      tokens.push({ ch: c });
      i++;
    }
  }
  return tokens;
}

const FRACTIONS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
const BINOMIALS = new Set(['binom', 'dbinom', 'tbinom']);
const TEXTS = new Set(['text', 'textrm', 'textit', 'textbf', 'textsf', 'texttt', 'mbox', 'textup']);
const FONTS = new Set([
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathtt',
  'mathcal',
  'mathfrak',
  'mathscr',
  'boldsymbol',
  'bm',
  'pmb',
  'cancel',
  'bcancel',
  'xcancel',
  'boxed',
]);
const ACCENTS = new Set([
  'bar',
  'overline',
  'hat',
  'widehat',
  'vec',
  'overrightarrow',
  'dot',
  'ddot',
  'tilde',
  'widetilde',
  'underline',
  'check',
  'breve',
  'acute',
  'grave',
]);
const SIZES = new Set([
  'left',
  'right',
  'middle',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'bigl',
  'bigr',
  'Bigl',
  'Bigr',
  'biggl',
  'biggr',
  'Biggl',
  'Biggr',
]);
const SPACES = new Set([',', ';', ':', ' ', 'quad', 'qquad', 'enspace', 'thinspace', 'medspace']);
const NOTHING = new Set([
  '!',
  'negthinspace',
  'displaystyle',
  'textstyle',
  'scriptstyle',
  'limits',
  'nolimits',
  'nonumber',
  'notag',
]);
const ESCAPED = new Set(['{', '}', '%', '$', '&', '#', '_']);
export const FUNCTIONS = new Set(
  (
    'sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp lim limsup ' +
    'liminf max min sup inf det gcd deg dim ker arg Pr mod'
  ).split(' '),
);
const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' };

const isCh = (t: Token | undefined, ch: string) => !!t && 'ch' in t && t.ch === ch;
const isCmd = (t: Token | undefined, cmd: string) => !!t && 'cmd' in t && t.cmd === cmd;

class Reader {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private skipSpaces() {
    while (isCh(this.peek(), ' ')) this.pos++;
  }

  /** Nodes until `stop` matches the next token (which is left unread) or the formula ends. */
  seq(stop: (t: Token) => boolean = () => false): Node[] {
    const out: Node[] = [];
    while (this.pos < this.tokens.length && !stop(this.tokens[this.pos])) this.one(out);
    return out;
  }

  /** A command's argument: a {group} or the next single token. */
  private arg(): Node[] {
    this.skipSpaces();
    const t = this.peek();
    if (!t || isCh(t, '}')) return [];
    if (isCh(t, '{')) return this.group();
    const out: Node[] = [];
    this.one(out);
    return out;
  }

  private group(): Node[] {
    this.pos++; // {
    const body = this.seq((t) => isCh(t, '}'));
    this.pos++; // }
    return body;
  }

  /** An argument as plain characters (\text{…}, \ce{…}, environment names). */
  private rawArg(): string {
    this.skipSpaces();
    const t = this.peek();
    if (!t) return '';
    if (!isCh(t, '{')) {
      this.pos++;
      return 'ch' in t ? t.ch : '';
    }
    this.pos++;
    let depth = 0;
    let text = '';
    for (; this.pos < this.tokens.length; this.pos++) {
      const u = this.tokens[this.pos];
      if (isCh(u, '}') && depth === 0) break;
      if (isCh(u, '{')) depth++;
      if (isCh(u, '}')) depth--;
      text += 'ch' in u ? u.ch : u.cmd.length === 1 ? (u.cmd === ' ' ? ' ' : u.cmd) : `\\${u.cmd} `;
    }
    this.pos++;
    return text;
  }

  private one(out: Node[]) {
    const t = this.tokens[this.pos++];
    if ('ch' in t) {
      if (t.ch === '{') {
        this.pos--;
        out.push({ kind: 'group', body: this.group() });
      } else if (t.ch === '^' || t.ch === '_') this.script(out, t.ch);
      else if (t.ch === '~') out.push({ kind: 'char', value: ' ' });
      else if (t.ch !== '}') out.push({ kind: 'char', value: t.ch });
      return;
    }
    this.command(t.cmd, out);
  }

  private script(out: Node[], which: '^' | '_') {
    while (out.length && out[out.length - 1].kind === 'char' && isSpace(out[out.length - 1])) {
      out.pop();
    }
    const last = out[out.length - 1];
    const key = which === '^' ? 'sup' : 'sub';
    const value = this.arg();
    if (last?.kind === 'scripts' && last[key] === null) {
      last[key] = value;
      return;
    }
    const base = out.pop() ?? null;
    out.push(
      which === '^'
        ? { kind: 'scripts', base, sup: value, sub: null }
        : { kind: 'scripts', base, sup: null, sub: value },
    );
  }

  private command(name: string, out: Node[]) {
    if (FRACTIONS.has(name)) {
      out.push({ kind: 'frac', top: this.arg(), bottom: this.arg() });
    } else if (BINOMIALS.has(name)) {
      out.push({ kind: 'binom', n: this.arg(), k: this.arg() });
    } else if (name === 'sqrt') {
      this.skipSpaces();
      let index: Node[] | null = null;
      if (isCh(this.peek(), '[')) {
        this.pos++;
        index = this.seq((t) => isCh(t, ']'));
        this.pos++;
      }
      out.push({ kind: 'sqrt', body: this.arg(), index });
    } else if (TEXTS.has(name)) {
      out.push({ kind: 'text', value: this.rawArg() });
    } else if (name === 'operatorname') {
      out.push({ kind: 'function', name: this.rawArg().trim() });
    } else if (FONTS.has(name)) {
      out.push({ kind: 'group', body: this.arg() });
    } else if (name === 'mathbb') {
      const letter = this.rawArg().trim();
      out.push({ kind: 'char', value: BLACKBOARD[letter] ?? letter });
    } else if (ACCENTS.has(name)) {
      out.push({ kind: 'accent', name, body: this.arg() });
    } else if (SIZES.has(name)) {
      this.skipSpaces();
      if (isCh(this.peek(), '.')) this.pos++;
      else if (this.peek()) this.one(out);
    } else if (SPACES.has(name)) {
      out.push({ kind: 'char', value: ' ' });
    } else if (NOTHING.has(name)) {
      // drawing hints only
    } else if (ESCAPED.has(name)) {
      out.push({ kind: 'char', value: name });
    } else if (name === '\\') {
      out.push({ kind: 'char', value: ' ' });
    } else if (name === 'begin') {
      this.environment(out);
    } else if (name === 'end' || name === 'label' || name === 'tag' || name === 'color') {
      this.rawArg();
    } else if (name === 'textcolor' || name === 'colorbox') {
      this.rawArg();
      out.push({ kind: 'group', body: this.arg() });
    } else if (name === 'ce' || name === 'pu') {
      out.push({ kind: 'chem', value: this.rawArg() });
    } else if (name === 'not') {
      this.skipSpaces();
      if (isCh(this.peek(), '=')) {
        this.pos++;
        out.push({ kind: 'symbol', name: 'neq' });
      }
    } else if (FUNCTIONS.has(name)) {
      out.push({ kind: 'function', name });
    } else {
      out.push({ kind: 'symbol', name });
    }
  }

  private environment(out: Node[]) {
    const env = this.rawArg().trim();
    if (env === 'array') this.rawArg(); // column layout
    const rows: Node[][][] = [[]];
    const endOfCell = (t: Token) => isCh(t, '&') || isCmd(t, '\\') || isCmd(t, 'end');
    while (this.pos < this.tokens.length) {
      rows[rows.length - 1].push(this.seq(endOfCell));
      const t = this.tokens[this.pos++];
      if (!t || isCmd(t, 'end')) {
        if (t) this.rawArg();
        break;
      }
      if (isCmd(t, '\\')) rows.push([]);
    }
    const kept = rows.filter((row) => row.some((cell) => cell.some((n) => !isSpace(n))));
    out.push({ kind: 'rows', env, rows: kept });
  }
}

export function isSpace(node: Node): boolean {
  return node.kind === 'char' && node.value === ' ';
}

/** The formula's structure. Never throws: odd or broken TeX gives whatever could be read. */
export function readTex(tex: string): Node[] {
  return new Reader(tokenize(tex)).seq();
}
