import { dpToSp, spToDp } from './fontScaling';

// Android 14's curve at 200% (FontScaleConverter), at the sizes the probe measures:
// 6 9 12 16 20 24 30 40 60 100 160 250 sp.
const AT_200 = [12, 18, 24, 28, 34, 36, 38, 46.15, 61.54, 100, 160, 250];

describe('the font scale curve', () => {
  it('gives the size text is drawn at, between and past the measured sizes', () => {
    expect(spToDp(AT_200, 24)).toBe(36);
    expect(spToDp(AT_200, 27)).toBe(37); // halfway from 24 (36) to 30 (38)
    expect(spToDp(AT_200, 3)).toBe(6); // below 6 sp: the first line, continued
    expect(spToDp(AT_200, 300)).toBe(300);
  });

  it('goes back from a drawn size to the text size', () => {
    for (const sp of [5, 7, 13, 24, 26.5, 33, 90, 200, 400]) {
      expect(dpToSp(AT_200, spToDp(AT_200, sp))).toBeCloseTo(sp, 6);
    }
  });
});
