import { APP_LANGUAGES } from '@/lib/i18n';

import { DEMO_NAMES, DEMO_UPDATED_MINUTES_AGO, demoMe, demoPeople, demoView } from './demo';
import { displayNameProblem, usernameProblem } from './names';

const me = { streak: 15, weekCards: 180 };

it('names the people for every app language', () => {
  for (const lang of APP_LANGUAGES) {
    expect([lang, DEMO_NAMES[lang]?.people.length]).toEqual([lang, demoPeople('en').length]);
  }
});

it.each(APP_LANGUAGES)('only has names the board would take (%s)', (lang) => {
  const all = [...demoPeople(lang), demoMe(lang)];
  for (const person of all) {
    expect([person.displayName, displayNameProblem(person.displayName)]).toEqual([
      person.displayName,
      null,
    ]);
    expect([person.username, usernameProblem(person.username)]).toEqual([person.username, null]);
  }
  const usernames = all.map((p) => p.username);
  expect(new Set(usernames).size).toBe(usernames.length);
  const names = all.map((p) => p.displayName);
  expect(new Set(names).size).toBe(names.length);
});

it.each(APP_LANGUAGES)('keeps the same board in every language (%s)', (lang) => {
  const rows = demoView('everyone', 'streak', 0, me, lang).rows;
  const english = demoView('everyone', 'streak', 0, me, 'en').rows;
  expect(rows.map((r) => [r.streak, r.weekCards, r.rank, !!r.following, !!r.me])).toEqual(
    english.map((r) => [r.streak, r.weekCards, r.rank, !!r.following, !!r.me]),
  );
  // The screenshot flows wait for the first person (scripts/screenshot-flows.js).
  expect(rows[0].displayName).toBe(DEMO_NAMES[lang]?.people[0][0]);
  expect(rows.find((r) => r.me)?.displayName).toBe(demoMe(lang).displayName);
});

it('ranks by streak with me among the others', () => {
  const view = demoView('everyone', 'streak', 0, me, 'en');
  expect(view.rows).toHaveLength(demoPeople('en').length + 1);
  const streaks = view.rows.map((r) => r.streak);
  expect(streaks).toEqual([...streaks].sort((a, b) => b - a));
  const mine = view.rows.find((r) => r.me);
  expect(mine).toMatchObject({ displayName: demoMe('en').displayName, streak: 15, weekCards: 180 });
  expect(view.me).toEqual({ rank: mine?.rank, streak: 15, weekCards: 180 });
  // Medals for the first three, and me further down but on the first screen.
  expect(view.rows.slice(0, 3).map((r) => r.rank)).toEqual([1, 2, 3]);
  expect(mine?.rank).toBe(7);
});

it('gives equal scores the same rank, then skips', () => {
  const ranks = demoView('everyone', 'streak', 0, me, 'en').rows.map((r) => [r.streak, r.rank]);
  // Omar and Chloé both have 2 days.
  expect(ranks.slice(-3)).toEqual([
    [2, 16],
    [2, 16],
    [1, 18],
  ]);
});

it('ranks by this week, keeps only followed people on Friends, and filters', () => {
  const week = demoView('everyone', 'week', 0, me, 'en').rows.map((r) => r.weekCards);
  expect(week).toEqual([...week].sort((a, b) => b - a));

  const friends = demoView('friends', 'streak', 0, me, 'en').rows;
  expect(friends.every((r) => r.me || r.following)).toBe(true);
  expect(friends.length).toBe(demoPeople('en').filter((p) => p.following).length + 1);

  const active = demoView('everyone', 'streak', 50, { streak: 15, weekCards: 20 }, 'en');
  expect(active.rows.every((r) => r.weekCards >= 50)).toBe(true);
  expect(active.me.rank).toBeNull();
});

it('says how old Everyone is, like the Worker; Friends is fresh', () => {
  expect(demoView('everyone', 'week', 0, me, 'en').updatedMinutesAgo).toBe(
    DEMO_UPDATED_MINUTES_AGO,
  );
  expect(demoView('friends', 'streak', 0, me, 'en')).not.toHaveProperty('updatedMinutesAgo');
});
