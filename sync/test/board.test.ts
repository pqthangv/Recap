// The leaderboard (src/board.ts, src/names.ts): the name filter, weeks, ranks and score caps, then
// the API, each test on a board of its own (Durable Object storage lasts the whole file).
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import {
  compare,
  MAX_WEEK_CARDS,
  ranked,
  REPORT_EMAILS_PER_DAY,
  REPORTS_TO_HIDE,
  SCORE_ROWS_PER_DAY,
  streakCap,
  weekOf,
  type Entry,
  type Profile,
  type View,
} from '../src/board';
import { handle } from '../src/index';
import { today } from '../src/limits';
import { displayNameProblem, isAllowed, usernameProblem } from '../src/names';
import type { Deps } from '../src/signin';
import { makeToken } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

describe('names', () => {
  it('lets ordinary names through, in English and Vietnamese', () => {
    for (const name of [
      'Lan Anh',
      'Nguyễn Văn Lớn',
      'Các Bạn Ơi',
      'Đeo Kính',
      'Buổi Sáng',
      'Thắng',
      'Dickens',
      'Toshiteru',
      'the.therapist',
      "O'Brien",
      'lan_2003',
      // Close to the staff words, but names.
      'Badminton Fan',
      'Kim Stafford',
      'Modern Lan',
      'Hồ Trọng',
      'Mẹ Lan',
      'Nam',
      'Nam Khánh',
      'Kỳ Duyên',
      'Backyard Lan',
    ]) {
      expect(isAllowed(name)).toBe(true);
    }
  });

  it('stops words from the lists, also spelled with digits, inside words or in pairs', () => {
    for (const name of [
      'Fuck',
      'xxfuckxx',
      's3x',
      'a55',
      'Big Ass',
      'lồn',
      'Con Cặc',
      'đéo biết',
      'vcl',
      'dit me',
      'thằng chó',
      'motherfucker99',
      'mmb',
      'Mẹ Mày Béo',
      'memaybeo123',
      'clgt',
      'Óc Chó',
      'oc cho',
      'Bắc Kỳ',
      'nam kỳ',
      'bac.ky',
      'namky',
    ]) {
      expect(isAllowed(name)).toBe(false);
    }
  });

  it('keeps names that pass for Recap or an anonymous row', () => {
    for (const name of [
      'Anonymous',
      'Ẩn danh',
      'an.danh',
      'recap',
      'Support',
      'Recap Admin',
      'the_admin',
      'adm1n',
      'admin.lan',
      'Recap Team',
      'Official Lan',
      'Support Team',
      'Mod',
      'Staff',
      'Quản Trị Viên',
      'Hỗ Trợ Recap',
      'Ban Điều Hành',
    ]) {
      expect(isAllowed(name)).toBe(false);
    }
  });

  it('checks a username and a display name', () => {
    expect(usernameProblem('ab')).toBe('too_short');
    expect(usernameProblem('a'.repeat(21))).toBe('too_long');
    expect(usernameProblem('lan anh')).toBe('characters');
    expect(usernameProblem('.lan')).toBe('characters');
    expect(usernameProblem('fuckit')).toBe('not_allowed');
    expect(usernameProblem('lan.anh_2003')).toBeNull();
    expect(displayNameProblem('')).toBe('too_short');
    expect(displayNameProblem('x'.repeat(31))).toBe('too_long');
    expect(displayNameProblem('Lan 🦉')).toBe('characters');
    expect(displayNameProblem('Trần Thị Ngọc Ánh')).toBeNull();
  });
});

