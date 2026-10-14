// "Remind you to study?": offered once, on the done screen of the first finished session, to people
// who haven't turned the daily reminder on. Reminders are off by default, and Apple's terms want a
// clear opt-in for notifications that encourage using the app, so it says exactly what's sent.
import { getRawSetting, getSettings, setRawSetting } from '@/db/settings';
import { can } from '@/lib/platform';
import { REMINDER_OFFERED_KEY } from '@/lib/settings';

export function shouldOfferReminder(): boolean {
  return (
    can.reminders && !getSettings().reminderEnabled && getRawSetting(REMINDER_OFFERED_KEY) !== true
  );
}

/** Called once it's been shown, whatever the answer: it isn't asked again. */
export function markReminderOffered(now = Date.now()): void {
  setRawSetting(REMINDER_OFFERED_KEY, true, now);
}
