// Daily study reminder, local notifications only. A repeating notification can't say how many
// cards are due, so we schedule the next 7 days one by one with the count each day will have,
// and redo it whenever the app opens or goes to the background.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSettings } from '@/db/settings';
import { getStudyCounts } from '@/db/study';
import { t } from '@/lib/i18n';
import { reminderText, reminderTimes } from '@/lib/reminders';
import { colors } from '@/lib/theme';

const CHANNEL_ID = 'study-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t('reminder.channel'),
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: colors.primary,
  });
}

/** Ask for permission (Android 13+ / iOS). Returns true if reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

let running: Promise<void> = Promise.resolve();

/** Replace the scheduled reminders with fresh ones (or none, if reminders are off). */
export function syncReminders(): Promise<void> {
  running = running.then(schedule, schedule);
  return running;
}

async function schedule(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const settings = getSettings();
    if (!settings.reminderEnabled) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await ensureChannel();
    const now = Date.now();
    for (const at of reminderTimes(now, settings.reminderMinutes)) {
      const due = getStudyCounts(now, at).total;
      if (due === 0) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Recap', body: reminderText(due) },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch (e) {
    // A failed reminder must never break studying.
    console.warn('Could not schedule reminders', e);
  }
}
