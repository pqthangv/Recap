// The leaderboard through the sync Worker (sync/src/board.ts), with the account's sign-in token.
// The Worker's answers become BoardError kinds the screens can explain: signed out (401), not on
// the board, no such person, username taken, too many, a name it refused, paused until tomorrow
// (429 daily_limit), offline, or a server problem.
import type { BoardScore } from './score';

export type Tab = 'everyone' | 'friends';
export type Ranking = 'streak' | 'week';
export type Names = { displayName: string; username: string; anonymous: boolean };
/** My names; `hidden`: others see "Anonymous" because of reports or a word Recap doesn't allow. */
export type Profile = Names & { id: string; hidden: boolean };
/** Someone on the board. Names are null for anyone anonymous or hidden. */
export type Person = { id: string; displayName: string | null; username: string | null };
export type Row = Person & {
  rank: number;
  streak: number;
  weekCards: number;
  me?: true;
  following?: true;
};
/** The top of a board, and my place on it (`rank` null: a filter leaves me out). */
export type View = { rows: Row[]; me: { rank: number | null; streak: number; weekCards: number } };

export type BoardErrorKind =
  | 'offline'
  | 'signedOut'
  | 'notJoined'
  | 'notFound'
  | 'taken' // the username is someone else's
  | 'tooMany' // following 200, or 10 reports today
  | 'self'
  | 'name' // `code` says which name and why, e.g. "username_too_short"
  | 'paused' // the board's limit for today is used up
  | 'busy'
  | 'server';

export class BoardError extends Error {
  constructor(
    readonly kind: BoardErrorKind,
    /** The Worker's error code, e.g. "display_name_not_allowed". */
    readonly code = '',
    /** The underlying error, for logs. */
    readonly reason?: unknown,
  ) {
    super(code || kind);
  }
}

export function errorFromAnswer(status: number, code: string): BoardError {
  const error = (kind: BoardErrorKind) => new BoardError(kind, code, status);
  if (status === 401) return error('signedOut');
  if (code === 'not_joined') return error('notJoined');
  if (code === 'not_found') return error('notFound');
  if (code === 'username_taken') return error('taken');
  if (code === 'too_many') return error('tooMany');
  if (code === 'self') return error('self');
  if (/^(display_name|username)_/.test(code)) return error('name');
  if (code === 'daily_limit') return error('paused');
  if (status === 429) return error('busy');
  return error('server');
}

export type BoardClientOptions = {
  baseUrl: string;
  /** The account's current sign-in token. */
  token: () => string;
  fetch?: typeof fetch;
};

const TIMEOUT_MS = 30_000;

export function createBoardClient({ baseUrl, token, fetch: doFetch = fetch }: BoardClientOptions) {
  const base = `${baseUrl.replace(/\/+$/, '')}/v1/board`;

  async function call<T>(method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (e) {
      throw new BoardError('offline', '', e);
    } finally {
      clearTimeout(timer);
    }
    let answer: unknown = null;
    try {
      answer = await response.json();
    } catch {
      // Not JSON (e.g. a proxy error page).
    }
    if (!response.ok) {
      const code = (answer as { error?: unknown } | null)?.error;
      throw errorFromAnswer(response.status, typeof code === 'string' ? code : '');
    }
    if (answer === null) throw new BoardError('server', '', response.status);
    return answer as T;
  }

  const post = (path: string, body: unknown) => call<{ ok: true }>('POST', path, body);

  return {
    view(tab: Tab, by: Ranking, min = 0): Promise<View> {
      return call('GET', `?${new URLSearchParams({ tab, by, min: String(min) }).toString()}`);
    },

    /** My names, or null if I'm not on the board. */
    async me(): Promise<Profile | null> {
      try {
        return await call<Profile>('GET', '/me');
      } catch (e) {
        if (e instanceof BoardError && e.kind === 'notJoined') return null;
        throw e;
      }
    },

    /** Joins, or changes my names. */
    save(names: Names): Promise<Profile> {
      return call('PUT', '/me', names);
    },

    async leave(): Promise<void> {
      await call('POST', '/leave');
    },

    /** Sends my score; false if I'm not on the board. */
    async score(score: BoardScore): Promise<boolean> {
      try {
        await post('/score', score);
        return true;
      } catch (e) {
        if (e instanceof BoardError && e.kind === 'notJoined') return false;
        throw e;
      }
    },

    async follow(username: string): Promise<void> {
      await post('/follow', { username });
    },
    async unfollow(id: string): Promise<void> {
      await post('/unfollow', { id });
    },
    async block(id: string): Promise<void> {
      await post('/block', { id });
    },
    async unblock(id: string): Promise<void> {
      await post('/unblock', { id });
    },
    async report(id: string): Promise<void> {
      await post('/report', { id });
    },

    async blocked(): Promise<Person[]> {
      return (await call<{ people: Person[] }>('GET', '/blocked')).people;
    },
  };
}

export type BoardClient = ReturnType<typeof createBoardClient>;
