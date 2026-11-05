// What to tell someone when a leaderboard call didn't work. A sign-in the Worker no longer takes
// signs this device out, as syncing does (features/sync/engine.ts).
import { signOut } from '@/features/sync/engine';
import { t, type StringKey } from '@/lib/i18n';
import { BoardError, type BoardErrorKind } from '@/lib/leaderboard/client';

const TEXT: Record<BoardErrorKind, StringKey> = {
  offline: 'boardError.offline',
  signedOut: 'boardError.signedOut',
  notJoined: 'boardError.notJoined',
  notFound: 'boardError.notFound',
  taken: 'boardError.taken',
  tooMany: 'boardError.tooManyFollows',
  self: 'boardError.self',
  name: 'boardName.not_allowed',
  paused: 'boardError.paused',
  busy: 'boardError.busy',
  server: 'boardError.server',
};

/** `tooMany`: what "too many" means here (following 200 people, or today's 10 reports). */
export function problemText(error: unknown, tooMany?: StringKey): string {
  const kind = error instanceof BoardError ? error.kind : 'server';
  if (kind === 'signedOut') signOut();
  return t(kind === 'tooMany' && tooMany ? tooMany : TEXT[kind]);
}
