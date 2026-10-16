// Recap's colors: clean white with one accent ("áo trắng, mực tím": white with ink violet), and a
// dark look with the same names, used when the phone or Settings › Appearance asks for it.
// Screens get them through useColors() / useStyles(), never hard-coded, so both looks stay in step.
import { useScheme, type Scheme } from './appearance';

const light = {
  background: '#FFFFFF',
  surface: '#F7F6FB',
  text: '#1A1530',
  muted: '#5E5873',
  primary: '#5A31D6',
  onPrimary: '#FFFFFF',
  tint: '#EEEAFD',
  hairline: '#E6E3EF',
  danger: '#B3261E',
  // New cards in the statistics chart (a lighter accent, ≥ 3:1 on white).
  chartNew: '#9A80EC',
  // The streak flame (an icon, not an accent color).
  flame: '#D9530F',
} as const;

export type Colors = { readonly [K in keyof typeof light]: string };

// Near-black paper with a hint of violet. Links and buttons use a lighter violet (the light
// look's is too dark to read on black), with dark text on buttons. Contrast: theme.test.ts.
const dark: Colors = {
  background: '#121017',
  surface: '#1D1A25',
  text: '#ECEAF4',
  muted: '#ADA7BF',
  primary: '#B5A0FF',
  onPrimary: '#1A1530',
  tint: '#2B2541',
  hairline: '#363143',
  danger: '#FFB4AB',
  chartNew: '#7D63DB',
  flame: '#FF8B4D',
};

export const palettes: Readonly<Record<Scheme, Colors>> = { light, dark };

/** The light look, for what isn't drawn on a screen (e.g. a notification's accent color). */
export const lightColors: Colors = light;

/**
 * @deprecated While dark mode is being built: the light look for screens not yet converted to
 * useColors() / useStyles(). Removed once every screen is converted.
 */
export const colors: Colors = light;

/** The colors of the current look. */
export function useColors(): Colors {
  return palettes[useScheme()];
}

const styleCache = new WeakMap<object, Partial<Record<Scheme, unknown>>>();

function stylesFor<T>(make: (colors: Colors) => T, scheme: Scheme): T {
  let byScheme = styleCache.get(make);
  if (!byScheme) {
    byScheme = {};
    styleCache.set(make, byScheme);
  }
  byScheme[scheme] ??= make(palettes[scheme]);
  return byScheme[scheme] as T;
}

/**
 * A file's styles in the current look. At the bottom of the file:
 * `const makeStyles = (colors: Colors) => StyleSheet.create({ … })`, and in each component that
 * uses them, `const styles = useStyles(makeStyles)`. They're made once per look.
 */
export function useStyles<T>(make: (colors: Colors) => T): T {
  return stylesFor(make, useScheme());
}

// Colors a user can pick for a deck (shown as a small dot, ≥ 3:1 contrast on white).
export const deckColors = [
  '#5A31D6',
  '#1A73E8',
  '#0B8043',
  '#E37400',
  '#C5221F',
  '#AD1457',
  '#5F6368',
] as const;

/**
 * A deck's color as drawn: in the dark look a little lighter (30% towards white), so every dot
 * still stands out (≥ 3:1). The color stored with the deck doesn't change.
 */
export function shownDeckColor(hex: string, scheme: Scheme): string {
  if (scheme === 'light' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const lighter = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * 0.3)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${lighter.join('').toUpperCase()}`;
}

export const radius = { card: 20, button: 14, chip: 999 } as const;

// Widest a screen's content gets (dp). Tablets, foldables and phones turned sideways get white space
// on both sides instead of very long lines and far-apart buttons.
export const maxContentWidth = 680;

/** Space on each side that keeps content within maxContentWidth on a window this wide. */
export function sideSpace(windowWidth: number): number {
  return Math.max(0, Math.round((windowWidth - maxContentWidth) / 2));
}

// Minimum touch target (dp), per the UX rules.
export const touchTarget = 48;
