// The leaderboard (roadmap 6.8): one Durable Object, "board", with its own SQLite tables: who's on
// it (display name, username, Anonymous), their scores, who follows whom, blocks and reports.
// Not Neon, which would wake for every score, and not R2, whose files can't be ranked. Joining
// needs an account; account ids stay here (the app only sees each member's own random id).
//   GET  /v1/board?tab=<everyone|friends>&by=<streak|week>&min=<n>   the board
//   GET  /v1/board/me      my names, or 404 not_joined
//   PUT  /v1/board/me      {"displayName", "username", "anonymous"}: joins, or changes them
//   POST /v1/board/leave   deletes my row, follows, blocks and reports
//   POST /v1/board/score   {"streak", "streakUntil", "week", "weekCards"}, sent after a sync
//   POST /v1/board/follow  {"username"}
//   POST /v1/board/<unfollow|block|unblock|report>   {"id"}
//   GET  /v1/board/blocked the people I blocked
//
// Scores are counted on the phone, so the board caps them: a streak grows at most a day a day and
// is never longer than Recap is old, and at most 10,000 cards a week. "This week" starts Monday
// 00:00 UTC for everyone; a streak counts until its `streakUntil` (the end of the day after the
// last one studied, worked out on the phone), so nothing has to run when a day ends.
//
// Reports: each one is emailed to REPORTS_TO (10 a day), and a name reported by 3 people is hidden
// (members.hidden = 1) until its owner changes it. To look at reports, hide a name for good
// (hidden = 2) or remove someone: Cloudflare dashboard › Durable Objects › Board › Data Studio,
// object "board" (it shows SQL tables only, hence no key-value storage here).
//
// Durable Objects Free: 100,000 rows written a day for the whole Cloudflare account, and past it
// every Durable Object fails, the sync counters too (src/limits.ts: up to about 50,000 a day). So
// the board counts its own rows written and takes no scores past 20,000 a day, nothing past
// 25,000; scores have no indexes, and a score that didn't change isn't written. The everyone
// board is worked out from every row at most every 10 minutes (rows read: 5 million a day).
import { DurableObject } from 'cloudflare:workers';

import { EMAIL_LIMITS, sendEmail } from './email';
import { today } from './limits';
import {
  cleanDisplayName,
  cleanUsername,
  displayNameProblem,
  isAllowed,
  usernameProblem,
} from './names';
import { smallBody, type Deps } from './signin';

/** The one board's name, also what to type in Data Studio. */
export const BOARD_NAME = 'board';

export const TOP = 100;
export const MAX_FOLLOWING = 200;
export const MAX_BLOCKED = 500;
export const MAX_WEEK_CARDS = 10_000;
/** A name reported by this many people is hidden until its owner changes it. */
export const REPORTS_TO_HIDE = 3;
export const REPORTS_PER_PERSON = 10;
export const REPORT_EMAILS_PER_DAY = 10;
export const SCORE_ROWS_PER_DAY = 20_000;
export const ROWS_PER_DAY = 25_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60_000;
/** Recap's first build: no streak is longer than the days since. */
const FIRST_DAY = Date.UTC(2026, 9, 11);
/** The end of tomorrow's study day is at most 2 days away; plus a clock change and some slack. */
const MAX_UNTIL_MS = 2 * DAY_MS + 2 * 60 * 60_000;
/** Today's rows written are saved after this many more (the count in memory goes first). */
const SAVE_EVERY = 100;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WEEK = /^\d{4}-\d{2}-\d{2}$/;

