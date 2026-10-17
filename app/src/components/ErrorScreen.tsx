import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { t } from '@/lib/i18n';
import { type Colors, useStyles } from '@/lib/theme';

/**
 * Shown instead of a screen that crashed. Every route exports it as `ErrorBoundary`, so only
 * that screen is replaced: the header and back button stay, and the rest of the app works.
 * Cards are in the database, so nothing is lost. React logs the error itself.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const styles = useStyles(makeStyles);
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        {t('error.title')}
      </Text>
      <Text style={styles.body}>{t('error.body')}</Text>
      <View style={styles.actions}>
        <Button label={t('error.tryAgain')} onPress={() => void retry()} />
        <Button
          variant="secondary"
          label={t('error.goToDecks')}
          onPress={() => router.dismissTo('/')}
        />
      </View>
    </View>
  );
}

/** For the root layout: nothing above it can navigate, so it can only try again. */
export function RootErrorBoundary({ retry }: ErrorBoundaryProps) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        {t('error.title')}
      </Text>
      <Text style={styles.body}>{t('error.rootBody')}</Text>
      <View style={styles.actions}>
        <Button label={t('error.tryAgain')} onPress={() => void retry()} />
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
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
