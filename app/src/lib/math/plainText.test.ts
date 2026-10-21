import { mathToText, sideToText } from './plainText';

describe('mathToText', () => {
  it.each([
    ['x^2 + y^2 = r^2', 'x² + y² = r²'],
    ['x^{10}', 'x¹⁰'],
    ['e^{i\\pi} + 1 = 0', 'e^(iπ) + 1 = 0'], // no superscript π
    ['x_1, x_2, \\ldots, x_n', 'x₁, x₂, …, xₙ'],
    ['a_{ij}', 'aᵢⱼ'],
    ['x_1^2', 'x₁²'],
    ['\\frac{1}{2}', '1/2'],
    ['\\frac{x+1}{2}', '(x+1)/2'],
    ['\\dfrac{a}{b+c}', 'a/(b+c)'],
    ['\\frac12', '1/2'],
    ['x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'x = (−b ± √(b²−4ac))/2a'],
    ['\\sqrt{2}', '√2'],
    ['\\sqrt[3]{x}', '³√x'],
    ['\\alpha + \\beta \\le \\gamma', 'α + β ≤ γ'],
    ['\\pi r^2', 'π r²'],
    ['\\pi{r^2}', 'πr²'],
    ['90^\\circ', '90°'],
    ["f'(x)", 'f′(x)'],
    ['\\sin x + \\cos(x)', 'sin x + cos(x)'],
    ['\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1', 'lim_(x→0) (sin x)/x = 1'],
    ['\\sum_{i=1}^n i', '∑ᵢ₌₁ⁿ i'],
    ['\\int_0^1 x^2\\,dx', '∫₀¹ x² dx'],
    ['\\left( \\frac{a}{b} \\right)^2', '(a/b)²'],
    ['\\text{speed} = \\frac{\\text{distance}}{\\text{time}}', 'speed = distance/time'],
    ['\\mathbb{R}', 'ℝ'],
    ['\\vec{v}', 'v⃗'],
    ['\\bar{x}', 'x̄'],
    ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '(a, b; c, d)'],
    ['\\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}', '1, x > 0; 0, x ≤ 0'],
    ['\\ce{2H2 + O2 -> 2H2O}', '2H₂ + O₂ → 2H₂O'],
    ['\\ce{SO4^2-}', 'SO₄²⁻'],
    ['\\binom{n}{k}', 'C(n, k)'],
    ['a \\ne b', 'a ≠ b'],
    ['a \\not= b', 'a ≠ b'],
    ['\\color{red}{x} + \\cancel{y}', 'x + y'],
    ['\\unknowncommand x', 'x'],
  ])('%s → %s', (tex, text) => {
    expect(mathToText(tex)).toBe(text);
  });

  it('never throws on broken TeX', () => {
    for (const tex of ['\\frac{1}{', '}}x{{', '^', '_{', '\\sqrt[', '\\begin{pmatrix} a &', '\\']) {
      expect(typeof mathToText(tex)).toBe('string');
    }
  });
});

describe('sideToText', () => {
  it('replaces each formula and keeps the text around it', () => {
    expect(sideToText('What is $\\sqrt{2}$ to two places?')).toBe('What is √2 to two places?');
    expect(sideToText('Area: \\(\\pi r^2\\)')).toBe('Area: π r²');
    expect(sideToText('Costs \\$5 or $5.')).toBe('Costs $5 or $5.');
    expect(sideToText('no math')).toBe('no math');
  });
});
