// Store screenshots only (api.ts): the made-up board from lib/leaderboard/demo.ts, with this
// phone's own score as "me". Everything else does nothing and nothing goes to the server.
import { getBoardScore } from '@/db/stats';
import type { BoardClient } from '@/lib/leaderboard/client';
import { DEMO_ME, demoView } from '@/lib/leaderboard/demo';

const nothing = async () => {};

export const demoBoardClient = {
  view: async (tab, by, min = 0) => demoView(tab, by, min, getBoardScore()),
  me: async () => DEMO_ME,
  save: async () => DEMO_ME,
  leave: nothing,
  score: async () => true,
  follow: nothing,
  unfollow: nothing,
  block: nothing,
  unblock: nothing,
  report: nothing,
  blocked: async () => [],
} satisfies BoardClient;
