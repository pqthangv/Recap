import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { SnackbarHost } from '@/components/Snackbar';
import { setupDatabase } from '@/db/setup';
import { seedIfNeeded } from '@/features/onboarding/seed';
import { syncReminders } from '@/features/reminders/reminders';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

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
        <Stack.Screen name="deck/edit" options={{ presentation: 'modal', title: 'New deck' }} />
        <Stack.Screen name="card/edit" options={{ presentation: 'modal', title: 'Add card' }} />
        <Stack.Screen name="study" options={{ title: 'Study' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="stats" options={{ title: 'Stats' }} />
        <Stack.Screen name="import/index" options={{ title: 'Import cards' }} />
        <Stack.Screen name="import/paste" options={{ title: 'Paste a list' }} />
        <Stack.Screen name="import/csv" options={{ title: 'Import a file' }} />
        <Stack.Screen name="import/anki" options={{ title: 'Import an Anki deck' }} />
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
