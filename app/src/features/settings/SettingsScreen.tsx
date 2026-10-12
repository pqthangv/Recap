import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { Stepper } from '@/components/Stepper';
import { SwitchRow } from '@/components/SwitchRow';
import { listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { getSettings, setSetting } from '@/db/settings';
import { resetDeckSchedule } from '@/db/study';
import { ASKS_FOR_AI_CONSENT, hasAiConsent, setAiConsent } from '@/features/ai/consent';
import { pickAndImportBackup, shareBackup, shareCardsCsv } from '@/features/backup/files';
import { requestReminderPermission, syncReminders } from '@/features/reminders/reminders';
import { BackupError } from '@/lib/backup';
import { CONTACT_EMAIL, PRIVACY_POLICY_URL } from '@/lib/contact';
import { formatTimeOfDay, plural } from '@/lib/format';
import { MAX_RETENTION, MIN_RETENTION } from '@/lib/scheduler';
import { NEW_PER_DAY_MAX } from '@/lib/settings';
import { colors, radius, touchTarget } from '@/lib/theme';

export default function SettingsScreen() {
  const settings = useLive(getSettings, ['settings']);
  const [advanced, setAdvanced] = useState(false);

  const setReminder = async (enabled: boolean) => {
    if (enabled && !(await requestReminderPermission())) {
      Alert.alert(
        'Notifications are off',
        "To get reminders, allow notifications for Recap in your phone's settings.",
      );
      return;
    }
    setSetting('reminderEnabled', enabled);
    syncReminders();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="Studying">
        <Stepper
          label="Target retention"
          description="How much you want to remember. Higher means more reviews."
          value={Math.round(settings.retention * 100)}
          display={`${Math.round(settings.retention * 100)}%`}
          min={Math.round(MIN_RETENTION * 100)}
          max={Math.round(MAX_RETENTION * 100)}
          step={1}
          onChange={(v) => setSetting('retention', v / 100)}
        />
        <Stepper
          label="New cards per day"
          value={settings.newPerDay}
          display={String(settings.newPerDay)}
          min={0}
          max={NEW_PER_DAY_MAX}
          step={5}
          onChange={(v) => setSetting('newPerDay', v)}
        />
        <SwitchRow
          label="Show 4 answer buttons"
          description="Again, Hard, Good and Easy instead of Forgot and Got it."
          value={settings.fourButtons}
          onChange={(v) => setSetting('fourButtons', v)}
        />
        <SwitchRow
          label="Read cards aloud"
          description="Reads each side in English or Vietnamese as it appears. You can always tap the speaker on a card."
          value={settings.readAloud}
          onChange={(v) => setSetting('readAloud', v)}
        />
      </Section>

      <Section title="Reminder">
        <SwitchRow
          label="Daily reminder"
          description="A notification when you have cards due."
          value={settings.reminderEnabled}
          onChange={setReminder}
        />
        {settings.reminderEnabled ? (
          <Stepper
            label="Time"
            value={settings.reminderMinutes}
            display={formatTimeOfDay(settings.reminderMinutes)}
            min={0}
            max={24 * 60 - 15}
            step={15}
            onChange={(v) => {
              setSetting('reminderMinutes', v);
              syncReminders();
            }}
          />
        ) : null}
      </Section>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advanced }}
        onPress={() => setAdvanced((a) => !a)}
        style={styles.advancedToggle}
      >
        <Text style={styles.sectionTitle}>Advanced</Text>
        <Text style={styles.chevron}>{advanced ? '⌃' : '⌄'}</Text>
      </Pressable>
      {advanced ? <AdvancedSettings /> : null}

      <Text style={styles.footer}>
        Recap {Constants.expoConfig?.version ?? ''} · Free forever. Your cards stay on this phone.
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Email ${CONTACT_EMAIL}`}
        onPress={() =>
          Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Recap%20feedback`).catch(() =>
            Alert.alert('Contact us', CONTACT_EMAIL),
          )
        }
        style={styles.contact}
      >
        <Text style={styles.contactText}>Questions or feedback? {CONTACT_EMAIL}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          Linking.openURL(PRIVACY_POLICY_URL).catch(() =>
            Alert.alert('Privacy policy', PRIVACY_POLICY_URL),
          )
        }
        style={styles.contact}
      >
        <Text style={styles.contactText}>Privacy policy</Text>
      </Pressable>
    </ScrollView>
  );
}

