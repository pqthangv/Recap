import { drawMath, loadMath } from './load';

describe('drawMath', () => {
  it('draws nothing until MathJax has loaded, then keeps each drawing', async () => {
    expect(drawMath('x^2', false)).toBeNull();
    await loadMath();
    const first = drawMath('x^2', false);
    expect(first).toEqual(expect.objectContaining({ svg: expect.stringContaining('<svg') }));
    expect(drawMath('x^2', false)).toBe(first);
    expect(drawMath('x^2', true)).not.toBe(first);
  });

  it('forgets the least recently used drawings past 300', async () => {
    await loadMath();
    const kept = drawMath('a+b', false);
    for (let i = 0; i < 299; i++) drawMath(`y_{${i}}`, false);
    expect(drawMath('a+b', false)).toBe(kept); // used again: now the newest
    for (let i = 0; i < 300; i++) drawMath(`z_{${i}}`, false);
    expect(drawMath('a+b', false)).not.toBe(kept);
  });
});
