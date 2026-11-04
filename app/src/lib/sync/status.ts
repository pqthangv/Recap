// What Sync my cards says about syncing: "Last synced today at 9:41 AM", "Syncing…", or why the
// last sync stopped.
import { formatTimeOfDay } from '../format';
import { localeTag, t } from '../i18n';
import type { SyncHttpErrorKind } from './http';

export type SyncStatus = {
  syncing: boolean;
  /** When this device last finished a sync (ms), or null. */
  lastSyncedAt: number | null;
  /** Why the last sync stopped, until one finishes. */
  problem: SyncHttpErrorKind | null;
};

export function syncProblemText(kind: SyncHttpErrorKind): string {
  switch (kind) {
    case 'offline':
      return t('syncProblem.offline');
    case 'paused':
      return t('syncProblem.paused');
    case 'full':
      return t('syncProblem.full');
    case 'busy':
      return t('syncProblem.busy');
    case 'signedOut':
      return t('syncProblem.signedOut');
    case 'server':
      return t('syncProblem.server');
  }
}

export function syncStatusText({ syncing, lastSyncedAt, problem }: SyncStatus, now = Date.now()) {
  if (syncing) return t('account.syncing');
  if (problem) return syncProblemText(problem);
  if (lastSyncedAt === null) return t('account.notSynced');
  if (now - lastSyncedAt < 60_000) return t('account.syncedJustNow');
  const at = new Date(lastSyncedAt);
  if (at.toDateString() === new Date(now).toDateString()) {
    return t('account.syncedToday', {
      time: formatTimeOfDay(at.getHours() * 60 + at.getMinutes()),
    });
  }
  return t('account.syncedOn', {
    date: at.toLocaleDateString(localeTag(), { month: 'short', day: 'numeric' }),
  });
}
