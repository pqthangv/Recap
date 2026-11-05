// Sends this device's score to the leaderboard (lib/leaderboard/score.ts says when): after each
// sync, on opening the Leaderboard and after joining. Its problems (offline, today's limit, not on
// the board) never get in the way: it tries again next time.
import { getRawSetting, setRawSetting } from '@/db/settings';
import { getBoardScore } from '@/db/stats';
import { getAccount } from '@/features/sync/session';
import { parseSent, shouldSend } from '@/lib/leaderboard/score';
import { BOARD_SENT_KEY } from '@/lib/settings';

import { boardClient } from './api';

let sending: Promise<void> | null = null;

/** Sends the score if it's time; `soon`: anything new goes now. Never throws. */
export function sendScore(soon = false): Promise<void> {
  sending ??= send(soon).finally(() => {
    sending = null;
  });
  return sending;
}

async function send(soon: boolean): Promise<void> {
  try {
    if (!getAccount()) return;
    const now = Date.now();
    const score = getBoardScore(now);
    if (!shouldSend(parseSent(getRawSetting(BOARD_SENT_KEY)), score, now, soon)) return;
    const joined = await boardClient.score(score);
    // Signed out meanwhile: that forgot the leaderboard too.
    if (!getAccount()) return;
    setRawSetting(BOARD_SENT_KEY, joined ? { joined, at: now, score } : { joined, at: now });
  } catch (e) {
    console.warn('Leaderboard score not sent', e);
  }
}

/** Joined or left here: the board has no score from this device. */
export function startOver(joined: boolean): void {
  setRawSetting(BOARD_SENT_KEY, { joined, at: Date.now() });
}

/** What the board says (on opening the Leaderboard); the last score stays if that's no news. */
export function noteJoined(joined: boolean): void {
  if (parseSent(getRawSetting(BOARD_SENT_KEY))?.joined !== joined) startOver(joined);
}
