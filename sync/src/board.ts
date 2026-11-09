// The leaderboard (roadmap 6.8): one Durable Object, "board", with its own SQLite tables: who's on
// it (display name, username, Anonymous), their scores, who follows whom, blocks and reports.
// Not Neon, which would wake for every score, and not R2, whose files can't be ranked. Joining
// needs an account; account ids stay here (the app only sees each member's own random id).
//   GET  /v1/board?tab=<everyone|friends>&by=<streak|week>&min=<n>   the board
//   GET  /v1/board/me      my names, or 404 not_joined
//   PUT  /v1/board/me      {"displayName", "username", "anonymous"}: joins, or changes them
//   POST /v1/board/leave   deletes my row, follows, blocks and reports (a name Recap hid for good
//                          stays hidden if I join again: hidden_accounts)
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
// Reports: each one is emailed to REPORTS_TO (10 a day), and a name reported by 100 people is
// hidden (members.hidden = 1) until its owner changes it. The developer looks at reports on
// /admin (src/admin.ts): hide a name for good (hidden = 2), or show it again. As a backup, the
// same tables are in Cloudflare dashboard › Durable Objects › Board › Data Studio, object "board"
// (it shows SQL tables only, hence no key-value storage here).
//
// Durable Objects Free: 100,000 rows written a day for the whole Cloudflare account, and past it
// every Durable Object fails, the sync counters too (src/limits.ts: up to about 50,000 a day). So
// the board counts its own rows written and takes no scores past 20,000 a day, nothing past
// 25,000; scores have no indexes, and a score that didn't change isn't written. The everyone
// board is worked out from every row at most every 30 minutes (rows read, 5 million a day: about
// 100,000 members); someone joining, renaming, leaving or being hidden changes only their own
// place in it (`refresh`), so new scores show within 30 minutes, names right away.
//
// Words the developer blocks on /admin (`blocked_words`) stop new names and hide names already
// on the board, like the built-in lists in src/names.ts; the app doesn't know them, so the Worker
// refuses such a name when it's saved.
import { DurableObject } from 'cloudflare:workers';

