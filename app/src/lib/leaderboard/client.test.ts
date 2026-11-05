import { BoardError, createBoardClient } from './client';

type Answer = { status: number; body?: unknown };

/** A fetch that gives these answers in turn and records what was asked. */
function fakeFetch(...answers: Answer[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = answers.shift() ?? { status: 500 };
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const clientWith = (...answers: Answer[]) => {
  const fake = fakeFetch(...answers);
  return {
    client: createBoardClient({ baseUrl: 'https://sync.test/', token: () => 'tok', ...fake }),
    ...fake,
  };
};

const kindOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BoardError);
  return (error as BoardError).kind;
};

const ID = '6f9c1a52-1d55-4c3e-9a61-0f3b2e8c7d10';

describe('the leaderboard over HTTP', () => {
  it('asks for a board, with the token', async () => {
    const view = { rows: [], me: { rank: 1, streak: 2, weekCards: 30 } };
    const { client, calls } = clientWith({ status: 200, body: view });
    expect(await client.view('everyone', 'week', 50)).toEqual(view);
    expect(calls[0].url).toBe('https://sync.test/v1/board?tab=everyone&by=week&min=50');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('joins, reads my names (null when not on the board) and leaves', async () => {
    const names = { displayName: 'Lan', username: 'lan', anonymous: false };
    const profile = { ...names, id: ID, hidden: false };
    const { client, calls } = clientWith(
      { status: 404, body: { error: 'not_joined' } },
      { status: 200, body: profile },
      { status: 200, body: profile },
      { status: 200, body: { ok: true } },
    );
    expect(await client.me()).toBeNull();
    expect(await client.save(names)).toEqual(profile);
    expect(calls[1].init).toMatchObject({ method: 'PUT', body: JSON.stringify(names) });
    expect(await client.me()).toEqual(profile);
    await client.leave();
    expect(calls.map((c) => c.url.replace('https://sync.test/v1/board', ''))).toEqual([
      '/me',
      '/me',
      '/me',
      '/leave',
    ]);
  });

  it('sends a score: false when not on the board', async () => {
    const score = { streak: 3, streakUntil: 5, week: '2026-11-02', weekCards: 40 };
    const { client, calls } = clientWith(
      { status: 200, body: { ok: true } },
      { status: 404, body: { error: 'not_joined' } },
      { status: 429, body: { error: 'daily_limit' } },
    );
    expect(await client.score(score)).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual(score);
    expect(await client.score(score)).toBe(false);
    expect(await kindOf(client.score(score))).toBe('paused');
  });

  it('follows by username; blocks, reports and unfollows by id', async () => {
    const { client, calls } = clientWith(
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
      { status: 200, body: { people: [{ id: ID, displayName: null, username: null }] } },
    );
    await client.follow('lan');
    await client.unfollow(ID);
    await client.block(ID);
    await client.unblock(ID);
    await client.report(ID);
    expect(await client.blocked()).toEqual([{ id: ID, displayName: null, username: null }]);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ username: 'lan' });
    expect(JSON.parse(String(calls[4].init.body))).toEqual({ id: ID });
    expect(calls.map((c) => c.url.split('/v1/board')[1])).toEqual([
      '/follow',
      '/unfollow',
      '/block',
      '/unblock',
      '/report',
      '/blocked',
    ]);
  });

  it("turns the Worker's answers into kinds", async () => {
    const { client } = clientWith(
      { status: 401, body: { error: 'unauthorized' } },
      { status: 401, body: { error: 'account_deleted' } },
      { status: 404, body: { error: 'not_found' } },
      { status: 409, body: { error: 'username_taken' } },
      { status: 409, body: { error: 'too_many' } },
      { status: 400, body: { error: 'self' } },
      { status: 429, body: { error: 'too_many_requests' } },
      { status: 500 },
    );
    const names = { displayName: 'Lan', username: 'lan', anonymous: false };
    expect(await kindOf(client.view('friends', 'streak'))).toBe('signedOut');
    expect(await kindOf(client.save(names))).toBe('signedOut');
    expect(await kindOf(client.follow('nobody'))).toBe('notFound');
    expect(await kindOf(client.save(names))).toBe('taken');
    expect(await kindOf(client.follow('lan'))).toBe('tooMany');
    expect(await kindOf(client.report(ID))).toBe('self');
    expect(await kindOf(client.view('everyone', 'streak'))).toBe('busy');
    expect(await kindOf(client.view('everyone', 'streak'))).toBe('server');
  });

  it('keeps which name was refused, and says when offline', async () => {
    const { client } = clientWith({ status: 400, body: { error: 'username_not_allowed' } });
    const error = await client
      .save({ displayName: 'Lan', username: 'x', anonymous: false })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'name', code: 'username_not_allowed' });

    const offline = createBoardClient({
      baseUrl: 'https://sync.test',
      token: () => 'tok',
      fetch: (() => Promise.reject(new TypeError('Network request failed'))) as typeof fetch,
    });
    expect(await kindOf(offline.me())).toBe('offline');
  });
});
