import type { Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Colors, useStyles } from '@/lib/theme';

/** The round "+" button in the bottom corner. */
export function Fab({
  onPress,
  accessibilityLabel,
  ref,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  /** The tour's `useTourTarget`. */
  ref?: Ref<View>;
}) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { bottom: insets.bottom + 24 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {/* Two bars, not a "+" character: fonts put that below the middle of the circle. */}
      <View style={styles.bar} />
      <View style={[styles.bar, styles.upright]} />
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 24,
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: colors.text,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    bar: {
      position: 'absolute',
      width: 22,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.onPrimary,
    },
    upright: { width: 3, height: 22 },
  });
