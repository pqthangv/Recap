// The website signs in with the whole page, not a popup: the site runs with
// Cross-Origin-Opener-Policy: same-origin (public/_headers, for the cards' storage), which cuts a
// popup off from the page that opened it once it visits Google or Apple. So the page goes there and
// comes back to /account?code=…, and the secret waits in sessionStorage (this tab only).
import { language, t } from '@/lib/i18n';
import { AccountError, type Account, type BrowserProvider } from '@/lib/sync/account';

import { accountClient } from './api';
import { browserSecret } from './secret';

const PENDING = 'recap_sign_in';

export async function signInInBrowser(provider: BrowserProvider): Promise<Account | null> {
  const { verifier, challenge } = await browserSecret();
  try {
    window.sessionStorage.setItem(PENDING, verifier);
  } catch (e) {
    throw new AccountError('failed', t('accountError.failed'), e);
  }
  const back = `${window.location.origin}/account`;
  window.location.assign(accountClient.startUrl(provider, back, challenge, language()));
  return new Promise<never>(() => {}); // the page is leaving
}

/** Finishes the sign-in /account was opened with (its ?code= or ?error=); null if none. */
export async function finishBrowserSignIn(params: {
  code?: string;
  error?: string;
}): Promise<Account | null> {
  if (!params.code && !params.error) return null;
  let verifier: string | null = null;
  try {
    verifier = window.sessionStorage.getItem(PENDING);
    window.sessionStorage.removeItem(PENDING);
  } catch {
    // No secret: treated like a failed sign-in below.
  }
  if (params.error === 'cancelled') return null;
  if (!params.code || !verifier) throw new AccountError('failed', t('accountError.failed'));
  return accountClient.finish(params.code, verifier);
}
