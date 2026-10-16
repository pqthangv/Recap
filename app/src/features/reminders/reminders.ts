// Daily study reminder, local notifications only. A repeating notification can't say how many
// cards are due or whether the streak is at stake, so the next days are scheduled one by one
// (planReminders) and redone whenever the app opens or goes to the background.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSettings, setSetting } from '@/db/settings';
import { getStats } from '@/db/stats';
import { getStudyCounts } from '@/db/study';
import { t } from '@/lib/i18n';
import { planReminders } from '@/lib/reminders';
import { lightColors } from '@/lib/theme';
import { can } from '@/lib/platform';

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
    lightColor: lightColors.primary, // the notification light: one fixed color
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

/** Turns the daily reminder on, asking for notification permission first; false if not allowed. */
export async function turnOnReminders(): Promise<boolean> {
  if (!can.reminders || !(await requestReminderPermission())) return false;
  setSetting('reminderEnabled', true);
  await syncReminders();
  return true;
}

let running: Promise<void> = Promise.resolve();

/** Replace the scheduled reminders with fresh ones (or none, if reminders are off). */
export function syncReminders(): Promise<void> {
  if (!can.reminders) return Promise.resolve(); // the web version has no reminders
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
    const { streak, goalMetToday } = getStats(now);
    const plan = planReminders({
      now,
      minutes: settings.reminderMinutes,
      streak: { streak, goalMetToday },
      countsAt: (at) => getStudyCounts(now, at),
    });
    for (const { at, body } of plan) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Recap', body },
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
