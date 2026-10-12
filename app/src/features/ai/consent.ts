import { Alert } from 'react-native';

import { getRawSetting, setRawSetting } from '@/db/settings';
import { AI_CONSENT_KEY } from '@/lib/settings';

/*
 * "Create with AI" asks once before the first text goes to Google's Gemini AI. Apple requires
 * explicit permission before data goes to a third-party AI (App Review guideline 5.1.2(i)), and
 * Recap asks on Android too, so both phones work the same. Settings › Advanced takes it back.
 */

export function hasAiConsent(): boolean {
  return getRawSetting(AI_CONSENT_KEY) === true;
}

export function setAiConsent(allowed: boolean): void {
  setRawSetting(AI_CONSENT_KEY, allowed);
}

/** Resolves true when the text may be sent to Gemini; asks the first time. */
export function askAiConsent(): Promise<boolean> {
  if (hasAiConsent()) return Promise.resolve(true);
  return new Promise((resolve) => {
    Alert.alert(
      'Send to Google Gemini?',
      "To write your cards, Recap sends this text to Google's Gemini AI. Google may use it to improve its products. Nothing else leaves your phone.",
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Allow',
          onPress: () => {
            setAiConsent(true);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
