// "Continue with Apple": Apple's own sheet on an iPhone, the browser tab everywhere else (Android
// and the website, with Apple's Services ID). Apple is asked for no name or email.
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { t } from '@/lib/i18n';
import { AccountError, type Account } from '@/lib/sync/account';

import { accountClient } from './api';
import { signInInBrowser } from './browser';
import { appleNonce } from './secret';

/** Signs in with Apple; null if the person backed out. */
export async function signInWithApple(): Promise<Account | null> {
  if (Platform.OS !== 'ios') return signInInBrowser('apple');
  const { nonce, hashed } = await appleNonce();
  let identityToken: string | null;
  try {
    // The sheet passes the nonce to Apple as it is, so it gets the hash.
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [],
      nonce: hashed,
    });
    identityToken = credential.identityToken;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw new AccountError('failed', t('accountError.failed'), e);
  }
  if (!identityToken) throw new AccountError('failed', t('accountError.failed'));
  return accountClient.apple(identityToken, nonce);
}