export type Tab = 'everyone' | 'friends';
export type Ranking = 'streak' | 'week';
export type Names = { displayName: string; username: string; anonymous: boolean };
/** Mine, as I see it; `hidden`: other people see "Anonymous" because of reports or a word. */
export type Profile = Names & { id: string; hidden: boolean };
export type Score = { streak: number; streakUntil: number; week: string; weekCards: number };
/** Names are null for an anonymous or hidden member. */
export type Row = {
  id: string;
  rank: number;
  displayName: string | null;
  username: string | null;
  streak: number;
  weekCards: number;
  me?: true;
  following?: true;
};
/** `me.rank` is null when a filter leaves me out. */
export type View = { rows: Row[]; me: { rank: number | null; streak: number; weekCards: number } };
export type Report = {
  result: 'ok' | 'already' | 'too_many' | 'not_found' | 'self' | 'not_joined' | 'busy';
  /** What to email about it, when it's one of today's first ten. */
  email?: { id: string; displayName: string; username: string; reports: number };
};

type Member = {
  id: string;
  account: string;
  username: string;
  display_name: string;
  anonymous: number;
  /** 0 shown; 1 hidden after reports, shown again when renamed; 2 hidden by Recap, for good. */
  hidden: number;
  streak: number;
  streak_until: number;
  week: string;
  week_cards: number;
  /** When the score last changed (0: no score yet). */
  score_at: number;
  joined_at: number;
};

/** A member on the board, with today's scores. */
export type Entry = {
  id: string;
  displayName: string;
  username: string;
  shown: boolean;
  streak: number;
  weekCards: number;
  joined: number;
};

/** Monday 00:00 UTC of the week holding `now`, e.g. "2026-11-02". */
export function weekOf(now: number): string {
  const day = Math.floor(now / DAY_MS);
  // 1970-01-01 was a Thursday.
  const monday = day - ((day + 3) % 7);
  return new Date(monday * DAY_MS).toISOString().slice(0, 10);
}

function entryOf(m: Member, now: number): Entry {
  return {
    id: m.id,
    displayName: m.display_name,
    username: m.username,
    shown: !m.anonymous && !m.hidden,
    streak: now < m.streak_until ? m.streak : 0,
    weekCards: m.week === weekOf(now) ? m.week_cards : 0,
    joined: m.joined_at,
  };
}

const namesAllowed = (e: { displayName: string; username: string }) =>
  isAllowed(e.displayName) && isAllowed(e.username);

const primary = (by: Ranking, e: Entry) => (by === 'streak' ? e.streak : e.weekCards);
const secondary = (by: Ranking, e: Entry) => (by === 'streak' ? e.weekCards : e.streak);

/** Best first; ties go to whoever joined first. */
export const compare =
  (by: Ranking) =>
  (a: Entry, b: Entry): number =>
    primary(by, b) - primary(by, a) ||
    secondary(by, b) - secondary(by, a) ||
    a.joined - b.joined ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The first `limit` entries that `keep` takes, with ranks (equal scores share one: 1, 2, 2, 4), and
 * my rank. `sorted` may hold an old copy of mine: `mine` is the current one.
 */
export function ranked(
  sorted: readonly Entry[],
  by: Ranking,
  mine: Entry,
  keep: (e: Entry) => boolean,
  limit: number,
): { top: { entry: Entry; rank: number }[]; myRank: number | null } {
  const order = compare(by);
  const top: { entry: Entry; rank: number }[] = [];
  let myRank: number | null = null;
  let position = 0;
  let rank = 0;
  let last: number | undefined;
  const take = (entry: Entry) => {
    position++;
    const value = primary(by, entry);
    if (value !== last) {
      rank = position;
      last = value;
    }
    if (top.length < limit) top.push({ entry, rank });
    if (entry === mine) myRank = rank;
  };
  let mineLeft = keep(mine);
  for (const entry of sorted) {
    if (entry.id === mine.id || !keep(entry)) continue;
    if (mineLeft && order(mine, entry) <= 0) {
      take(mine);
      mineLeft = false;
    }
    if (!mineLeft && top.length >= limit) break;
    take(entry);
  }
  if (mineLeft) take(mine);
  return { top, myRank };
}

/** The longest streak a member may have now: one more a day since the last score. */
export function streakCap(m: Pick<Member, 'streak' | 'score_at'>, now: number): number {
  const sinceStart = Math.floor((now - FIRST_DAY) / DAY_MS) + 1;
  if (m.score_at === 0) return sinceStart;
  return Math.min(sinceStart, m.streak + Math.floor((now - m.score_at) / DAY_MS) + 1);
}