describe('scores', () => {
  it('starts a week on Monday 00:00 UTC', () => {
    expect(weekOf(Date.UTC(2026, 10, 4, 12))).toBe('2026-11-02'); // a Wednesday
    expect(weekOf(Date.UTC(2026, 10, 2))).toBe('2026-11-02');
    expect(weekOf(Date.UTC(2026, 10, 1, 23, 59))).toBe('2026-10-26'); // Sunday night
  });

  it('lets a streak grow a day a day, never past the days since Recap began', () => {
    const now = Date.UTC(2026, 10, 20, 12);
    expect(streakCap({ streak: 0, score_at: 0 }, now)).toBe(41); // 2026-10-11 to 2026-11-20
    expect(streakCap({ streak: 5, score_at: now - 3 * 60 * 60_000 }, now)).toBe(6);
    expect(streakCap({ streak: 5, score_at: now - 3 * DAY }, now)).toBe(9);
    expect(streakCap({ streak: 40, score_at: now - 5 * DAY }, now)).toBe(41);
  });

  const entry = (id: string, streak: number, weekCards = 0, joined = 0): Entry => ({
    id,
    displayName: id,
    username: id,
    shown: true,
    streak,
    weekCards,
    joined,
  });

  it('ranks best first, with shared ranks for equal scores, and places my new score', () => {
    const others = [entry('a', 9), entry('b', 7), entry('c', 7, 0, 1), entry('d', 2)];
    const stale = entry('me', 1);
    const sorted = [...others, stale].sort(compare('streak'));
    const mine = entry('me', 7, 0, 5);
    const { top, myRank } = ranked(sorted, 'streak', mine, () => true, 10);
    expect(top.map((t) => [t.entry.id, t.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['me', 2],
      ['d', 5],
    ]);
    expect(myRank).toBe(2);
  });

  it('finds my rank past the top, and none when a filter leaves me out', () => {
    const sorted = Array.from({ length: 50 }, (_, i) => entry(`p${i}`, 100 - i, 60));
    const low = ranked(sorted, 'streak', entry('me', 1, 60), () => true, 10);
    expect(low.top).toHaveLength(10);
    expect(low.myRank).toBe(51);
    const filtered = ranked(sorted, 'streak', entry('me', 1, 10), (e) => e.weekCards >= 50, 10);
    expect(filtered.myRank).toBeNull();
    expect(filtered.top.some((t) => t.entry.id === 'me')).toBe(false);
  });
});

type Email = { to: string[]; subject: string; text: string };

/** The Worker with a board of its own, and Resend behind a fake fetch. */
function worker() {
  const emails: Email[] = [];
  const board = env.BOARD.getByName(crypto.randomUUID());
  const deps: Deps = {
    accounts: {} as Deps['accounts'],
    keys: {} as Deps['keys'],
    board,
    fetch: async (input, init) => {
      if (String(input) !== 'https://api.resend.com/emails')
        return new Response(null, { status: 404 });
      emails.push(JSON.parse(String(init?.body)) as Email);
      return Response.json({ id: 'sent' });
    },
  };
  /** One person's calls. */
  async function person(account = crypto.randomUUID()) {
    const auth = { Authorization: `Bearer ${await makeToken(account)}` };
    const call = (path: string, method = 'GET', body?: unknown) => {
      const text = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { ...auth };
      if (text) headers['Content-Length'] = String(new TextEncoder().encode(text).length);
      return handle(
        new Request(`https://sync.test/v1/${path}`, { method, body: text, headers }),
        env,
        deps,
      );
    };
    const join = async (displayName: string, username: string, anonymous = false) =>
      (await (
        await call('board/me', 'PUT', { displayName, username, anonymous })
      ).json()) as Profile;
    const view = async (query = '') => (await (await call(`board${query}`)).json()) as View;
    return { account, call, join, view };
  }
  return { emails, board, person };
}

const score = (streak: number, extra: Partial<Record<string, unknown>> = {}) => ({
  streak,
  streakUntil: Date.now() + DAY,
  week: weekOf(Date.now()),
  weekCards: 10,
  ...extra,
});

describe('the board API', () => {
  it('joins with checked names, keeps usernames unique, and changes them', async () => {
    const w = worker();
    const a = await w.person();
    const b = await w.person();
    expect((await a.call('board/me')).status).toBe(404);
    expect((await a.call('board')).status).toBe(404);
    const bad = await a.call('board/me', 'PUT', { displayName: 'Lồn', username: 'lan' });
    expect(await bad.json()).toEqual({ error: 'display_name_not_allowed' });
    const badUser = await a.call('board/me', 'PUT', { displayName: 'Lan', username: 'l' });
    expect(await badUser.json()).toEqual({ error: 'username_too_short' });

    const lan = await a.join('  Lan   Anh ', ' Lan.Anh ');
    expect(lan).toMatchObject({ displayName: 'Lan Anh', username: 'lan.anh', anonymous: false });
    expect(lan.hidden).toBe(false);
    const taken = await b.call('board/me', 'PUT', { displayName: 'B', username: 'LAN.ANH' });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'username_taken' });

    const changed = await a.join('Lan', 'lan', true);
    expect(changed).toMatchObject({ id: lan.id, displayName: 'Lan', anonymous: true });
    // The old username is free again.
    expect((await b.join('Bình', 'lan.anh')).username).toBe('lan.anh');
  });

  it('ranks everyone by streak or cards this week, with names hidden for anonymous people', async () => {
    const w = worker();
    const a = await w.person();
    const b = await w.person();
    const c = await w.person();
    await a.join('Anh', 'anh');
    await b.join('Bình', 'binh');
    await c.join('Chi', 'chi', true);
    await a.call('board/score', 'POST', score(3, { weekCards: 500 }));
    await b.call('board/score', 'POST', score(5, { weekCards: 20 }));
    await c.call('board/score', 'POST', score(4, { weekCards: 40 }));

    const byStreak = await a.view();
    expect(byStreak.rows.map((r) => [r.displayName, r.rank, r.streak])).toEqual([
      ['Bình', 1, 5],
      [null, 2, 4],
      ['Anh', 3, 3],
    ]);
    expect(byStreak.rows[2]!.me).toBe(true);
    expect(byStreak.me).toEqual({ rank: 3, streak: 3, weekCards: 500 });
    const byWeek = await a.view('?by=week');
    expect(byWeek.rows.map((r) => r.weekCards)).toEqual([500, 40, 20]);
    // Only people with 50+ cards this week: I'm first of one.
    const filtered = await b.view('?min=50');
    expect(filtered.rows.map((r) => r.displayName)).toEqual(['Anh']);
    expect(filtered.me.rank).toBeNull();
  });

  it('caps scores, and drops a streak once its day is over', async () => {
    const w = worker();
    const a = await w.person();
    await a.join('Anh', 'anh');
    await a.call('board/score', 'POST', score(9999, { weekCards: 999_999 }));
    const capped = (await a.view()).me;
    expect(capped.streak).toBe(streakCap({ streak: 0, score_at: 0 }, Date.now()));
    expect(capped.weekCards).toBe(MAX_WEEK_CARDS);
    // Already on the board: a day at most.
    await a.call('board/score', 'POST', score(2));
    await a.call('board/score', 'POST', score(9));
    expect((await a.view()).me.streak).toBe(3);
    // Another week (a phone with a wrong date) keeps this week's count.
    await a.call('board/score', 'POST', score(3, { week: '2020-01-06', weekCards: 1 }));
    expect((await a.view()).me.weekCards).toBe(10);
    await a.call('board/score', 'POST', score(3, { streakUntil: Date.now() - 1 }));
    expect((await a.view()).me.streak).toBe(0);
    expect((await a.call('board/score', 'POST', { streak: -1 })).status).toBe(400);
  });

  it('follows by username; anonymous people drop out of Friends and can’t be found', async () => {
    const w = worker();
    const a = await w.person();
    const b = await w.person();
    const c = await w.person();
    await a.join('Anh', 'anh');
    await b.join('Bình', 'binh');
    await c.join('Chi', 'chi');
    expect((await a.call('board/follow', 'POST', { username: 'nobody' })).status).toBe(404);
    expect((await a.call('board/follow', 'POST', { username: 'anh' })).status).toBe(400);
    expect((await a.call('board/follow', 'POST', { username: ' Binh ' })).status).toBe(200);
    expect((await a.call('board/follow', 'POST', { username: 'chi' })).status).toBe(200);
    const friends = await a.view('?tab=friends');
    expect(friends.rows.map((r) => r.username).sort()).toEqual(['anh', 'binh', 'chi']);
    expect(friends.rows.find((r) => r.username === 'binh')!.following).toBe(true);
    // Following is one-way.
    expect((await b.view('?tab=friends')).rows.map((r) => r.username)).toEqual(['binh']);

    await b.join('Bình', 'binh', true);
    expect((await a.view('?tab=friends')).rows.map((r) => r.username).sort()).toEqual([
      'anh',
      'chi',
    ]);
    expect((await c.call('board/follow', 'POST', { username: 'binh' })).status).toBe(404);
    // Back when Anonymous is off: the follow was kept.
    await b.join('Bình', 'binh', false);
    expect((await a.view('?tab=friends')).rows).toHaveLength(3);
    const bId = (await a.view('?tab=friends')).rows.find((r) => r.username === 'binh')!.id;
    expect((await a.call('board/unfollow', 'POST', { id: bId })).status).toBe(200);
    expect((await a.view('?tab=friends')).rows).toHaveLength(2);
  });

  it('blocks: no follows either way, hidden from each other, listed for unblocking', async () => {
    const w = worker();
    const a = await w.person();
    const b = await w.person();
    const me = await a.join('Anh', 'anh');
    const them = await b.join('Bình', 'binh');
    await a.call('board/follow', 'POST', { username: 'binh' });
    await b.call('board/follow', 'POST', { username: 'anh' });

    expect((await a.call('board/block', 'POST', { id: them.id })).status).toBe(200);
    expect((await a.view()).rows.map((r) => r.username)).toEqual(['anh']);
    expect((await b.view()).rows.map((r) => r.username)).toEqual(['binh']);
    expect((await b.view('?tab=friends')).rows.map((r) => r.username)).toEqual(['binh']);
    expect((await b.call('board/follow', 'POST', { username: 'anh' })).status).toBe(404);
    expect((await a.call('board/block', 'POST', { id: me.id })).status).toBe(400);
    const blocked = await (await a.call('board/blocked')).json();
    expect(blocked).toEqual({ people: [{ id: them.id, displayName: 'Bình', username: 'binh' }] });

    await a.call('board/unblock', 'POST', { id: them.id });
    expect((await a.view()).rows).toHaveLength(2);
  });

  it(`emails reports, hides a name after ${REPORTS_TO_HIDE} people report it, until it’s changed`, async () => {
    const w = worker();
    const target = await w.person();
    const profile = await target.join('Rude Name', 'rude.name');
    const reporters = await Promise.all(
      Array.from({ length: REPORTS_TO_HIDE }, async (_, i) => {
        const p = await w.person();
        await p.join(`Reporter ${i}`, `reporter${i}`);
        return p;
      }),
    );
    const shownTo = async (p: (typeof reporters)[number]) =>
      (await p.view()).rows.find((r) => r.id === profile.id)!.displayName;
    for (const [i, p] of reporters.entries()) {
      expect((await p.call('board/report', 'POST', { id: profile.id })).status).toBe(200);
      if (i === 0) {
        // Reporting again changes nothing.
        expect((await p.call('board/report', 'POST', { id: profile.id })).status).toBe(200);
      }
      // Still shown one report short, hidden at the last (the board isn't looked at in between:
      // a hundred people make the test slow enough).
      if (i + 2 === REPORTS_TO_HIDE) expect(await shownTo(p)).toBe('Rude Name');
    }
    expect(await shownTo(reporters[0]!)).toBeNull();
    // Today's first ten are emailed, each with the way to /admin.
    expect(w.emails).toHaveLength(Math.min(REPORTS_TO_HIDE, REPORT_EMAILS_PER_DAY));
    expect(w.emails[0]).toMatchObject({ to: ['support@recapflashcards.com'] });
    expect(w.emails[0]!.text).toContain('rude.name');
    expect(w.emails[0]!.text).toContain('https://sync.test/admin');
    expect((await (await target.call('board/me')).json()) as Profile).toMatchObject({
      hidden: true,
    });
    // Nobody can follow a hidden name.
    const follow = await reporters[0]!.call('board/follow', 'POST', { username: 'rude.name' });
    expect(follow.status).toBe(404);

    // New names start over.
    expect((await target.join('Kind Name', 'kind.name')).hidden).toBe(false);
    const row = (await reporters[0]!.view()).rows.find((r) => r.id === profile.id)!;
    expect(row.displayName).toBe('Kind Name');
  });

  it(`emails at most ${REPORT_EMAILS_PER_DAY} reports a day`, async () => {
    const w = worker();
    const reporter = await w.person();
    await reporter.join('Reporter', 'reporter');
    const people = await Promise.all(
      Array.from({ length: REPORT_EMAILS_PER_DAY + 2 }, async (_, i) => {
        const p = await w.person();
        return p.join(`Person ${i}`, `person${i}`);
      }),
    );
    const statuses = [];
    for (const p of people) {
      statuses.push((await reporter.call('board/report', 'POST', { id: p.id })).status);
    }
    // One person's 10 a day, and as many emails.
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.at(-1)).toBe(409);
    expect(w.emails).toHaveLength(Math.min(10, REPORT_EMAILS_PER_DAY));
  });

  it('checks names again when showing them, so a word added to the list later hides old ones', async () => {
    const w = worker();
    const a = await w.person();
    const b = await w.person();
    await a.join('Anh', 'anh');
    const old = await b.join('Old Name', 'old.name');
    // As if it had been saved before "fuck" was on the list.
    await runInDurableObject(w.board, (_, state) => {
      state.storage.sql.exec(
        "update members set display_name = 'Fuck Off', username = 'fuck.off' where id = ?",
        old.id,
      );
    });
    const row = (await a.view()).rows.find((r) => r.id === old.id)!;
    expect(row).toMatchObject({ displayName: null, username: null });
    expect((await a.call('board/follow', 'POST', { username: 'fuck.off' })).status).toBe(404);
    // Its owner sees it, and that it's hidden.
    expect((await (await b.call('board/me')).json()) as Profile).toMatchObject({
      displayName: 'Fuck Off',
      hidden: true,
    });
  });

  it('leaving deletes my row; a deleted account can’t come back', async () => {
    const w = worker();
    const a = await w.person();
    const b = await w.person();
    await a.join('Anh', 'anh');
    await b.join('Bình', 'binh');
    await b.call('board/follow', 'POST', { username: 'anh' });
    expect((await a.call('board/leave', 'POST')).status).toBe(200);
    expect((await a.call('board/me')).status).toBe(404);
    expect((await b.view('?tab=friends')).rows.map((r) => r.username)).toEqual(['binh']);
    expect((await a.call('board/score', 'POST', score(1))).status).toBe(404);

    await env.COUNTERS.getByName(a.account).close();
    const rejoin = await a.call('board/me', 'PUT', { displayName: 'Anh', username: 'anh' });
    expect(rejoin.status).toBe(401);
  });

  it('takes no new scores once today’s rows are used up, and skips unchanged ones', async () => {
    const w = worker();
    const a = await w.person();
    await a.join('Anh', 'anh');
    const same = score(1);
    expect((await a.call('board/score', 'POST', same)).status).toBe(200);
    const written = () =>
      runInDurableObject(w.board, (_, state) =>
        state.storage.sql
          .exec<{ rows: number }>('select rows from written where day = ?', today())
          .toArray(),
      );
    await runInDurableObject(w.board, (instance) => {
      // What a restart would read back.
      (instance as unknown as { written: { day: string } }).written.day = '';
    });
    await runInDurableObject(w.board, (_, state) => {
      state.storage.sql.exec(
        'insert into written (day, rows) values (?, ?) on conflict (day) do update set rows = excluded.rows',
        today(),
        SCORE_ROWS_PER_DAY,
      );
    });
    expect(await written()).toEqual([{ rows: SCORE_ROWS_PER_DAY }]);
    // The same score needs no writing, so it's fine; a new one waits for tomorrow.
    expect((await a.call('board/score', 'POST', same)).status).toBe(200);
    const full = await a.call('board/score', 'POST', score(2));
    expect(full.status).toBe(429);
    expect(await full.json()).toEqual({ error: 'daily_limit' });
  });
});
