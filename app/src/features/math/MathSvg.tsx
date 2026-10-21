// One formula as a picture, sized to sit in text whose letters are `size` pixels high (an em).
// Until MathJax has loaded, or when the formula can't be drawn, it shows the formula's plain-text
// version ("x² + √y") instead, in the surrounding text's style.
import { ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { mathToText } from '@/lib/math/plainText';

import { drawMath, useMathReady } from './load';

/** MathJax's TeX font: 1 ex = 0.442 em. */
const EX_PER_EM = 0.442;

/** Too-wide formulas shrink to fit, but never below this; a formula on its own line then scrolls. */
const MIN_SCALE = 0.7;

type Props = {
  tex: string;
  display: boolean;
  /** The text's size as drawn, after the phone's font scaling (see MathText). */
  size: number;
  color: string;
  /** For the plain-text fallback; inside a <Text> leave it out, the text's style applies. */
  fallbackStyle?: TextStyle;
  /** The width there is for it (unknown until the first layout). */
  maxWidth?: number;
  /**
   * Inline on Android at a big font size: the size to give the view so that React Native, which
   * scales it like text, keeps exactly the picture's size in the line (see fontScaling.tsx). The
   * picture is drawn at its real size from the view's top-left corner.
   */
  layoutSize?: (dp: number) => number;
};

export function MathSvg({ tex, display, size, color, fallbackStyle, maxWidth, layoutSize }: Props) {
  const out = useMathReady() ? drawMath(tex, display) : null;
  if (!out || 'error' in out) return <Text style={fallbackStyle}>{mathToText(tex)}</Text>;

  const ex = size * EX_PER_EM;
  const natural = out.width * ex;
  const shrink = maxWidth && natural > maxWidth ? Math.max(maxWidth / natural, MIN_SCALE) : 1;
  const px = ex * shrink;
  const width = out.width * px;
  const height = out.height * px;
  const picture = (
    <View
      style={{
        width: layoutSize ? layoutSize(width) : width,
        height: layoutSize ? layoutSize(height) : height,
        overflow: 'visible',
        // Inline, the picture's bottom sits on the text's baseline; MathJax's own baseline is
        // `depth` higher, so it moves down by that (checked on Android and the web).
        transform: display ? undefined : [{ translateY: out.depth * px }],
      }}
    >
      <SvgXml
        xml={out.svg}
        width={width}
        height={height}
        color={color}
        style={layoutSize ? styles.fullSize : undefined}
      />
    </View>
  );
  if (!display || !maxWidth || width <= maxWidth) return picture;
  return (
    <ScrollView horizontal style={{ maxWidth }}>
      {picture}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fullSize: { position: 'absolute', top: 0, left: 0 },
});
