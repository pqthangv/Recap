import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors } from '@/lib/theme';

/**
 * Shown instead of a screen that crashed. Every route exports it as `ErrorBoundary`, so only
 * that screen is replaced: the header and back button stay, and the rest of the app works.
 * Cards are in the database, so nothing is lost. React logs the error itself.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        Something went wrong
      </Text>
      <Text style={styles.body}>Your cards are safe. Try again, or go back to your decks.</Text>
      <View style={styles.actions}>
        <Button label="Try again" onPress={() => void retry()} />
        <Button variant="secondary" label="Go to decks" onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}

/** For the root layout: nothing above it can navigate, so it can only try again. */
export function RootErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        Something went wrong
      </Text>
      <Text style={styles.body}>Your cards are safe. Please try again.</Text>
      <View style={styles.actions}>
        <Button label="Try again" onPress={() => void retry()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: colors.background,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 16, color: colors.muted, textAlign: 'center' },
  actions: { marginTop: 16, gap: 12 },
});
