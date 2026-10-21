import { texToSvg, type MathPicture } from './tex';

const picture = (formula: string, display = false): MathPicture => {
  const out = texToSvg(formula, display);
  if ('error' in out) throw new Error(out.error);
  return out;
};

describe('texToSvg', () => {
  it('draws a formula as a self-contained SVG sized in ex', () => {
    const out = picture('\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', true);
    const tag = /^<svg[^>]*>/.exec(out.svg)?.[0] ?? '';
    expect(tag).toContain('viewBox=');
    expect(tag).not.toMatch(/\s(width|height|style)=/);
    expect(out.svg).toContain('currentColor');
    expect(out.svg).not.toContain('<use');
    expect(out.width).toBeGreaterThan(5);
    expect(out.height).toBeGreaterThan(out.depth);
    expect(out.depth).toBeGreaterThan(0);
  });

  it('reports how far an inline formula reaches below the baseline', () => {
    expect(picture('x').depth).toBeLessThan(0.1);
    expect(picture('\\sqrt{2}').depth).toBeGreaterThan(0);
    expect(picture('x_1^2').depth).toBeGreaterThan(0);
  });

  it('draws chemistry, matrices and the ams environments', () => {
    picture('\\ce{2H2 + O2 -> 2H2O}');
    picture('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', true);
    picture('\\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}', true);
    picture('\\cancel{x} \\boldsymbol{v} \\color{red}{y}');
  });

  it('returns an error instead of a picture for a broken formula', () => {
    expect(texToSvg('\\frac{1}{', false)).toEqual({ error: expect.any(String) });
    expect(texToSvg('\\notacommand', false)).toEqual({ error: expect.any(String) });
  });
});
