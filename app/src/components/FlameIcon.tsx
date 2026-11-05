import Svg, { Path } from 'react-native-svg';

import { useColors } from '@/lib/theme';

/**
 * The streak's flame, drawn with react-native-svg: an outer flame with a lighter one inside.
 * Grey when `lit` is false (no streak).
 */
export function FlameIcon({ size = 24, lit = true }: { size?: number; lit?: boolean }) {
  const colors = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        fill={lit ? colors.flame : colors.muted}
        d="M12.6 1.8c.4 3.1 2.6 5 4.4 7.3 1.9 2.4 2.9 5.1 2.2 8.1-.8 3.4-3.8 5.4-7.2 5.4-3.6 0-6.6-2.5-7.1-6-.4-2.6.6-4.9 2.2-6.9.2 1.5.9 2.7 2 3.4-.3-4.4 1.2-8.2 3.5-11.3z"
      />
      <Path
        fill={lit ? colors.flameInner : colors.hairline}
        d="M12.2 11.6c.7 1.7 2.6 2.9 2.8 5 .2 2.1-1.3 3.8-3.1 3.8-1.9 0-3.3-1.4-3.3-3.2 0-1.3.6-2.3 1.5-3.1.1.9.5 1.6 1.2 2-.3-1.6 0-3.2.9-4.5z"
      />
    </Svg>
  );
}
