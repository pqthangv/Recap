import type { ReactNode, Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

import { type Colors, radius, touchTarget, useStyles } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'text' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'md' | 'lg';
  disabled?: boolean;
  /** Second line, e.g. the next interval on a grade button. */
  sublabel?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** E.g. the tour's `useTourTarget`, which measures where the button is. */
  ref?: Ref<View>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  sublabel,
  accessibilityLabel,
  accessibilityHint,
  style,
  ref,
}: Props) {
  const labelColor = useStyles(makeLabelColor);
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (sublabel ? `${label}, ${sublabel}` : label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        size === 'lg' && styles.lg,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, labelColor[variant], size === 'lg' && styles.lgLabel]}>
        {label}
      </Text>
      {sublabel ? <Text style={[styles.sublabel, labelColor[variant]]}>{sublabel}</Text> : null}
    </Pressable>
  );
}

const makeLabelColor = (colors: Colors) =>
  StyleSheet.create({
    primary: { color: colors.onPrimary },
    secondary: { color: colors.primary },
    text: { color: colors.primary },
    danger: { color: colors.danger },
  });

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    base: {
      minHeight: touchTarget,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.button,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.tint },
    text: { backgroundColor: 'transparent', paddingHorizontal: 12 },
    danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.hairline },
    lg: { minHeight: 64, borderRadius: radius.card },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.8 },
    label: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
    lgLabel: { fontSize: 20 },
    sublabel: { fontSize: 13, marginTop: 2, opacity: 0.85 },
  });