export class Board extends DurableObject<Env> {
  private written = { day: '', rows: 0, saved: 0 };
  private everyone: { at: number; week: string; byStreak: Entry[]; byWeek: Entry[] } | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`create table if not exists members (
      id text primary key,
      account text not null unique,
      username text not null unique,
      display_name text not null,
      anonymous integer not null default 0,
      hidden integer not null default 0,
      streak integer not null default 0,
      streak_until integer not null default 0,
      week text not null default '',
      week_cards integer not null default 0,
      score_at integer not null default 0,
      joined_at integer not null
    )`);
    sql.exec(`create table if not exists follows (
      follower text not null, followee text not null, primary key (follower, followee)
    ) without rowid`);
    sql.exec('create index if not exists follows_followee on follows (followee)');
    sql.exec(`create table if not exists blocks (
      blocker text not null, blocked text not null, primary key (blocker, blocked)
    ) without rowid`);
    sql.exec('create index if not exists blocks_blocked on blocks (blocked)');
    sql.exec(`create table if not exists reports (
      reporter text not null, reported text not null, at integer not null,
      primary key (reporter, reported)
    ) without rowid`);
    sql.exec('create index if not exists reports_reported on reports (reported)');
    sql.exec('create table if not exists written (day text primary key, rows integer not null)');
  }

  /** Runs a statement and counts the rows it wrote. */
  private exec<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: unknown[]) {
    const cursor = this.ctx.storage.sql.exec<T>(query, ...bindings);
    const rows = cursor.toArray();
    if (cursor.rowsWritten > 0) this.count(cursor.rowsWritten);
    return { rows, written: cursor.rowsWritten };
  }

  /** Rows written today, read once after a restart (it may have lost up to SAVE_EVERY). */
  private writtenToday(): number {
    const day = today();
    if (this.written.day !== day) {
      const saved = this.ctx.storage.sql
        .exec<{ rows: number }>('select rows from written where day = ?', day)
        .toArray()[0];
      this.written = { day, rows: saved?.rows ?? 0, saved: saved?.rows ?? 0 };
    }
    return this.written.rows;
  }

  private count(rows: number) {
    this.writtenToday();
    this.written.rows += rows;
    if (this.written.rows - this.written.saved < SAVE_EVERY) return;
    const { day } = this.written;
    this.written.saved = this.written.rows;
    const sql = this.ctx.storage.sql;
    sql.exec(
      'insert into written (day, rows) values (?, ?) on conflict (day) do update set rows = excluded.rows',
      day,
      this.written.rows,
    );
    sql.exec('delete from written where day < ?', day);
  }

  private member(account: string): Member | null {
    return this.exec<Member>('select * from members where account = ?', account).rows[0] ?? null;
  }

  private memberById(id: string): Member | null {
    return this.exec<Member>('select * from members where id = ?', id).rows[0] ?? null;
  }

  /** Whoever I blocked or who blocked me. */
  private blockedEither(id: string): Set<string> {
    const { rows } = this.exec<{ id: string }>(
      'select blocked as id from blocks where blocker = ? union select blocker from blocks where blocked = ?',
      id,
      id,
    );
    return new Set(rows.map((r) => r.id));
  }

  private profileOf(m: Member): Profile {
    return {
      id: m.id,
      displayName: m.display_name,
      username: m.username,
      anonymous: m.anonymous === 1,
      hidden: m.hidden > 0 || !namesAllowed({ displayName: m.display_name, username: m.username }),
    };
  }

  async profile(account: string): Promise<Profile | null> {
    const m = this.member(account);
    return m ? this.profileOf(m) : null;
  }

  /** Joins, or changes my names; the names were checked already. */
  async save(
    account: string,
    names: Names,
    now: number,
  ): Promise<Profile | 'username_taken' | 'busy'> {
    if (this.writtenToday() >= ROWS_PER_DAY) return 'busy';
    const holder = this.exec<{ account: string }>(
      'select account from members where username = ?',
      names.username,
    ).rows[0];
    if (holder && holder.account !== account) return 'username_taken';
    const anonymous = names.anonymous ? 1 : 0;
    const m = this.member(account);
    if (!m) {
      this.exec(
        'insert into members (id, account, username, display_name, anonymous, joined_at) values (?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        account,
        names.username,
        names.displayName,
        anonymous,
        now,
      );
    } else {
      const renamed = m.username !== names.username || m.display_name !== names.displayName;
      // New names start over: reports were about the old ones (a name Recap hid stays hidden).
      this.exec(
        'update members set username = ?, display_name = ?, anonymous = ?, hidden = ? where id = ?',
        names.username,
        names.displayName,
        anonymous,
        renamed && m.hidden === 1 ? 0 : m.hidden,
        m.id,
      );
      if (renamed) this.exec('delete from reports where reported = ?', m.id);
    }
    this.everyone = null;
    return this.profileOf(this.member(account)!);
  }

  /** Leaving (or deleting the account): my row and everything about me. */
  async leave(account: string): Promise<void> {
    const m = this.member(account);
    if (!m) return;
    this.exec('delete from follows where follower = ? or followee = ?', m.id, m.id);
    this.exec('delete from blocks where blocker = ? or blocked = ?', m.id, m.id);
    this.exec('delete from reports where reporter = ? or reported = ?', m.id, m.id);
    this.exec('delete from members where id = ?', m.id);
    this.everyone = null;
  }

  async score(
    account: string,
    score: Score,
    now: number,
  ): Promise<'ok' | 'unchanged' | 'not_joined' | 'busy'> {
    const m = this.member(account);
    if (!m) return 'not_joined';
    const until = Math.min(score.streakUntil, now + MAX_UNTIL_MS);
    const streak = until > now ? Math.min(score.streak, streakCap(m, now)) : 0;
    // A phone whose clock is in another week keeps the week's count it sent before.
    const thisWeek = weekOf(now);
    const week = score.week === thisWeek ? thisWeek : m.week;
    const weekCards =
      score.week === thisWeek ? Math.min(score.weekCards, MAX_WEEK_CARDS) : m.week_cards;
    const streakUntil = streak > 0 ? until : 0;
    if (
      streak === m.streak &&
      streakUntil === m.streak_until &&
      week === m.week &&
      weekCards === m.week_cards
    ) {
      return 'unchanged';
    }
    if (this.writtenToday() >= SCORE_ROWS_PER_DAY) return 'busy';
    this.exec(
      'update members set streak = ?, streak_until = ?, week = ?, week_cards = ?, score_at = ? where id = ?',
      streak,
      streakUntil,
      week,
      weekCards,
      now,
      m.id,
    );
    return 'ok';
  }

  /** Everyone, sorted both ways; worked out again after 10 minutes, a new week or a name change. */
  private sortedEveryone(now: number) {
    const week = weekOf(now);
    const cached = this.everyone;
    if (cached && now - cached.at < CACHE_MS && cached.week === week) return cached;
    const entries = this.exec<Member>('select * from members').rows.map((m) => entryOf(m, now));
    this.everyone = {
      at: now,
      week,
      byStreak: [...entries].sort(compare('streak')),
      byWeek: entries.sort(compare('week')),
    };
    return this.everyone;
  }

  async view(
    account: string,
    tab: Tab,
    by: Ranking,
    min: number,
    now: number,
  ): Promise<View | null> {
    const m = this.member(account);
    if (!m) return null;
    const mine = entryOf(m, now);
    const following = new Set(
      this.exec<{ id: string }>(
        'select followee as id from follows where follower = ?',
        m.id,
      ).rows.map((r) => r.id),
    );
    let result: ReturnType<typeof ranked>;
    if (tab === 'friends') {
      // Followed people who are anonymous or hidden drop out until that ends.
      const friends = this.exec<Member>(
        `select m.* from follows f join members m on m.id = f.followee
         where f.follower = ? and m.anonymous = 0 and m.hidden = 0`,
        m.id,
      )
        .rows.map((f) => entryOf(f, now))
        .filter(namesAllowed)
        .sort(compare(by));
      result = ranked(friends, by, mine, () => true, MAX_FOLLOWING + 1);
    } else {
      const blocked = this.blockedEither(m.id);
      const sorted = this.sortedEveryone(now);
      result = ranked(
        by === 'streak' ? sorted.byStreak : sorted.byWeek,
        by,
        mine,
        (e) => !blocked.has(e.id) && e.weekCards >= min,
        TOP,
      );
    }
    const rows = result.top.map(({ entry, rank }): Row => {
      const me = entry.id === m.id;
      const named = me || (entry.shown && namesAllowed(entry));
      return {
        id: entry.id,
        rank,
        displayName: named ? entry.displayName : null,
        username: named ? entry.username : null,
        streak: entry.streak,
        weekCards: entry.weekCards,
        ...(me ? { me: true as const } : {}),
        ...(following.has(entry.id) ? { following: true as const } : {}),
      };
    });
    return {
      rows,
      me: { rank: result.myRank, streak: mine.streak, weekCards: mine.weekCards },
    };
  }

  async follow(
    account: string,
    username: string,
  ): Promise<'ok' | 'not_joined' | 'not_found' | 'self' | 'too_many' | 'busy'> {
    const m = this.member(account);
    if (!m) return 'not_joined';
    const them = this.exec<Member>('select * from members where username = ?', username).rows[0];
    if (them?.id === m.id) return 'self';
    // Anonymous and hidden people can't be found, nor can anyone on either side of a block.
    if (
      !them ||
      them.anonymous ||
      them.hidden ||
      !namesAllowed({ displayName: them.display_name, username: them.username }) ||
      this.blockedEither(m.id).has(them.id)
    ) {
      return 'not_found';
    }
    const { rows } = this.exec<{ n: number }>(
      'select count(*) as n from follows where follower = ?',
      m.id,
    );
    if ((rows[0]?.n ?? 0) >= MAX_FOLLOWING) return 'too_many';
    if (this.writtenToday() >= ROWS_PER_DAY) return 'busy';
    this.exec('insert or ignore into follows (follower, followee) values (?, ?)', m.id, them.id);
    return 'ok';
  }

  async unfollow(account: string, id: string): Promise<'ok' | 'not_joined'> {
    const m = this.member(account);
    if (!m) return 'not_joined';
    this.exec('delete from follows where follower = ? and followee = ?', m.id, id);
    return 'ok';
  }

  /** Blocking also ends following, both ways. */
  async block(
    account: string,
    id: string,
  ): Promise<'ok' | 'not_joined' | 'not_found' | 'self' | 'too_many' | 'busy'> {
    const m = this.member(account);
    if (!m) return 'not_joined';
    if (id === m.id) return 'self';
    if (!this.memberById(id)) return 'not_found';
    const { rows } = this.exec<{ n: number }>(
      'select count(*) as n from blocks where blocker = ?',
      m.id,
    );
    if ((rows[0]?.n ?? 0) >= MAX_BLOCKED) return 'too_many';
    if (this.writtenToday() >= ROWS_PER_DAY) return 'busy';
    this.exec('insert or ignore into blocks (blocker, blocked) values (?, ?)', m.id, id);
    this.exec(
      'delete from follows where (follower = ? and followee = ?) or (follower = ? and followee = ?)',
      m.id,
      id,
      id,
      m.id,
    );
    return 'ok';
  }

  async unblock(account: string, id: string): Promise<'ok' | 'not_joined'> {
    const m = this.member(account);
    if (!m) return 'not_joined';
    this.exec('delete from blocks where blocker = ? and blocked = ?', m.id, id);
    return 'ok';
  }

  async blocked(account: string): Promise<Omit<Row, 'rank' | 'streak' | 'weekCards'>[] | null> {
    const m = this.member(account);
    if (!m) return null;
    return this.exec<Member>(
      'select m.* from blocks b join members m on m.id = b.blocked where b.blocker = ? order by m.username',
      m.id,
    ).rows.map((b) => {
      const named =
        !b.anonymous &&
        !b.hidden &&
        namesAllowed({ displayName: b.display_name, username: b.username });
      return {
        id: b.id,
        displayName: named ? b.display_name : null,
        username: named ? b.username : null,
      };
    });
  }

  async report(account: string, id: string, now: number): Promise<Report> {
    const m = this.member(account);
    if (!m) return { result: 'not_joined' };
    if (id === m.id) return { result: 'self' };
    const them = this.memberById(id);
    if (!them) return { result: 'not_found' };
    const dayStart = Date.parse(today());
    const mine = this.exec<{ n: number }>(
      'select count(*) as n from reports where reporter = ? and at >= ?',
      m.id,
      dayStart,
    ).rows[0];
    if ((mine?.n ?? 0) >= REPORTS_PER_PERSON) return { result: 'too_many' };
    if (this.writtenToday() >= ROWS_PER_DAY) return { result: 'busy' };
    const added = this.exec(
      'insert or ignore into reports (reporter, reported, at) values (?, ?, ?)',
      m.id,
      id,
      now,
    );
    if (added.written === 0) return { result: 'already' };
    const reports =
      this.exec<{ n: number }>('select count(*) as n from reports where reported = ?', id).rows[0]
        ?.n ?? 0;
    if (reports >= REPORTS_TO_HIDE && them.hidden === 0) {
      this.exec('update members set hidden = 1 where id = ?', id);
      this.everyone = null;
    }
    const todays =
      this.exec<{ n: number }>('select count(*) as n from reports where at >= ?', dayStart).rows[0]
        ?.n ?? 0;
    return {
      result: 'ok',
      ...(todays <= REPORT_EMAILS_PER_DAY
        ? { email: { id, displayName: them.display_name, username: them.username, reports } }
        : {}),
    };
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);

