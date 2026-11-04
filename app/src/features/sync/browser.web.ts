// The website signs in with the whole page, not a popup: the site runs with
// Cross-Origin-Opener-Policy: same-origin (public/_headers, for the cards' storage), which cuts a
// popup off from the page that opened it once it visits Google or Apple. So the page goes there and
// comes back to /account?code=…, and the secret (and what the tab was for) waits in sessionStorage
// (this tab only).
import { language, t } from '@/lib/i18n';
import {
  AccountError,
  type Account,
  type AppleProof,
  type BrowserProvider,
} from '@/lib/sync/account';

import { accountClient } from './api';
import { browserSecret } from './secret';

export type TabReturn = { signedIn: Account } | { deleteProof: AppleProof };

const PENDING = 'recap_sign_in';
type Pending = { verifier: string; deleting: boolean };

async function leaveFor(provider: BrowserProvider, deleting: boolean): Promise<never> {
  const { verifier, challenge } = await browserSecret();
  try {
    window.sessionStorage.setItem(
      PENDING,
      JSON.stringify({ verifier, deleting } satisfies Pending),
    );
  } catch (e) {
    throw new AccountError('failed', t('accountError.failed'), e);
  }
  const back = `${window.location.origin}/account`;
  window.location.assign(accountClient.startUrl(provider, back, challenge, language(), deleting));
  return new Promise<never>(() => {}); // the page is leaving
}

export function signInInBrowser(provider: BrowserProvider): Promise<Account | null> {
  return leaveFor(provider, false);
}

export function appleTabForDeleting(): Promise<AppleProof | null> {
  return leaveFor('apple', true);
}

/** Finishes what /account was opened with (its ?code= or ?error=); null if nothing. */
export async function finishBrowserReturn(params: {
  code?: string;
  error?: string;
}): Promise<TabReturn | null> {
  if (!params.code && !params.error) return null;
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(window.sessionStorage.getItem(PENDING) ?? 'null') as Pending | null;
    window.sessionStorage.removeItem(PENDING);
  } catch {
    // No secret: treated like a failed sign-in below.
  }
  if (params.error === 'cancelled') return null;
  if (!params.code || !pending?.verifier)
    throw new AccountError('failed', t('accountError.failed'));
  const proof = { code: params.code, verifier: pending.verifier };
  if (pending.deleting) return { deleteProof: proof };
  return { signedIn: await accountClient.finish(proof.code, proof.verifier) };
}
