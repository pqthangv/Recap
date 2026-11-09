// When the app syncs (roadmap 6.3): when Recap starts or comes back to the front (at most every 5
// minutes), when it goes to the background with changes to send, a moment after a study session
// or an import, and from Sync now. One sync at a time, never in the way of studying; offline it
// waits for next time. Each sync lists the account's files, which counts toward its 150 a day
// (sync/src/limits.ts), hence the gaps. After a sync the leaderboard gets the score, if it changed.
//
// Signing in (1.0.9): cards made here with no account join the account, as do the account's own.
// Cards that came from another account (on a shared iPad or computer) are asked about first, so
// one person's decks and streak don't end up in someone else's account.
import { useSyncExternalStore } from 'react';

import { getRawSetting, setRawSetting } from '@/db/settings';
import {
  changedAfter,
  databaseDevice,
  dropUnusedTutorial,
  forgetSyncState,
  hasUnsentChanges,
  loadSyncOwner,
  removeSharedRows,
  saveSyncOwner,
  sharedCardCount,
  type SyncOwner,
} from '@/db/sync';
import { sendScore } from '@/features/leaderboard/score';
import { BOARD_SENT_KEY, SYNC_LAST_KEY, SYNC_PICTURES_KEY } from '@/lib/settings';
import { AccountError, needsRenewal, tokenAccount, type Account } from '@/lib/sync/account';
import {
  createHttpStore,
  createPictureStore,
  SyncHttpError,
  type SyncHttpErrorKind,
} from '@/lib/sync/http';
import { sync, SyncError } from '@/lib/sync/round';
import type { SyncStatus } from '@/lib/sync/status';

import { accountClient, SYNC_URL } from './api';
import { syncPictures } from './pictures';
import { getAccount, setAccount } from './session';

/** Automatic syncs on start and coming back are at most this often. */
const OPEN_GAP_MS = 5 * 60_000;
/** After a session or an import, wait this long (more changes may follow). */
const SOON_MS = 2_000;

let status: SyncStatus | null = null;
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let soon: ReturnType<typeof setTimeout> | undefined;
// Bumped on signing out, so a sync still running then doesn't leave its progress behind.
let epoch = 0;

function current(): SyncStatus {
  if (!status) {
    const last = getRawSetting(SYNC_LAST_KEY);
    status = {
      syncing: false,
      lastSyncedAt: typeof last === 'number' ? last : null,
      problem: null,
    };
  }
  return status;
}

function update(change: Partial<SyncStatus>) {
  status = { ...current(), ...change };
  for (const listener of listeners) listener();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, current);
}

async function run(): Promise<void> {
  const account = getAccount();
  if (!account) return;
  const started = epoch;
  update({ syncing: true });
  const first = databaseDevice.loadState() === null;
  const options = { baseUrl: SYNC_URL, token: () => getAccount()?.token ?? account.token };
  const store = createHttpStore(options);
  try {
    const result = await sync(store, databaseDevice);
    if (epoch !== started) return forgetSyncState();
    // The cards here are this account's now (signing in to another one asks about them).
    const owner = tokenAccount(account.token);
    if (owner) {
      saveSyncOwner({ account: owner, sentAt: databaseDevice.loadState()?.sentAt ?? null });
    }
    // Signed in to an account that already had cards: this device's own tutorial isn't needed.
    if (first && result.read > 0) dropUnusedTutorial();
    // The cards are in; pictures follow. Their problems (offline, today's 500 used up) aren't the
    // cards' and are tried again next time, except a deleted account, which signs out below.
    try {
      await syncPictures(createPictureStore(options));
    } catch (e) {
      if (e instanceof SyncHttpError && e.kind === 'signedOut') throw e;
      console.warn('Pictures stopped', e);
    }
    if (epoch !== started) return forgetSyncState();
    const now = Date.now();
    setRawSetting(SYNC_LAST_KEY, now);
    update({ syncing: false, lastSyncedAt: now, problem: null });
    // With the other devices' cards in, the streak is the account's.
    void sendScore();
  } catch (e) {
    if (epoch !== started) return forgetSyncState();
    console.warn('Sync stopped', e);
    const kind: SyncHttpErrorKind =
      e instanceof SyncHttpError
        ? e.kind
        : e instanceof SyncError && e.reason === 'busy'
          ? 'busy'
          : 'server';
    if (kind === 'signedOut') signOut({ accountGone: true });
    update({ syncing: false, problem: kind });
  }
}

