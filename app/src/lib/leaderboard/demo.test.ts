import { DEMO_ME, DEMO_PEOPLE, DEMO_UPDATED_MINUTES_AGO, demoView } from './demo';
import { displayNameProblem, usernameProblem } from './names';

const me = { streak: 15, weekCards: 180 };

it('only has names the board would take', () => {
  for (const person of [...DEMO_PEOPLE, DEMO_ME]) {
    expect([person.displayName, displayNameProblem(person.displayName)]).toEqual([
      person.displayName,
      null,
    ]);
    expect([person.username, usernameProblem(person.username)]).toEqual([person.username, null]);
  }
  const usernames = [...DEMO_PEOPLE, DEMO_ME].map((p) => p.username);
  expect(new Set(usernames).size).toBe(usernames.length);
});

it('ranks by streak with me among the others', () => {
  const view = demoView('everyone', 'streak', 0, me);
  expect(view.rows).toHaveLength(DEMO_PEOPLE.length + 1);
  const streaks = view.rows.map((r) => r.streak);
  expect(streaks).toEqual([...streaks].sort((a, b) => b - a));
  const mine = view.rows.find((r) => r.me);
  expect(mine).toMatchObject({ displayName: DEMO_ME.displayName, streak: 15, weekCards: 180 });
  expect(view.me).toEqual({ rank: mine?.rank, streak: 15, weekCards: 180 });
  // Medals for the first three, and me further down but on the first screen.
  expect(view.rows.slice(0, 3).map((r) => r.rank)).toEqual([1, 2, 3]);
  expect(mine?.rank).toBe(7);
});

it('gives equal scores the same rank, then skips', () => {
  const ranks = demoView('everyone', 'streak', 0, me).rows.map((r) => [r.streak, r.rank]);
  // Omar and Chloé both have 2 days.
  expect(ranks.slice(-3)).toEqual([
    [2, 16],
    [2, 16],
    [1, 18],
  ]);
});

it('ranks by this week, keeps only followed people on Friends, and filters', () => {
  const week = demoView('everyone', 'week', 0, me).rows.map((r) => r.weekCards);
  expect(week).toEqual([...week].sort((a, b) => b - a));

  const friends = demoView('friends', 'streak', 0, me).rows;
  expect(friends.every((r) => r.me || r.following)).toBe(true);
  expect(friends.length).toBe(DEMO_PEOPLE.filter((p) => p.following).length + 1);

  const active = demoView('everyone', 'streak', 50, { streak: 15, weekCards: 20 });
  expect(active.rows.every((r) => r.weekCards >= 50)).toBe(true);
  expect(active.me.rank).toBeNull();
});

it('says how old Everyone is, like the Worker; Friends is fresh', () => {
  expect(demoView('everyone', 'week', 0, me).updatedMinutesAgo).toBe(DEMO_UPDATED_MINUTES_AGO);
  expect(demoView('friends', 'streak', 0, me)).not.toHaveProperty('updatedMinutesAgo');
});
