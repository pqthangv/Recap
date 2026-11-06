// What to tell someone when a leaderboard call didn't work. A sign-in the Worker no longer takes
// signs this device out, as syncing does (features/sync/engine.ts).
import { signOut } from '@/features/sync/engine';
import { CONTACT_EMAIL } from '@/lib/contact';
import { t, type StringKey } from '@/lib/i18n';
import { BoardError, type BoardErrorKind, type Profile } from '@/lib/leaderboard/client';

/** Why others see me as Anonymous though I didn't choose it (and how to appeal), or null. */
export function hiddenNote(profile: Profile): string | null {
  if (profile.hiddenForGood) return t('board.youHiddenForGood', { email: CONTACT_EMAIL });
  return profile.hidden ? t('board.youHidden') : null;
}

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
