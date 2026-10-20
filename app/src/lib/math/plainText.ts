// Formulas as readable plain text: "x² + √(x+1) ≤ a/b". Shown where pictures would be slow or
// can't be drawn: the deck's card list, search, import previews, and while MathJax loads.
import { isSpace, readTex, type Node } from './nodes';
import { isMath, splitMath } from './parse';

/** Symbols by command name (\alpha → α). Unknown commands are left out. */
export const SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  pm: '±',
  mp: '∓',
  times: '×',
  div: '÷',
  cdot: '·',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '•',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  ll: '≪',
  gg: '≫',
  approx: '≈',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  equiv: '≡',
  propto: '∝',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  gets: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  implies: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  iff: '⇔',
  mapsto: '↦',
  longrightarrow: '⟶',
  uparrow: '↑',
  downarrow: '↓',
  rightleftharpoons: '⇌',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  emptyset: '∅',
  varnothing: '∅',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  neg: '¬',
  lnot: '¬',
  land: '∧',
  wedge: '∧',
  lor: '∨',
  vee: '∨',
  oplus: '⊕',
  otimes: '⊗',
  partial: '∂',
  nabla: '∇',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  bigcup: '⋃',
  bigcap: '⋂',
  angle: '∠',
  measuredangle: '∡',
  triangle: '△',
  perp: '⊥',
  parallel: '∥',
  mid: '|',
  vert: '|',
  Vert: '‖',
  '|': '‖',
  langle: '⟨',
  rangle: '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  lbrace: '{',
  rbrace: '}',
  ldots: '…',
  dots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
  prime: '′',
  degree: '°',
  hbar: 'ℏ',
  ell: 'ℓ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  therefore: '∴',
  because: '∵',
  checkmark: '✓',
  backslash: '\\',
};

const SUPERSCRIPT: Record<string, string> = Object.fromEntries(
  [...'0123456789+-−=()abcdefghijklmnoprstuvwxyz'].map((c, i) => [
    c,
    [...'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ'][i],
  ]),
);
const SUBSCRIPT: Record<string, string> = Object.fromEntries(
  [...'0123456789+-−=()aehijklmnoprstuvx'].map((c, i) => [
    c,
    [...'₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'][i],
  ]),
);
const COMBINING: Record<string, string> = {
  bar: '̄',
  overline: '̅',
  hat: '̂',
  widehat: '̂',
  vec: '⃗',
  overrightarrow: '⃗',
  dot: '̇',
  ddot: '̈',
  tilde: '̃',
  widetilde: '̃',
  underline: '̲',
  check: '̌',
  breve: '̆',
  acute: '́',
  grave: '̀',
};
const BRACKETS: Record<string, [string, string]> = {
  pmatrix: ['(', ')'],
  bmatrix: ['[', ']'],
  Bmatrix: ['{', '}'],
  vmatrix: ['|', '|'],
  Vmatrix: ['‖', '‖'],
};
const OPERATOR = /[\s+\-−=×÷·/±∓<>≤≥≠≈→]/;

/** Wraps compound text in brackets, so "(x+1)/2" isn't read as "x+1/2". */
const wrap = (text: string) => (OPERATOR.test(text) ? `(${text})` : text);

function scriptText(nodes: Node[], map: Record<string, string>, mark: string): string {
  if (nodes.length === 1 && nodes[0].kind === 'symbol') {
    if (nodes[0].name === 'circ' || nodes[0].name === 'degree') return '°';
    if (nodes[0].name === 'prime') return '′';
  }
  const text = render(nodes).replace(/\s+/g, '');
  if (text === "'" || text === '′') return '′';
  const mapped = [...text].map((c) => map[c]);
  if (text && mapped.every(Boolean)) return mapped.join('');
  return `${mark}${[...text].length === 1 ? text : `(${text})`}`;
}

function chem(value: string): string {
  return value
    .replace(/<=>|<->/g, '⇌')
    .replace(/->/g, '→')
    .replace(/<-/g, '←')
    .replace(/\^\{?([0-9]*[+-])\}?/g, (_, charge: string) =>
      [...charge].map((c) => SUPERSCRIPT[c] ?? c).join(''),
    )
    .replace(
      /([A-Za-z)\]])(\d+)/g,
      (_, before: string, digits: string) => before + [...digits].map((d) => SUBSCRIPT[d]).join(''),
    );
}

function render(nodes: Node[]): string {
  let out = '';
  nodes.forEach((node, i) => {
    const next = nodes[i + 1];
    switch (node.kind) {
      case 'char':
        out += node.value === '-' ? '−' : node.value === "'" ? '′' : node.value;
        break;
      case 'symbol':
        out += SYMBOLS[node.name] ?? '';
        break;
      case 'function':
        out += node.name;
        if (next && !isSpace(next) && !(next.kind === 'char' && /[(^_]/.test(next.value))) {
          out += ' ';
        }
        break;
      case 'group':
        out += render(node.body);
        break;
      case 'frac':
        out += `${wrap(render(node.top).trim())}/${wrap(render(node.bottom).trim())}`;
        break;
      case 'binom':
        out += `C(${render(node.n).trim()}, ${render(node.k).trim()})`;
        break;
      case 'sqrt': {
        const body = render(node.body).trim();
        const index = node.index ? scriptText(node.index, SUPERSCRIPT, '') : '';
        out += `${index}√${wrap(body)}`;
        break;
      }
      case 'scripts':
        out += node.base ? render([node.base]) : '';
        if (node.sub) out += scriptText(node.sub, SUBSCRIPT, '_');
        if (node.sup) out += scriptText(node.sup, SUPERSCRIPT, '^');
        break;
      case 'text':
        out += node.value;
        break;
      case 'accent': {
        const body = render(node.body);
        out += body + (body.trim() ? COMBINING[node.name] : '');
        break;
      }
      case 'rows': {
        const [open, close] = BRACKETS[node.env] ?? ['', ''];
        const cells = /matrix|cases|array/.test(node.env) ? ', ' : '';
        const rows = node.rows.map((row) => row.map((cell) => render(cell).trim()).join(cells));
        out += open + rows.join('; ') + close;
        break;
      }
      case 'chem':
        out += chem(node.value);
        break;
    }
  });
  return out;
}

/** One formula as plain text. */
export function mathToText(tex: string): string {
  return render(readTex(tex))
    .replace(/\s+/g, ' ')
    .replace(/([([{⟨]) /g, '$1')
    .replace(/ ([)\]}⟩])/g, '$1')
    .trim();
}

/** A card side with every formula as plain text (and `\$` as a dollar sign). */
export function sideToText(text: string): string {
  return splitMath(text)
    .map((part) => (isMath(part) ? mathToText(part.tex) : part.text))
    .join('');
}
