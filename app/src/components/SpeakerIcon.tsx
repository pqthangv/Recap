import { StyleSheet, View } from 'react-native';

import { useColors } from '@/lib/theme';

/**
 * Classic speaker-with-sound-waves icon, drawn with plain views (no icon font or image), so it
 * stays sharp at any size and follows the theme colors. Drawn on a 24-unit grid.
 */
export function SpeakerIcon({ size = 24, color }: { size?: number; color?: string }) {
  const colors = useColors();
  const ink = color ?? colors.text;
  const u = size / 24;
  const wave = (radius: number) => ({
    position: 'absolute' as const,
    left: 12 * u - radius,
    top: 12 * u - radius,
    width: radius * 2,
    height: radius * 2,
    borderRadius: radius,
    borderWidth: 2.2 * u,
    borderColor: 'transparent',
    borderRightColor: ink,
  });
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
      {/* body */}
      <View
        style={[
          styles.abs,
          {
            left: 2 * u,
            top: 8 * u,
            width: 4.5 * u,
            height: 8 * u,
            borderRadius: u,
            backgroundColor: ink,
          },
        ]}
      />
      {/* cone: a trapezoid made from a zero-width view's borders */}
      <View
        style={[
          styles.abs,
          {
            left: 6 * u,
            top: 3 * u,
            width: 0,
            // React Native counts borders inside height: 18 = 5 + 8 (flat edge) + 5.
            height: 18 * u,
            borderRightWidth: 6 * u,
            borderTopWidth: 5 * u,
            borderBottomWidth: 5 * u,
            borderRightColor: ink,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
          },
        ]}
      />
      {/* sound waves */}
      <View style={wave(5.5 * u)} />
      <View style={wave(9.5 * u)} />
    </View>
  );
}

const styles = StyleSheet.create({ abs: { position: 'absolute' } });