const PROBLEM_STATUS = { not_joined: 404, not_found: 404, self: 400, too_many: 409 } as const;

const isCount = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

/** The names in a join or change, checked and cleaned; or why they can't be used. */
function namesIn(body: Record<string, unknown> | null): Names | string {
  if (typeof body?.displayName !== 'string' || typeof body.username !== 'string') {
    return 'bad_request';
  }
  const displayName = cleanDisplayName(body.displayName);
  const username = cleanUsername(body.username);
  const nameProblem = displayNameProblem(displayName);
  if (nameProblem) return `display_name_${nameProblem}`;
  const usernameProblem_ = usernameProblem(username);
  if (usernameProblem_) return `username_${usernameProblem_}`;
  return { displayName, username, anonymous: body.anonymous === true };
}

async function emailReport(env: Env, deps: Deps, email: NonNullable<Report['email']>) {
  if (!env.REPORTS_TO || !env.RESEND_API_KEY) return;
  // Counted with the sign-in codes, under Resend's free 100 a day.
  const everyone = await env.COUNTERS.getByName('emails').charge(today(), 0, EMAIL_LIMITS);
  if (everyone !== 'ok') return;
  const text =
    `A name on the Recap leaderboard was reported (${email.reports} so far; ` +
    `${REPORTS_TO_HIDE} hide it until it's changed).\n\n` +
    `Display name: ${email.displayName}\nUsername: ${email.username}\nMember id: ${email.id}\n\n` +
    `To hide it for good, or remove the person: Cloudflare dashboard > Durable Objects > Board > ` +
    `Data Studio, object "${BOARD_NAME}", table members: set hidden to 2, or delete the row ` +
    `(and theirs in follows, blocks and reports).\n`;
  try {
    const sent = await sendEmail(
      env,
      deps.fetch,
      env.REPORTS_TO,
      'Recap leaderboard: a name was reported',
      text,
    );
    if (!sent) console.log('board: Resend refused a report email');
  } catch (error) {
    console.log('board: report email failed:', String(error));
  }
}