/** Syncs now (Sync now, signing in); joins a sync that's already running. */
export function syncNow(): Promise<void> {
  clearTimeout(soon);
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

/** On start and when Recap comes back: unless it synced in the last 5 minutes (and fine). */
export function syncOnOpen(now = Date.now()): void {
  if (!getAccount() || running) return;
  const last = current().lastSyncedAt;
  if (last !== null && now - last < OPEN_GAP_MS && !current().problem) return;
  void syncNow();
}

/** Leaving Recap: sends what changed here, right away (the app may be paused soon after). */
export function syncOnLeave(): void {
  if (!getAccount() || running) return;
  try {
    if (!hasUnsentChanges()) return;
  } catch (e) {
    console.warn('Could not check for changes', e);
    return;
  }
  void syncNow();
}

/** A moment after studying or importing, so the other devices get it soon. */
export function syncSoon(): void {
  if (!getAccount()) return;
  clearTimeout(soon);
  soon = setTimeout(() => void syncNow(), SOON_MS);
}

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
      signOut({ accountGone: true });
    }
  }
}

/** The account the cards here came from, if it isn't `account`'s (null: none, or the same). */
function otherOwner(account: Account): SyncOwner | null {
  const owner = loadSyncOwner();
  const id = tokenAccount(account.token);
  return owner && id && owner.account !== id ? owner : null;
}

/**
 * Signing in with `account` on a device that has another account's cards: ask what to do with
 * them before syncing (AccountScreen), or null if there's nothing to ask. `unsent`: some changes
 * here never reached that account, so removing the cards loses them.
 */
export function otherAccountCards(account: Account): { unsent: boolean } | null {
  const owner = otherOwner(account);
  if (!owner || sharedCardCount() === 0) return null;
  return { unsent: changedAfter(owner.sentAt) };
}

/**
 * Signs in and syncs. Another account's cards here (otherAccountCards) are either added to this
 * account ('add', as before 1.0.9) or removed from this device first ('remove': that account keeps
 * them). Without a choice, they're added if any are left, so nothing is ever removed unasked; with
 * none left, that account's leftovers (deleted cards, their answers, its settings) are removed.
 */
export function signIn(account: Account, theirCards?: 'add' | 'remove'): void {
  if (otherOwner(account)) {
    const remove = theirCards === 'remove' || (theirCards === undefined && sharedCardCount() === 0);
    if (remove) removeSharedRows();
    // Which pictures were sent was about that account's files; so was the owner.
    setRawSetting(SYNC_PICTURES_KEY, null);
    saveSyncOwner(null);
    forgetSyncState();
  }
  setAccount(account);
  void syncNow();
}

/**
 * Forgets the account on this device; the cards stay. The next sign-in starts afresh. Signing out
 * yourself remembers whose cards these are, so signing in to another account asks about them.
 * `accountGone`: the account was deleted, or the server no longer takes its token; the cards here
 * may be the only copy, so they count as this device's own again (the next sign-in adds them).
 * Which pictures were sent goes too: the next account needs them all (sending one the server
 * already has is harmless).
 */
export function signOut({ accountGone = false }: { accountGone?: boolean } = {}): void {
  epoch++;
  clearTimeout(soon);
  setAccount(null);
  forgetSyncState();
  if (accountGone) {
    saveSyncOwner(null);
    setRawSetting(SYNC_PICTURES_KEY, null);
  }
  setRawSetting(SYNC_LAST_KEY, null);
  setRawSetting(BOARD_SENT_KEY, null);
  update({ syncing: false, lastSyncedAt: null, problem: null });
}
