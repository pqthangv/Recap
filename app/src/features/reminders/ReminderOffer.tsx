import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { getSettings } from '@/db/settings';
import { formatTimeOfDay } from '@/lib/format';
import { t } from '@/lib/i18n';
import { type Colors, radius, useStyles } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

import { markReminderOffered, shouldOfferReminder } from './offer';
import { turnOnReminders } from './reminders';

/** "Remind you to study? Remind me / Not now" on the done screen; shown once, ever (see offer.ts). */
export function ReminderOffer() {
  const styles = useStyles(makeStyles);
  const [offered] = useState(shouldOfferReminder);
  const [answered, setAnswered] = useState(false);
  const time = formatTimeOfDay(getSettings().reminderMinutes);

  // Once seen it counts as asked, even if the session screen is simply closed.
  useEffect(() => {
    if (offered) markReminderOffered();
  }, [offered]);

  if (!offered || answered) return null;

  const accept = async () => {
    setAnswered(true);
    if (await turnOnReminders()) showSnackbar(t('reminderOffer.on', { time }));
    else showAlert(t('settings.notificationsOff'), t('settings.notificationsOffBody'));
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title} accessibilityRole="header">
        {t('reminderOffer.title')}
      </Text>
      <Text style={styles.body}>{t('reminderOffer.body', { time })}</Text>
      <View style={styles.buttons}>
        <Button label={t('reminderOffer.yes')} onPress={accept} />
        <Button variant="text" label={t('reminderOffer.no')} onPress={() => setAnswered(true)} />
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    box: {
      alignSelf: 'stretch',
      backgroundColor: colors.tint,
      borderRadius: radius.card,
      padding: 16,
      gap: 4,
      marginTop: 24,
    },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, color: colors.text },
    buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  });