/** Answers /v1/board…, or null for any other path. */
export async function board(
  request: Request,
  env: Env,
  deps: Deps,
  account: string,
  path: string,
): Promise<Response | null> {
  const stub = deps.board;
  const { method } = request;
  const now = Date.now();

  if (path === 'board' && method === 'GET') {
    const params = new URL(request.url).searchParams;
    const tab: Tab = params.get('tab') === 'friends' ? 'friends' : 'everyone';
    const by: Ranking = params.get('by') === 'week' ? 'week' : 'streak';
    const min = Number(params.get('min') ?? 0);
    if (!isCount(min, MAX_WEEK_CARDS)) return fail('bad_request', 400);
    const view = await stub.view(account, tab, by, min, now);
    return view ? json(view) : fail('not_joined', 404);
  }
  if (path === 'board/me' && method === 'GET') {
    const profile = await stub.profile(account);
    return profile ? json(profile) : fail('not_joined', 404);
  }
  if (path === 'board/me' && method === 'PUT') {
    const names = namesIn(await smallBody(request));
    if (typeof names === 'string') return fail(names, 400);
    // An old token on another phone can't put a deleted account back on the board.
    if (await env.COUNTERS.getByName(account).isClosed()) return fail('account_deleted', 401);
    const saved = await stub.save(account, names, now);
    if (saved === 'username_taken') return fail(saved, 409);
    if (saved === 'busy') return fail('daily_limit', 429);
    return json(saved);
  }
  if (path === 'board/blocked' && method === 'GET') {
    const people = await stub.blocked(account);
    return people ? json({ people }) : fail('not_joined', 404);
  }
  if (method !== 'POST') return null;

  if (path === 'board/leave') {
    await stub.leave(account);
    return json({ ok: true });
  }
  const body = await smallBody(request);
  if (path === 'board/score') {
    const { streak, streakUntil, week, weekCards } = body ?? {};
    if (
      !isCount(streak, 100_000) ||
      !isCount(streakUntil, Number.MAX_SAFE_INTEGER) ||
      typeof week !== 'string' ||
      !WEEK.test(week) ||
      !isCount(weekCards, 1_000_000)
    ) {
      return fail('bad_score', 400);
    }
    const result = await stub.score(account, { streak, streakUntil, week, weekCards }, now);
    if (result === 'not_joined') return fail(result, 404);
    if (result === 'busy') return fail('daily_limit', 429);
    return json({ ok: true });
  }
  if (path === 'board/follow') {
    const username = typeof body?.username === 'string' ? cleanUsername(body.username) : '';
    if (!username) return fail('bad_request', 400);
    const result = await stub.follow(account, username);
    if (result === 'busy') return fail('daily_limit', 429);
    return result === 'ok' ? json({ ok: true }) : fail(result, PROBLEM_STATUS[result]);
  }
  const action = /^board\/(unfollow|block|unblock|report)$/.exec(path)?.[1];
  if (!action) return null;
  const id = typeof body?.id === 'string' && ID.test(body.id) ? body.id : null;
  if (!id) return fail('bad_request', 400);
  if (action === 'report') {
    const { result, email } = await stub.report(account, id, now);
    if (result === 'busy') return fail('daily_limit', 429);
    if (result !== 'ok' && result !== 'already') return fail(result, PROBLEM_STATUS[result]);
    if (email) await emailReport(env, deps, email);
    return json({ ok: true });
  }
  const result =
    action === 'unfollow'
      ? await stub.unfollow(account, id)
      : action === 'block'
        ? await stub.block(account, id)
        : await stub.unblock(account, id);
  if (result === 'busy') return fail('daily_limit', 429);
  return result === 'ok' ? json({ ok: true }) : fail(result, PROBLEM_STATUS[result]);
}