function AdvancedSettings() {
  const decks = useLive(listDecks, ['decks']);
  const aiConsent = useLive(hasAiConsent, ['settings']);

  const run = async (task: () => Promise<void>, failure: string) => {
    try {
      await task();
    } catch (e) {
      console.warn(e);
      Alert.alert(failure, e instanceof BackupError ? e.message : 'Please try again.');
    }
  };

  const importBackup = () =>
    run(async () => {
      const result = await pickAndImportBackup();
      if (!result) return;
      const changed = result.decks + result.cards + result.reviews;
      Alert.alert(
        'Backup imported',
        changed === 0
          ? 'Everything in this backup is already here.'
          : `${plural(result.decks, 'deck')}, ${plural(result.cards, 'card')} and ${plural(result.reviews, 'review')} added or updated.`,
      );
    }, "Couldn't import that file");

  const confirmReset = (deckId: string, name: string) =>
    Alert.alert(
      'Reset schedule?',
      `Every card in "${name}" will start over as new. Your review history is kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const n = resetDeckSchedule(deckId);
            showSnackbar(`${plural(n, 'card')} reset`);
          },
        },
      ],
    );

  return (
    <View style={styles.section}>
      {ASKS_FOR_AI_CONSENT ? (
        <SwitchRow
          label="Send text to Google Gemini"
          description="Create with AI needs this to write cards. When it's off, Recap asks first."
          value={aiConsent}
          onChange={setAiConsent}
        />
      ) : null}
      <Text style={styles.description}>
        A backup has everything: decks, cards, review history and settings. Importing one merges it
        with what&apos;s here — nothing is deleted.
      </Text>
      <Button
        variant="secondary"
        label="Export backup"
        onPress={() => run(shareBackup, "Couldn't export")}
      />
      <Button variant="secondary" label="Import backup" onPress={importBackup} />
      <Button
        variant="secondary"
        label="Export cards as CSV"
        onPress={() => run(shareCardsCsv, "Couldn't export")}
      />

      <Text style={[styles.label, styles.spaced]}>Reset a deck&apos;s schedule</Text>
      {decks.length === 0 ? <Text style={styles.description}>No decks yet.</Text> : null}
      {decks.map((d) => (
        <Pressable
          key={d.id}
          accessibilityRole="button"
          accessibilityLabel={`Reset schedule for ${d.name}`}
          onPress={() => confirmReset(d.id, d.name)}
          style={({ pressed }) => [styles.deckRow, pressed && styles.pressed]}
        >
          <View style={[styles.dot, { backgroundColor: d.color }]} />
          <Text style={styles.deckName}>{d.name}</Text>
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  section: { marginBottom: 24, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.primary },
  label: { fontSize: 16, color: colors.text, fontWeight: '500' },
  description: { fontSize: 14, color: colors.muted, marginTop: 2 },
  spaced: { marginTop: 16 },
  flex: { flex: 1 },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
    marginBottom: 8,
  },
  chevron: { fontSize: 20, color: colors.primary },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: touchTarget,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: radius.button,
  },
  pressed: { backgroundColor: colors.surface },
  dot: { width: 12, height: 12, borderRadius: 6 },
  deckName: { flex: 1, fontSize: 16, color: colors.text },
  resetText: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  footer: { marginTop: 16, fontSize: 13, color: colors.muted, textAlign: 'center' },
  contact: { minHeight: touchTarget, justifyContent: 'center' },
  contactText: { fontSize: 13, color: colors.primary, textAlign: 'center' },
});
