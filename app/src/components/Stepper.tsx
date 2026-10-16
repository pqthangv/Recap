import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Colors, touchTarget, useStyles } from '@/lib/theme';

type Props = {
  label: string;
  /** Plain one-line explanation under the label. */
  description?: string;
  value: number;
  /** How to show the value, e.g. "90%". */
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

/** − value + control. Screen readers treat it as one adjustable setting (swipe up/down). */
export function Stepper({ label, description, value, display, min, max, step, onChange }: Props) {
  const styles = useStyles(makeStyles);
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const down = () => set(value - step);
  const up = () => set(value + step);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityValue={{ text: display }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? up() : down())}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          onPress={down}
          disabled={value <= min}
          style={[styles.button, value <= min && styles.disabled]}
          importantForAccessibility="no"
        >
          <Text style={styles.sign}>−</Text>
        </Pressable>
        <Text style={styles.value}>{display}</Text>
        <Pressable
          onPress={up}
          disabled={value >= max}
          style={[styles.button, value >= max && styles.disabled]}
          importantForAccessibility="no"
        >
          <Text style={styles.sign}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
    text: { flex: 1 },
    label: { fontSize: 16, color: colors.text, fontWeight: '500' },
    description: { fontSize: 14, color: colors.muted, marginTop: 2 },
    controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    button: {
      width: touchTarget,
      height: touchTarget,
      borderRadius: touchTarget / 2,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.4 },
    sign: { fontSize: 22, color: colors.primary, fontWeight: '600' },
    value: {
      minWidth: 72,
      textAlign: 'center',
      fontSize: 16,
      color: colors.text,
      fontWeight: '600',
    },
  });
