import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { SnackbarHost } from '@/components/Snackbar';
import { setupDatabase } from '@/db/setup';
import { seedIfNeeded } from '@/features/onboarding/seed';
import { syncReminders } from '@/features/reminders/reminders';
import { colors } from '@/lib/theme';

// Last resort if the layout itself crashes (each screen has its own, see ErrorScreen.tsx).
export { RootErrorBoundary as ErrorBoundary } from '@/components/ErrorScreen';

SplashScreen.preventAutoHideAsync();

// iPhone modals have no back arrow (only a swipe down), so they get a visible Cancel.
const modal = {
  presentation: 'modal',
  headerLeft:
    Platform.OS === 'ios'
      ? () => <Button variant="text" label="Cancel" onPress={() => router.back()} />
      : undefined,
} as const;

type Status = 'loading' | 'ready' | 'error';

export default function RootLayout() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    setupDatabase()
      .then(() => {
        seedIfNeeded();
        setStatus('ready');
      })
      .catch((e: unknown) => {
        console.error('Database setup failed', e);
        setStatus('error');
      })
      .finally(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    syncReminders();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') syncReminders();
    });
    return () => sub.remove();
  }, [status]);

  if (status === 'loading') return null;
  if (status === 'error') {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>
          Recap couldn&apos;t open your cards. Please close the app and open it again.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="deck/[id]" options={{ title: '' }} />
        <Stack.Screen name="group/[name]" options={{ title: '' }} />
        <Stack.Screen name="deck/edit" options={{ ...modal, title: 'New deck' }} />
        <Stack.Screen name="card/edit" options={{ ...modal, title: 'Add card' }} />
        <Stack.Screen name="study" options={{ title: 'Study' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="stats" options={{ title: 'Statistics' }} />
        <Stack.Screen name="deleted" options={{ title: 'Recently deleted' }} />
        <Stack.Screen name="import/index" options={{ title: 'Import cards' }} />
        <Stack.Screen name="import/paste" options={{ title: 'Paste a list' }} />
        <Stack.Screen name="import/csv" options={{ title: 'Import a file' }} />
        <Stack.Screen name="import/anki" options={{ title: 'Import an Anki deck' }} />
        <Stack.Screen name="ai/index" options={{ title: 'Create with AI' }} />
        <Stack.Screen name="ai/review" options={{ title: 'Review cards' }} />
      </Stack>
      <SnackbarHost />
      <StatusBar style="dark" />
    </>
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
