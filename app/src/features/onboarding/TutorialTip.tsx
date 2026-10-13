import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, radius } from '@/lib/theme';

/** "New to Recap?" right above the welcome deck: Start studies it, Skip hides the tip for good. */
export function TutorialTip({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <View style={styles.tip}>
      <Text style={styles.title} accessibilityRole="header">
        New to Recap?
      </Text>
      <Text style={styles.body}>Study this deck to learn the app. It takes about a minute.</Text>
      <View style={styles.buttons}>
        <Button label="Start" accessibilityLabel="Start learning the app" onPress={onStart} />
        <Button variant="text" label="Skip" accessibilityLabel="Skip the tip" onPress={onSkip} />
      </View>
      {/* Points down at the deck. */}
      <View style={styles.arrow} />
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    backgroundColor: colors.tint,
    borderRadius: radius.card,
    padding: 16,
    gap: 4,
    marginTop: 4,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  arrow: {
    position: 'absolute',
    left: 28,
    bottom: -7,
    width: 14,
    height: 14,
    backgroundColor: colors.tint,
    transform: [{ rotate: '45deg' }],
  },
});
