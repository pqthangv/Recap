import { Alert, Platform } from 'react-native';

import { getRawSetting, setRawSetting } from '@/db/settings';
import { AI_CONSENT_KEY } from '@/lib/settings';

/**
 * Apple asks apps to get explicit permission before sending someone's data to a third-party AI
 * (App Review guideline 5.1.2(i)), so on iPhone "Create with AI" asks once before the first use.
 * Android doesn't ask; the privacy policy and Play's Data safety form cover it there.
 */
export const ASKS_FOR_AI_CONSENT = Platform.OS === 'ios';

export function hasAiConsent(): boolean {
  return getRawSetting(AI_CONSENT_KEY) === true;
}

export function setAiConsent(allowed: boolean): void {
  setRawSetting(AI_CONSENT_KEY, allowed);
}

/** Resolves true when the text may be sent to Gemini; asks the first time on iPhone. */
export function askAiConsent(asks = ASKS_FOR_AI_CONSENT): Promise<boolean> {
  if (!asks || hasAiConsent()) return Promise.resolve(true);
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
