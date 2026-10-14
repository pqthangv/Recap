import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/Button';
import { SnackbarHost } from '@/components/Snackbar';
import { getSettings } from '@/db/settings';
import { setupDatabase } from '@/db/setup';
import { seedIfNeeded } from '@/features/onboarding/seed';
import { sweepPictures } from '@/features/pictures/files';
import { syncReminders } from '@/features/reminders/reminders';
import { refreshLanguage, setLanguageChoice, t, useLanguage } from '@/lib/i18n';
import { isWeb } from '@/lib/platform';
import { colors, sideSpace } from '@/lib/theme';

// Last resort if the layout itself crashes (each screen has its own, see ErrorScreen.tsx).
export { RootErrorBoundary as ErrorBoundary } from '@/components/ErrorScreen';

SplashScreen.preventAutoHideAsync();

type Status = 'loading' | 'ready' | 'error' | 'otherTab';

/** On the web, the browser lets only one tab at a time open the cards' storage (OPFS). */
const openInOtherTab = (e: unknown) =>
  isWeb && /NoModificationAllowedError|Access Handle/i.test(String(e));

export default function RootLayout() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    setupDatabase()
      .then(() => {
        // Settings › Language, before anything is shown (the welcome deck is written in it too).
        setLanguageChoice(getSettings().language);
        seedIfNeeded();
        sweepPictures(); // before any screen, so it never meets a picture being added
        setStatus('ready');
      })
      .catch((e: unknown) => {
        console.error('Database setup failed', e);
        setStatus(openInOtherTab(e) ? 'otherTab' : 'error');
      })
      .finally(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    syncReminders();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') syncReminders();
      // The language can be changed for Recap alone in the phone's settings.
      if (state === 'active') refreshLanguage();
    });
    return () => sub.remove();
  }, [status]);

  if (status === 'loading') return null;
  if (status === 'error' || status === 'otherTab') {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>
          {t(
            status === 'otherTab'
              ? 'app.openInOtherTab'
              : isWeb
                ? 'app.openFailedWeb'
                : 'app.openFailed',
          )}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Screens />
      <SnackbarHost />
      <StatusBar style="dark" />
    </>
  );
}

function Screens() {
  // Not memoized by the React Compiler: the titles below are re-read in the new language.
  'use no memo';
  const language = useLanguage();
  const { width } = useWindowDimensions();
  // iPhone modals have no back arrow (only a swipe down), so they get a visible Cancel.
  const modal = {
    presentation: 'modal',
    headerLeft:
      Platform.OS === 'ios'
        ? () => <Button variant="text" label={t('common.cancel')} onPress={() => router.back()} />
        : undefined,
  } as const;

  return (
    <Stack
      // A new language remounts what's inside every screen, so all of them show the new text;
      // the screens themselves stay, so you stay where you were (e.g. in Settings).
      screenLayout={({ children }) => <Fragment key={language}>{children}</Fragment>}
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        // Every screen's content in one centered column on wide windows (theme.maxContentWidth).
        contentStyle: { backgroundColor: colors.background, paddingHorizontal: sideSpace(width) },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: t('screen.home') }} />
      <Stack.Screen name="deck/[id]" options={{ title: '' }} />
      <Stack.Screen name="group/[name]" options={{ title: '' }} />
      <Stack.Screen name="deck/edit" options={{ ...modal, title: t('screen.newDeck') }} />
      <Stack.Screen name="card/edit" options={{ ...modal, title: t('screen.addCard') }} />
      <Stack.Screen name="study" options={{ title: t('screen.study') }} />
      <Stack.Screen name="settings" options={{ title: t('screen.settings') }} />
      <Stack.Screen name="stats" options={{ title: t('screen.stats') }} />
      <Stack.Screen name="library" options={{ title: t('screen.library') }} />
      <Stack.Screen name="deleted" options={{ title: t('screen.deleted') }} />
      <Stack.Screen name="import/index" options={{ title: t('screen.import') }} />
      <Stack.Screen name="import/paste" options={{ title: t('screen.importPaste') }} />
      <Stack.Screen name="import/csv" options={{ title: t('screen.importCsv') }} />
      <Stack.Screen name="import/anki" options={{ title: t('screen.importAnki') }} />
      <Stack.Screen name="ai/index" options={{ title: t('screen.ai') }} />
      <Stack.Screen name="ai/review" options={{ title: t('screen.aiReview') }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  errorText: { fontSize: 17, color: colors.text, textAlign: 'center' },
});