import { EMAIL_LIMITS, sendEmail } from './email';
import { today } from './limits';
import {
  blockedWordIn,
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
/**
 * A name reported by this many people is hidden until its owner changes it (user, 2026-11-05:
 * high, so names are hidden by the developer on /admin, not by a few people together).
 */
export const REPORTS_TO_HIDE = 100;
/** The most names /admin lists. */
export const ADMIN_LIST = 200;
/** /admin's "Hidden by the filter" and a word's preview check this many members at most. */
export const ADMIN_SCAN = 5_000;
export const MAX_BLOCKED_WORDS = 500;
export const REPORTS_PER_PERSON = 10;
export const REPORT_EMAILS_PER_DAY = 10;
export const SCORE_ROWS_PER_DAY = 20_000;
export const ROWS_PER_DAY = 25_000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the everyone board is kept before it's worked out again (user, 2026-11-05: 30). */
export const CACHE_MS = 30 * 60_000;
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
/**
 * Mine, as I see it; `hidden`: other people see "Anonymous" because of reports or a word;
 * `hiddenForGood`: because Recap hid it on /admin (a new name doesn't help).
 */
export type Profile = Names & { id: string; hidden: boolean; hiddenForGood?: true };
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
/**
 * `me.rank` is null when a filter leaves me out. `updatedMinutesAgo` (Everyone only): how long ago
 * its scores were worked out, in whole minutes (it's kept up to CACHE_MS; the app says "Updated 12
 * min ago"). Friends is worked out on every visit, so it has none.
 */
export type View = {
  rows: Row[];
  me: { rank: number | null; streak: number; weekCards: number };
  updatedMinutesAgo?: number;
};
export type Report = {
  result: 'ok' | 'already' | 'too_many' | 'not_found' | 'self' | 'not_joined' | 'busy';
  /** What to email about it, when it's one of today's first ten. */
  email?: { id: string; displayName: string; username: string; reports: number };
};
/** A name on /admin: reported, or hidden by the developer. */
export type AdminName = {
  id: string;
  displayName: string;
  username: string;
  anonymous: boolean;
  /** 0 shown; 1 hidden after reports; 2 hidden for good. */
  hidden: number;
  reports: number;
  /** The newest report (0: none). */
  lastReport: number;
  /** A word list hides it too: the developer's word, "built-in", or null. */
  filteredBy: string | null;
};
/** A name on /admin hidden by a word: `word` is the developer's, or "built-in". */
export type FilteredName = NamesOf & { id: string; word: string };
/** Everything /admin shows. `check`: what blocking a word would hide now. */
export type AdminPage = {
  names: AdminName[];
  members: number;
  words: { word: string; at: number }[];
  filtered: FilteredName[];
  /** More members than ADMIN_SCAN: the filtered list and a check looked at the first ones only. */
  scanCapped: boolean;
  check?: { word: string; listed: boolean; builtIn: boolean; hides: FilteredName[] };
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

type NamesOf = { displayName: string; username: string };

/** Why a member's names are hidden by a word: the developer's word, "built-in", or null. */
function filteredBy(e: NamesOf, blocked: readonly string[]): string | null {
  if (!isAllowed(e.displayName) || !isAllowed(e.username)) return 'built-in';
  return blockedWordIn(e.displayName, blocked) ?? blockedWordIn(e.username, blocked);
}

const namesAllowed = (e: NamesOf, blocked: readonly string[]) => filteredBy(e, blocked) === null;

/** The first place in `list` (sorted by `order`) where `entry` goes. */
function placeOf(list: readonly Entry[], entry: Entry, order: (a: Entry, b: Entry) => number) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (order(list[mid]!, entry) <= 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

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
  /** The developer's blocked words, read once (null: not yet, or changed). */
  private wordList: string[] | null = null;

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
    // Accounts whose names Recap hid for good: kept after leaving, so joining again starts hidden;
    // gone with "Show again" on /admin or when the account is deleted. The account id only.
    sql.exec(`create table if not exists hidden_accounts (
      account text primary key, at integer not null
    ) without rowid`);
    // Words the developer blocked on /admin (cleanBlockedWord), with when.
    sql.exec(`create table if not exists blocked_words (
      word text primary key, at integer not null
    ) without rowid`);
  }

  private blockedWords(): string[] {
    this.wordList ??= this.exec<{ word: string }>('select word from blocked_words').rows.map(
      (r) => r.word,
    );
    return this.wordList;
  }

  private allowed(e: NamesOf): boolean {
    return namesAllowed(e, this.blockedWords());
  }

  /**
   * One member joined, changed names, was hidden or left: the cached everyone board takes that in
   * at their place, instead of being worked out again from every row.
   */
  private refresh(id: string) {
    const cached = this.everyone;
    if (!cached) return;
    const m = this.memberById(id);
    const entry = m ? entryOf(m, Date.now()) : null;
    for (const [list, by] of [
      [cached.byStreak, 'streak'],
      [cached.byWeek, 'week'],
    ] as const) {
      const at = list.findIndex((e) => e.id === id);
      if (at >= 0) list.splice(at, 1);
      if (entry) list.splice(placeOf(list, entry, compare(by)), 0, entry);
    }
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
      hidden: m.hidden > 0 || !this.allowed({ displayName: m.display_name, username: m.username }),
      ...(m.hidden === 2 ? { hiddenForGood: true as const } : {}),
    };
  }

  async profile(account: string): Promise<Profile | null> {
    const m = this.member(account);
    return m ? this.profileOf(m) : null;
  }

  /**
   * Joins, or changes my names; the built-in lists checked them already, the developer's words
   * are checked here.
   */
  async save(
    account: string,
    names: Names,
    now: number,
  ): Promise<
    Profile | 'username_taken' | 'busy' | 'display_name_not_allowed' | 'username_not_allowed'
  > {
    const words = this.blockedWords();
    if (blockedWordIn(names.displayName, words)) return 'display_name_not_allowed';
    if (blockedWordIn(names.username, words)) return 'username_not_allowed';
    if (this.writtenToday() >= ROWS_PER_DAY) return 'busy';
    const holder = this.exec<{ account: string }>(
      'select account from members where username = ?',
      names.username,
    ).rows[0];
    if (holder && holder.account !== account) return 'username_taken';
    const anonymous = names.anonymous ? 1 : 0;
    const m = this.member(account);
    if (!m) {
      // Someone Recap hid for good who left comes back hidden.
      const hiddenBefore =
        this.exec('select 1 from hidden_accounts where account = ?', account).rows.length > 0;
      this.exec(
        'insert into members (id, account, username, display_name, anonymous, hidden, joined_at) values (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        account,
        names.username,
        names.displayName,
        anonymous,
        hiddenBefore ? 2 : 0,
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
    const saved = this.member(account)!;
    this.refresh(saved.id);
    return this.profileOf(saved);
  }

  /**
   * Leaving: my row and everything about me, except that Recap hid my name for good.
   * `deletingAccount`: that goes too.
   */
  async leave(account: string, deletingAccount = false): Promise<void> {
    if (deletingAccount) this.exec('delete from hidden_accounts where account = ?', account);
    const m = this.member(account);
    if (!m) return;
    this.exec('delete from follows where follower = ? or followee = ?', m.id, m.id);
    this.exec('delete from blocks where blocker = ? or blocked = ?', m.id, m.id);
    this.exec('delete from reports where reporter = ? or reported = ?', m.id, m.id);
    this.exec('delete from members where id = ?', m.id);
    this.refresh(m.id);
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

  /** Everyone, sorted both ways; worked out again after CACHE_MS or in a new week (names: refresh). */
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
    let updatedMinutesAgo: number | undefined;
    if (tab === 'friends') {
      // Followed people who are anonymous or hidden drop out until that ends.
      const friends = this.exec<Member>(
        `select m.* from follows f join members m on m.id = f.followee
         where f.follower = ? and m.anonymous = 0 and m.hidden = 0`,
        m.id,
      )
        .rows.map((f) => entryOf(f, now))
        .filter((e) => this.allowed(e))
        .sort(compare(by));
      result = ranked(friends, by, mine, () => true, MAX_FOLLOWING + 1);
    } else {
      const blocked = this.blockedEither(m.id);
      const sorted = this.sortedEveryone(now);
      updatedMinutesAgo = Math.max(0, Math.floor((now - sorted.at) / 60_000));
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
      const named = me || (entry.shown && this.allowed(entry));
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
      ...(updatedMinutesAgo === undefined ? {} : { updatedMinutesAgo }),
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
      !this.allowed({ displayName: them.display_name, username: them.username }) ||
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
        this.allowed({ displayName: b.display_name, username: b.username });
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
      this.refresh(id);
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

  /** For /admin: reported names, newest report first, and the ones hidden for good. */
  async adminNames(): Promise<{ names: AdminName[]; members: number }> {
    const names = this.exec<{
      id: string;
      display_name: string;
      username: string;
      anonymous: number;
      hidden: number;
      reports: number;
      last_report: number;
    }>(
      `select m.id, m.display_name, m.username, m.anonymous, m.hidden,
         (select count(*) from reports r where r.reported = m.id) as reports,
         (select coalesce(max(r.at), 0) from reports r where r.reported = m.id) as last_report
       from members m
       where m.hidden > 0 or m.id in (select reported from reports)
       order by last_report desc, m.username
       limit ?`,
      ADMIN_LIST,
    ).rows.map((n): AdminName => ({
      id: n.id,
      displayName: n.display_name,
      username: n.username,
      anonymous: n.anonymous === 1,
      hidden: n.hidden,
      reports: n.reports,
      lastReport: n.last_report,
      filteredBy: filteredBy(
        { displayName: n.display_name, username: n.username },
        this.blockedWords(),
      ),
    }));
    const members = this.exec<{ n: number }>('select count(*) as n from members').rows[0]?.n ?? 0;
    return { names, members };
  }

  /**
   * For /admin: hides a member's names for good (others see "Anonymous", also after a rename or
   * leaving and joining again), or shows them again and forgets their reports. `who`: the member
   * id, or a username.
   */
  async adminSetHidden(
    who: { id: string } | { username: string },
    hide: boolean,
  ): Promise<string | null> {
    const m =
      'id' in who
        ? this.memberById(who.id)
        : (this.exec<Member>('select * from members where username = ?', who.username).rows[0] ??
          null);
    if (!m) return null;
    this.exec('update members set hidden = ? where id = ?', hide ? 2 : 0, m.id);
    if (hide) {
      this.exec(
        'insert into hidden_accounts (account, at) values (?, ?) on conflict (account) do nothing',
        m.account,
        Date.now(),
      );
    } else {
      this.exec('delete from reports where reported = ?', m.id);
      this.exec('delete from hidden_accounts where account = ?', m.account);
    }
    this.refresh(m.id);
    return m.username;
  }

  /** Members to check for /admin, at most ADMIN_SCAN (and whether there are more). */
  private scanMembers(): { rows: (NamesOf & { id: string })[]; capped: boolean } {
    const rows = this.exec<{ id: string; display_name: string; username: string }>(
      'select id, display_name, username from members order by joined_at limit ?',
      ADMIN_SCAN + 1,
    ).rows.map((r) => ({ id: r.id, displayName: r.display_name, username: r.username }));
    return { rows: rows.slice(0, ADMIN_SCAN), capped: rows.length > ADMIN_SCAN };
  }

  /** Everything /admin shows; `check`: a cleaned word to preview (what blocking it would hide). */
  async adminPage(check: string | null): Promise<AdminPage> {
    const { names, members } = await this.adminNames();
    const words = this.exec<{ word: string; at: number }>(
      'select word, at from blocked_words order by word',
    ).rows;
    const blocked = this.blockedWords();
    const { rows, capped } = this.scanMembers();
    const filtered: FilteredName[] = [];
    for (const row of rows) {
      const word = filteredBy(row, blocked);
      if (word && filtered.length < ADMIN_LIST) filtered.push({ ...row, word });
    }
    const page: AdminPage = { names, members, words, filtered, scanCapped: capped };
    if (check) {
      const hides = rows
        .filter(
          (row) => blockedWordIn(row.displayName, [check]) ?? blockedWordIn(row.username, [check]),
        )
        .map((row) => ({ ...row, word: check }));
      page.check = {
        word: check,
        listed: blocked.includes(check),
        builtIn: !isAllowed(check),
        hides,
      };
    }
    return page;
  }

  /** Blocks (or unblocks) a cleaned word; false when the list is full. */
  async adminSetWord(word: string, block: boolean): Promise<boolean> {
    if (block) {
      const { rows } = this.exec<{ n: number }>('select count(*) as n from blocked_words');
      if ((rows[0]?.n ?? 0) >= MAX_BLOCKED_WORDS) return false;
      this.exec(
        'insert into blocked_words (word, at) values (?, ?) on conflict (word) do nothing',
        word,
        Date.now(),
      );
    } else {
      this.exec('delete from blocked_words where word = ?', word);
    }
    this.wordList = null;
    return true;
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

async function emailReport(
  env: Env,
  deps: Deps,
  email: NonNullable<Report['email']>,
  adminUrl: string,
) {
  if (!env.REPORTS_TO || !env.RESEND_API_KEY) return;
  // Counted with the sign-in codes, under Resend's free 100 a day.
  const everyone = await env.COUNTERS.getByName('emails').charge(today(), 0, EMAIL_LIMITS);
  if (everyone !== 'ok') return;
  const text =
    `A name on the Recap leaderboard was reported (${email.reports} so far; ` +
    `${REPORTS_TO_HIDE} hide it until it's changed).\n\n` +
    `Display name: ${email.displayName}\nUsername: ${email.username}\nMember id: ${email.id}\n\n` +
    `To hide it for good, or show it again: ${adminUrl} (user "admin", password ADMIN_TOKEN).\n` +
    `Backup: Cloudflare dashboard > Durable Objects > Board > Data Studio, object ` +
    `"${BOARD_NAME}", table members: set hidden to 2.\n`;
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
    // A word the developer blocked: the app shows it under the field, like its own checks.
    if (saved === 'display_name_not_allowed' || saved === 'username_not_allowed') {
      return fail(saved, 400);
    }
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
    if (email) await emailReport(env, deps, email, `${new URL(request.url).origin}/admin`);
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
