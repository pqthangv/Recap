// Store screenshots only: a made-up leaderboard, for the app built with EXPO_PUBLIC_DEMO_BOARD=1
// (features/leaderboard/api.ts; only the screenshot job sets it). The people are made up and
// nothing is sent anywhere; "me" is this phone's own score (the demo decks' streak). Ranked like
// sync/src/board.ts: by one score, then the other; equal scores share a rank (1, 2, 2, 4).
import type { Profile, Ranking, Row, Tab, View } from './client';

type DemoPerson = {
  displayName: string;
  username: string;
  streak: number;
  weekCards: number;
  following?: true;
};

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { displayName: 'Minh Anh', username: 'minhanh', streak: 132, weekCards: 412 },
  { displayName: 'Jonas', username: 'jonas.k', streak: 97, weekCards: 318 },
  { displayName: 'Priya', username: 'priya_s', streak: 64, weekCards: 287 },
  { displayName: 'Hana', username: 'hana.t', streak: 41, weekCards: 254 },
  { displayName: 'Diego', username: 'diego.r', streak: 28, weekCards: 233 },
  { displayName: 'Thảo', username: 'thao.ng', streak: 19, weekCards: 201, following: true },
  { displayName: 'Emma', username: 'emma.w', streak: 12, weekCards: 176, following: true },
  { displayName: 'Kenji', username: 'kenji', streak: 9, weekCards: 148 },
  { displayName: 'Lucas', username: 'lucas.m', streak: 8, weekCards: 162 },
  { displayName: 'Aisha', username: 'aisha.b', streak: 7, weekCards: 95 },
  { displayName: 'Quang', username: 'quang.vu', streak: 6, weekCards: 120, following: true },
  { displayName: 'Sofia', username: 'sofia.l', streak: 5, weekCards: 133 },
  { displayName: 'Tom', username: 'tom_b', streak: 4, weekCards: 71 },
  { displayName: 'Mai', username: 'mai.pham', streak: 3, weekCards: 64 },
  { displayName: 'Omar', username: 'omar.h', streak: 2, weekCards: 52 },
  { displayName: 'Chloé', username: 'chloe', streak: 2, weekCards: 40 },
  { displayName: 'Bảo', username: 'bao.tran', streak: 1, weekCards: 33 },
];

export const DEMO_ME: Profile = {
  id: 'demo-me',
  displayName: 'Nam',
  username: 'nam',
  anonymous: false,
  hidden: false,
};

/** The board the Worker would answer (`min`: Everyone's "50+ cards this week" filter). */
export function demoView(
  tab: Tab,
  by: Ranking,
  min: number,
  me: { streak: number; weekCards: number },
): View {
  const { id, displayName, username } = DEMO_ME;
  const { streak, weekCards } = me;
  const mine: Row = { id, displayName, username, rank: 0, streak, weekCards, me: true };
  const people: Row[] = DEMO_PEOPLE.map(({ following, ...person }, i) => ({
    id: `demo-${i + 1}`,
    rank: 0,
    ...person,
    ...(following ? { following } : {}),
  }));
  const shown =
    tab === 'friends'
      ? [mine, ...people.filter((p) => p.following)]
      : [mine, ...people].filter((p) => p.weekCards >= min);
  const score = (row: Row) => (by === 'streak' ? row.streak : row.weekCards);
  const other = (row: Row) => (by === 'streak' ? row.weekCards : row.streak);
  shown.sort((a, b) => score(b) - score(a) || other(b) - other(a));
  const rows = shown.map((row, i) => ({ ...row, rank: i + 1 }));
  for (const [i, row] of rows.entries()) {
    if (i > 0 && score(row) === score(rows[i - 1])) row.rank = rows[i - 1].rank;
  }
  return {
    rows,
    me: {
      rank: rows.find((row) => row.me)?.rank ?? null,
      streak: me.streak,
      weekCards: me.weekCards,
    },
  };
}
