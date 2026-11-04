// Who this device is signed in as (roadmap 6.1), for every screen: read once from secure storage,
// then kept in memory. Signing out only forgets the account here; the cards stay.
import { useSyncExternalStore } from 'react';

import { t, type StringKey } from '@/lib/i18n';
import { AccountError, needsRenewal, type Account, type Provider } from '@/lib/sync/account';

import { accountClient } from './api';
import { accountStorage } from './storage';

let current: Account | null | undefined; // undefined: not read yet
const listeners = new Set<() => void>();

function parse(saved: string | null): Account | null {
  if (!saved) return null;
  try {
    const account = JSON.parse(saved) as Partial<Account>;
    return typeof account.token === 'string' && typeof account.provider === 'string'
      ? (account as Account)
      : null;
  } catch {
    return null;
  }
}

export function getAccount(): Account | null {
  if (current === undefined) {
    try {
      current = parse(accountStorage.read());
    } catch (e) {
      console.warn('Could not read the sign-in', e);
      current = null;
    }
  }
  return current;
}

export function setAccount(account: Account | null): void {
  current = account;
  if (account) accountStorage.write(JSON.stringify(account));
  else accountStorage.remove().catch((e: unknown) => console.warn('Could not sign out', e));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAccount(): Account | null {
  return useSyncExternalStore(subscribe, getAccount);
}

const SIGNED_IN_WITH: Record<Provider, StringKey> = {
  google: 'account.signedInGoogle',
  apple: 'account.signedInApple',
  email: 'account.signedInEmail',
};

/** "Signed in with Google". */
export const signedInWith = (account: Account) => t(SIGNED_IN_WITH[account.provider]);

/**
 * Gets a new token once this one is a week old (on app start and when Recap comes back), so anyone
 * who opens Recap within 90 days stays signed in. Offline, it waits for next time. A token the
 * Worker no longer takes signs this device out.
 */
export async function renewIfOld(now = Date.now()): Promise<void> {
  const account = getAccount();
  if (!account || !needsRenewal(account.token, now)) return;
  try {
    const token = await accountClient.renew(account.token);
    if (getAccount() === account) setAccount({ ...account, token });
  } catch (e) {
    if (e instanceof AccountError && e.kind === 'signedOut' && getAccount() === account) {
      setAccount(null);
    }
  }
}
