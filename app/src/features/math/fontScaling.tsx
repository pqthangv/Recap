// How the phone scales text of each size. Android 14+ scales big text less than small text (at
// 200%, 24 sp becomes ~36 dp, not 48), so the font-scale number alone can't size a formula. And
// React Native 0.86 on Android sizes an inline view's space in a line as if its size were text
// (TextLayoutManager.kt: toPixelFromSP on the placeholder), so at a big font size a formula would
// sit too high, with a gap after it. Both need the real curve: hidden texts of a dozen sizes,
// scaled and not, measured once per font scale.
import { useRef, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

/** Text sizes (sp) the curve is measured at; in between it's interpolated (Android's own curve is
 * a table of straight lines too). Covers text sizes and the height and width of formulas. */
const SIZES = [6, 9, 12, 16, 20, 24, 30, 40, 60, 100, 160, 250];

/** The size each of SIZES is drawn at, in dp. */
type Curve = readonly number[];

const curves = new Map<number, Curve>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The curve for this font scale, or null until it's measured (render <FontScaleProbe/>). */
export function useScaleCurve(fontScale: number): Curve | null {
  const get = () => (fontScale === 1 ? SIZES : (curves.get(fontScale) ?? null));
  return useSyncExternalStore(subscribe, get, get);
}

/** Straight lines through the measured points, continued past both ends. */
function along(from: readonly number[], to: readonly number[], x: number): number {
  let i = 1;
  while (i < from.length - 1 && x > from[i]) i++;
  const [x0, x1, y0, y1] = [from[i - 1], from[i], to[i - 1], to[i]];
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

/** The size (dp) text of `sp` is drawn at. */
export const spToDp = (curve: Curve, sp: number) => along(SIZES, curve, sp);

/** The text size that's drawn at `dp`: the opposite of spToDp. */
export const dpToSp = (curve: Curve, dp: number) => along(curve, SIZES, dp);

/** Android only: what React Native mis-scales (inline views), with the curve to undo it. */
export const scalesInlineViews = Platform.OS === 'android';

/** Hidden texts that measure the curve once; nothing shows and TalkBack skips them. */
export function FontScaleProbe({ fontScale }: { fontScale: number }) {
  const heights = useRef<{ scaled: number[]; plain: number[] }>({ scaled: [], plain: [] });
  const measured = (which: 'scaled' | 'plain', i: number, height: number) => {
    const h = heights.current;
    h[which][i] = height;
    const done = SIZES.every((_, j) => h.scaled[j] && h.plain[j]);
    if (!done || curves.has(fontScale)) return;
    curves.set(
      fontScale,
      SIZES.map((size, j) => (size * h.scaled[j]) / h.plain[j]),
    );
    for (const listener of listeners) listener();
  };
  return (
    <View style={styles.probe} pointerEvents="none" accessibilityElementsHidden>
      {SIZES.map((size, i) => (
        <View key={size}>
          <Text
            importantForAccessibility="no"
            style={{ fontSize: size }}
            onLayout={(e) => measured('scaled', i, e.nativeEvent.layout.height)}
          >
            Mg
          </Text>
          <Text
            importantForAccessibility="no"
            allowFontScaling={false}
            style={{ fontSize: size }}
            onLayout={(e) => measured('plain', i, e.nativeEvent.layout.height)}
          >
            Mg
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  probe: { position: 'absolute', top: 0, left: 0, opacity: 0 },
});
