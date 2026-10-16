import { deckColors, maxContentWidth, palettes, shownDeckColor, sideSpace } from './theme';

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

describe.each(['light', 'dark'] as const)('theme contrast, %s look (WCAG AA)', (scheme) => {
  const colors = palettes[scheme];
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

  it('the chart colors stand out on the page', () => {
    expect(contrast(colors.chartNew, colors.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.primary, colors.background)).toBeGreaterThanOrEqual(3);
  });

  it('deck color dots stand out on the page', () => {
    for (const c of deckColors) {
      expect(contrast(shownDeckColor(c, scheme), colors.background)).toBeGreaterThanOrEqual(3);
    }
  });

  it('has every color the other look has', () => {
    expect(Object.keys(colors).sort()).toEqual(Object.keys(palettes.light).sort());
  });
});

describe('deck colors in the dark look', () => {
  it('stand out on every dark surface, not just the page', () => {
    const { background, surface, tint } = palettes.dark;
    for (const c of deckColors) {
      for (const bg of [background, surface, tint]) {
        expect(contrast(shownDeckColor(c, 'dark'), bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('are drawn a little lighter, and stay as stored in the light look', () => {
    expect(shownDeckColor('#5A31D6', 'light')).toBe('#5A31D6');
    expect(shownDeckColor('#5A31D6', 'dark')).toBe('#8C6FE2');
    expect(shownDeckColor('not a color', 'dark')).toBe('not a color');
  });
});

describe('wide screens', () => {
  it('centers content in a column no wider than maxContentWidth', () => {
    expect(sideSpace(411)).toBe(0); // a phone held upright: full width
    expect(sideSpace(maxContentWidth)).toBe(0);
    expect(sideSpace(914)).toBe(117); // a phone turned sideways
    expect(1280 - 2 * sideSpace(1280)).toBe(maxContentWidth); // a tablet
  });
});
