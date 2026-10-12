import { colors, deckColors } from './theme';

// WCAG 2.x contrast ratio between two #RRGGBB colors.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme contrast (WCAG AA)', () => {
  const backgrounds = { background: colors.background, surface: colors.surface, tint: colors.tint };

  it.each(Object.entries(backgrounds))(
    'text, muted and accent text are readable on %s',
    (_, bg) => {
      for (const fg of [colors.text, colors.muted, colors.primary, colors.danger]) {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('button text is readable on the accent', () => {
    expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('the streak flame stands out on its tile', () => {
    expect(contrast(colors.flame, colors.tint)).toBeGreaterThanOrEqual(3);
  });

  it('the chart colors stand out on white', () => {
    expect(contrast(colors.chartNew, colors.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.primary, colors.background)).toBeGreaterThanOrEqual(3);
  });

  it('deck color dots stand out on white', () => {
    for (const c of deckColors) expect(contrast(c, colors.background)).toBeGreaterThanOrEqual(3);
  });
});
