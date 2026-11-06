// "Continue with Apple": Apple's own sheet on an iPhone, the browser tab everywhere else (Android
// and the website, with Apple's Services ID). Apple is asked for no name or email.
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { t } from '@/lib/i18n';
import { AccountError, type Account, type AppleProof } from '@/lib/sync/account';

import { accountClient } from './api';
import { appleTabForDeleting, signInInBrowser } from './browser';
import { appleNonce } from './secret';

/** Apple's sheet: its ID token, code and the nonce whose SHA-256 it was given; null if backed out. */
async function appleSheet(): Promise<{
  idToken: string;
  nonce: string;
  authorizationCode: string | null;
} | null> {
  const { nonce, hashed } = await appleNonce();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    // The sheet passes the nonce to Apple as it is, so it gets the hash.
    credential = await AppleAuthentication.signInAsync({ requestedScopes: [], nonce: hashed });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw new AccountError('failed', t('accountError.failed'), e);
  }
  if (!credential.identityToken) throw new AccountError('failed', t('accountError.failed'));
  return {
    idToken: credential.identityToken,
    nonce,
    authorizationCode: credential.authorizationCode,
  };
}

/** Signs in with Apple; null if the person backed out. */
export async function signInWithApple(): Promise<Account | null> {
  if (Platform.OS !== 'ios') return signInInBrowser('apple');
  const sheet = await appleSheet();
  return sheet ? accountClient.apple(sheet.idToken, sheet.nonce) : null;
}

/**
 * Apple once more before deleting an Apple account, so the Worker can end Recap's Sign in with
 * Apple (Apple requires it); null if the person backed out.
 */
export async function appleAgainForDeleting(): Promise<AppleProof | null> {
  if (Platform.OS !== 'ios') return appleTabForDeleting();
  const sheet = await appleSheet();
  if (!sheet) return null;
  if (!sheet.authorizationCode) throw new AccountError('failed', t('accountError.failed'));
  return { idToken: sheet.idToken, nonce: sheet.nonce, authorizationCode: sheet.authorizationCode };
}
