// The app's leaderboard client: the same sync Worker as signing in (features/sync/api.ts), with
// the account's token.
import { SYNC_URL } from '@/features/sync/api';
import { getAccount } from '@/features/sync/session';
import { createBoardClient, type BoardClient } from '@/lib/leaderboard/client';

import { demoBoardClient } from './demo';

/**
 * Store screenshots only: the app built with EXPO_PUBLIC_DEMO_BOARD=1 (only the screenshot job in
 * .github/workflows/ios.yml sets it) shows a made-up board without signing in (./demo.ts). Store
 * builds never set it, so there it's always off. Spelled out in full: Expo only fills in
 * process.env.EXPO_PUBLIC_… names written this way.
 */
export const DEMO_BOARD = process.env.EXPO_PUBLIC_DEMO_BOARD === '1';

export const boardClient: BoardClient = DEMO_BOARD
  ? demoBoardClient
  : createBoardClient({
      baseUrl: SYNC_URL,
      token: () => getAccount()?.token ?? '',
    });
