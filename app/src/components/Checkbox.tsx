import { StyleSheet, Text, View } from 'react-native';

import { type Colors, useStyles } from '@/lib/theme';

/** A drawn check box (the press handling and label belong to the row around it). */
export function Checkbox({ checked }: { checked: boolean }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.box, checked && styles.on]}>
      {checked ? <Text style={styles.mark}>✓</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    box: {
      width: 26,
      height: 26,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    on: { backgroundColor: colors.primary, borderColor: colors.primary },
    mark: { color: colors.onPrimary, fontSize: 16, fontWeight: '700', lineHeight: 20 },
  });
