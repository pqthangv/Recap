import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { Stepper } from '@/components/Stepper';
import { SwitchRow } from '@/components/SwitchRow';
import { listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { getSettings, setSetting } from '@/db/settings';
import { resetDeckSchedule } from '@/db/study';
import { hasAiConsent, setAiConsent } from '@/features/ai/consent';
import { pickAndImportBackup, shareBackup, shareCardsCsv } from '@/features/backup/files';
import { Chip } from '@/features/import/DeckTarget';
import { syncReminders, turnOnReminders } from '@/features/reminders/reminders';
import { setAppearanceChoice, useScheme, type AppearanceChoice } from '@/lib/appearance';
import { BackupError } from '@/lib/backup';
import { CONTACT_EMAIL, PRIVACY_POLICY_URL, SUPPORT_URL } from '@/lib/contact';
import { formatTimeOfDay } from '@/lib/format';
import {
  LANGUAGE_NAMES,
  setLanguageChoice,
  t,
  tn,
  type LanguageChoice,
  type StringKey,
} from '@/lib/i18n';
import { MAX_RETENTION, MIN_RETENTION } from '@/lib/scheduler';
import { can, isWeb } from '@/lib/platform';
import { NEW_PER_DAY_MAX } from '@/lib/settings';
import { radius, shownDeckColor, touchTarget, useStyles, type Colors } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

const LANGUAGE_CHOICES: readonly LanguageChoice[] = ['auto', 'en', 'vi'];
const APPEARANCE_CHOICES: readonly AppearanceChoice[] = ['auto', 'light', 'dark'];
const APPEARANCE_NAMES: Record<Exclude<AppearanceChoice, 'auto'>, StringKey> = {
  light: 'settings.appearanceLight',
  dark: 'settings.appearanceDark',
};

export default function SettingsScreen() {
  const styles = useStyles(makeStyles);
  const settings = useLive(getSettings, ['settings']);
  const [advanced, setAdvanced] = useState(false);

  const setReminder = async (enabled: boolean) => {
    if (enabled) {
      if (!(await turnOnReminders())) {
        showAlert(t('settings.notificationsOff'), t('settings.notificationsOffBody'));
      }
      return;
    }
    setSetting('reminderEnabled', false);
    syncReminders();
  };

  const chooseLanguage = (choice: LanguageChoice) => {
    setSetting('language', choice);
    setLanguageChoice(choice); // every screen shows the new language right away
    syncReminders(); // reminders already scheduled are in the old language
  };

  const chooseAppearance = (choice: AppearanceChoice) => {
    setSetting('appearance', choice);
    setAppearanceChoice(choice); // every screen redraws in the new look right away
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title={t('settings.studying')}>
        <Stepper
          label={t('settings.retention')}
          description={t('settings.retentionHelp')}
          value={Math.round(settings.retention * 100)}
          display={`${Math.round(settings.retention * 100)}%`}
          min={Math.round(MIN_RETENTION * 100)}
          max={Math.round(MAX_RETENTION * 100)}
          step={1}
          onChange={(v) => setSetting('retention', v / 100)}
        />
        <Stepper
          label={t('settings.newPerDay')}
          value={settings.newPerDay}
          display={String(settings.newPerDay)}
          min={0}
          max={NEW_PER_DAY_MAX}
          step={5}
          onChange={(v) => setSetting('newPerDay', v)}
        />
        <SwitchRow
          label={t('settings.typeAnswer')}
          description={t('settings.typeAnswerHelp')}
          value={settings.typeAnswer}
          onChange={(v) => setSetting('typeAnswer', v)}
        />
        <SwitchRow
          label={t('settings.fourButtons')}
          description={t('settings.fourButtonsHelp')}
          value={settings.fourButtons}
          onChange={(v) => setSetting('fourButtons', v)}
        />
        <SwitchRow
          label={t('settings.readAloud')}
          description={t('settings.readAloudHelp')}
          value={settings.readAloud}
          onChange={(v) => setSetting('readAloud', v)}
        />
      </Section>

      {can.reminders ? (
        <Section title={t('settings.reminder')}>
          <SwitchRow
            label={t('settings.dailyReminder')}
            description={t('settings.dailyReminderHelp')}
            value={settings.reminderEnabled}
            onChange={setReminder}
          />
          {settings.reminderEnabled ? (
            <Stepper
              label={t('settings.time')}
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
      ) : null}

      <Section title={t('settings.language')}>
        <View
          style={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.language')}
        >
          {LANGUAGE_CHOICES.map((choice) => (
            <Chip
              key={choice}
              label={
                choice === 'auto'
                  ? t(isWeb ? 'settings.languageAutoWeb' : 'settings.languageAuto')
                  : LANGUAGE_NAMES[choice]
              }
              selected={settings.language === choice}
              onPress={() => chooseLanguage(choice)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('settings.appearance')}>
        <View
          style={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.appearance')}
        >
          {APPEARANCE_CHOICES.map((choice) => (
            <Chip
              key={choice}
              label={
                choice === 'auto'
                  ? t(isWeb ? 'settings.appearanceAutoWeb' : 'settings.appearanceAuto')
                  : t(APPEARANCE_NAMES[choice])
              }
              selected={settings.appearance === choice}
              onPress={() => chooseAppearance(choice)}
            />
          ))}
        </View>
      </Section>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advanced }}
        onPress={() => setAdvanced((a) => !a)}
        style={styles.advancedToggle}
      >
        <Text style={styles.sectionTitle}>{t('settings.advanced')}</Text>
        <Text style={styles.chevron}>{advanced ? '⌃' : '⌄'}</Text>
      </Pressable>
      {advanced ? <AdvancedSettings /> : null}

      <Text style={styles.footer}>
        {t(isWeb ? 'settings.footerWeb' : 'settings.footer', {
          version: Constants.expoConfig?.version ?? '',
        })}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('settings.emailA11y', { email: CONTACT_EMAIL })}
        onPress={() =>
          Linking.openURL(
            `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('settings.emailSubject'))}`,
          ).catch(() => showAlert(t('settings.contactUs'), CONTACT_EMAIL))
        }
        style={styles.contact}
      >
        <Text style={styles.contactText}>{t('settings.feedback', { email: CONTACT_EMAIL })}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          Linking.openURL(SUPPORT_URL).catch(() => showAlert(t('settings.help'), SUPPORT_URL))
        }
        style={styles.contact}
      >
        <Text style={styles.contactText}>{t('settings.help')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          Linking.openURL(PRIVACY_POLICY_URL).catch(() =>
            showAlert(t('settings.privacy'), PRIVACY_POLICY_URL),
          )
        }
        style={styles.contact}
      >
        <Text style={styles.contactText}>{t('settings.privacy')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function AdvancedSettings() {
  const styles = useStyles(makeStyles);
  const scheme = useScheme();
  const decks = useLive(listDecks, ['decks']);
  const aiConsent = useLive(hasAiConsent, ['settings']);

  const run = async (task: () => Promise<void>, failure: string) => {
    try {
      await task();
    } catch (e) {
      console.warn(e);
      showAlert(failure, e instanceof BackupError ? e.message : t('common.tryAgain'));
    }
  };

  const importBackup = () =>
    run(async () => {
      const result = await pickAndImportBackup();
      if (!result) return;
      const changed = result.decks + result.cards + result.reviews;
      showAlert(
        t('settings.backupImported'),
        changed === 0
          ? t('settings.backupNothingNew')
          : t('settings.backupAdded', {
              decks: tn('count.deck', result.decks),
              cards: tn('count.card', result.cards),
              reviews: tn('count.review', result.reviews),
            }),
      );
    }, t('settings.importFailed'));

  const confirmReset = (deckId: string, name: string) =>
    showAlert(t('settings.resetTitle'), t('settings.resetBody', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.reset'),
        style: 'destructive',
        onPress: () => {
          const n = resetDeckSchedule(deckId);
          showSnackbar(t('settings.resetDone', { cards: tn('count.card', n) }));
        },
      },
    ]);

  return (
    <View style={styles.section}>
      <SwitchRow
        label={t('settings.aiConsent')}
        description={t('settings.aiConsentHelp')}
        value={aiConsent}
        onChange={setAiConsent}
      />
      <Text style={styles.description}>{t('settings.backupHelp')}</Text>
      <Button
        variant="secondary"
        label={t('settings.exportBackup')}
        onPress={() => run(shareBackup, t('settings.exportFailed'))}
      />
      <Button variant="secondary" label={t('settings.importBackup')} onPress={importBackup} />
      <Button
        variant="secondary"
        label={t('settings.exportCsv')}
        onPress={() => run(shareCardsCsv, t('settings.exportFailed'))}
      />

      <Text style={[styles.label, styles.spaced]}>{t('settings.resetSection')}</Text>
      {decks.length === 0 ? <Text style={styles.description}>{t('settings.noDecks')}</Text> : null}
      {decks.map((d) => (
        <Pressable
          key={d.id}
          accessibilityRole="button"
          accessibilityLabel={t('settings.resetA11y', { name: d.name })}
          onPress={() => confirmReset(d.id, d.name)}
          style={({ pressed }) => [styles.deckRow, pressed && styles.pressed]}
        >
          <View style={[styles.dot, { backgroundColor: shownDeckColor(d.color, scheme) }]} />
          <Text style={styles.deckName}>{d.name}</Text>
          <Text style={styles.resetText}>{t('settings.reset')}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: 20, paddingBottom: 48 },
    section: { marginBottom: 24, gap: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.primary },
    label: { fontSize: 16, color: colors.text, fontWeight: '500' },
    description: { fontSize: 14, color: colors.muted, marginTop: 2 },
    spaced: { marginTop: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
