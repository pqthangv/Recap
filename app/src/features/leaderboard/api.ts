// The app's leaderboard client: the same sync Worker as signing in (features/sync/api.ts), with
// the account's token.
import { SYNC_URL } from '@/features/sync/api';
import { getAccount } from '@/features/sync/session';
import { createBoardClient } from '@/lib/leaderboard/client';

export const boardClient = createBoardClient({
  baseUrl: SYNC_URL,
  token: () => getAccount()?.token ?? '',
});
