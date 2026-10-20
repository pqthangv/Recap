// One formula as a picture, sized to sit in text of `fontSize` (scaled with the phone's font size).
// Until MathJax has loaded, or when the formula can't be drawn, it shows `fallback` as text.
import { Text, useWindowDimensions, View, type TextStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { drawMath, useMathReady } from './load';

/** MathJax's TeX font: 1 ex = 0.442 em. */
const EX_PER_EM = 0.442;

type Props = {
  tex: string;
  display: boolean;
  fontSize: number;
  color: string;
  /** Shown while loading and for a formula MathJax can't draw. */
  fallback: string;
  fallbackStyle?: TextStyle;
  /** Inline: move the picture down by its depth, so its baseline meets the text's. */
  alignBaseline?: boolean;
};

export function MathSvg({
  tex,
  display,
  fontSize,
  color,
  fallback,
  fallbackStyle,
  alignBaseline = true,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const out = useMathReady() ? drawMath(tex, display) : null;
  if (!out || 'error' in out) return <Text style={fallbackStyle}>{fallback}</Text>;
  const px = fontSize * fontScale * EX_PER_EM;
  const width = out.width * px;
  const height = out.height * px;
  return (
    <View
      style={{
        width,
        height,
        transform: alignBaseline && !display ? [{ translateY: out.depth * px }] : undefined,
      }}
    >
      <SvgXml xml={out.svg} width={width} height={height} color={color} />
    </View>
  );
}
