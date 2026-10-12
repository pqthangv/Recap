// The app has one theme: clean white with one accent ("áo trắng, mực tím": white with ink violet).
// Use these instead of hard-coded colors.
export const colors = {
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

export const radius = { card: 20, button: 14, chip: 999 } as const;

// Minimum touch target (dp), per the UX rules.
export const touchTarget = 48;
