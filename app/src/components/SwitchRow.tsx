import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { type Colors, touchTarget, useColors, useStyles } from '@/lib/theme';

type Props = {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

/** A setting with an on/off switch. The whole row is the touch target. */
export function SwitchRow({ label, description, value, onChange }: Props) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        importantForAccessibility="no-hide-descendants"
        trackColor={{ true: colors.primary, false: colors.hairline }}
        thumbColor={colors.background}
      />
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: touchTarget,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: -12,
      borderRadius: 12,
    },
    pressed: { backgroundColor: colors.surface },
    text: { flex: 1 },
    label: { fontSize: 16, color: colors.text, fontWeight: '500' },
    description: { fontSize: 14, color: colors.muted, marginTop: 2 },
  });
