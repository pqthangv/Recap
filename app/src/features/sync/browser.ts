// Google (and Apple on Android) in a browser tab: Custom Tabs on Android, Apple's sign-in sheet for
// websites (ASWebAuthenticationSession) on iPhones. The tab ends at recapcards://signed-in, which
// expo-web-browser hands back here (app/+native-intent.tsx keeps the router from opening it too).
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { language, t } from '@/lib/i18n';
import {
  AccountError,
  readTabResult,
  type Account,
  type BrowserProvider,
} from '@/lib/sync/account';

import { accountClient } from './api';
import { browserSecret } from './secret';

export const APP_RETURN = 'recapcards://signed-in';
const LATE_LINK_MS = 700;

/** Signs in through the tab; null if the person closed it or backed out. */
export async function signInInBrowser(provider: BrowserProvider): Promise<Account | null> {
  const { verifier, challenge } = await browserSecret();
  const url = accountClient.startUrl(provider, APP_RETURN, challenge, language());
  // On Android, expo-web-browser also ends the session when Recap comes back to the front, and that
  // can beat the link by a moment; so the link is watched here too, a little longer.
  let link: string | null = null;
  const watch = Linking.addEventListener('url', (event: { url: string }) => {
    if (event.url.startsWith(APP_RETURN)) link = event.url;
  });
  let ended: string | null;
  try {
    const result = await WebBrowser.openAuthSessionAsync(url, APP_RETURN);
    if (result.type === 'success') ended = result.url;
    else {
      await new Promise((resolve) => setTimeout(resolve, LATE_LINK_MS));
      ended = link;
    }
  } catch (e) {
    throw new AccountError('failed', t('accountError.failed'), e);
  } finally {
    watch.remove();
  }
  if (!ended) return null;
  const tab = readTabResult(ended);
  if ('error' in tab) {
    if (tab.error === 'cancelled') return null;
    throw new AccountError('failed', t('accountError.failed'));
  }
  return accountClient.finish(tab.code, verifier);
}

/** The website finishes a sign-in when its page loads again; on a phone there's never one. */
export async function finishBrowserSignIn(_params: {
  code?: string;
  error?: string;
}): Promise<Account | null> {
  return null;
}
