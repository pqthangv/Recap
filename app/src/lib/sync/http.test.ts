import { createHttpStore, SyncHttpError } from './http';
import { syncStatusText } from './status';

type Answer = { status: number; body?: unknown };

/** A fetch that gives these answers in turn and records what was asked. */
function fakeFetch(...answers: Answer[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = answers.shift() ?? { status: 500 };
    const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {});
    return new Response(answer.status === 204 ? null : text, { status: answer.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const storeWith = (...answers: Answer[]) => {
  const fake = fakeFetch(...answers);
  return {
    store: createHttpStore({ baseUrl: 'https://sync.test/', token: () => 'tok', ...fake }),
    ...fake,
  };
};

const kindOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(SyncHttpError);
  return (error as SyncHttpError).kind;
};

describe('the account files over HTTP', () => {
  it('lists, reads, creates, swaps the head and removes, with the token', async () => {
    const { store, calls } = storeWith(
      { status: 200, body: { head: null, names: ['changes/0000000001.json'], now: 5 } },
      { status: 200, body: '{"x":1}' },
      { status: 404, body: { error: 'not_found' } },
      { status: 201, body: { ok: true } },
      { status: 409, body: { error: 'taken' } },
      { status: 200, body: { ok: true } },
      { status: 409, body: { error: 'changed' } },
      { status: 200, body: { ok: true } },
    );
    expect(await store.list()).toEqual({ head: null, names: ['changes/0000000001.json'], now: 5 });
    expect(await store.read('changes/0000000001.json')).toBe('{"x":1}');
    expect(await store.read('changes/0000000002.json')).toBeNull();
    expect(await store.create('changes/0000000002.json', '{}')).toBe(true);
    expect(await store.create('changes/0000000002.json', '{}')).toBe(false);
    const head = { base: 2, months: {}, prev: null };
    expect(await store.swapHead(null, head)).toBe(true);
    expect(await store.swapHead(1, head)).toBe(false);
    await store.remove(['changes/0000000001.json']);

    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET https://sync.test/v1/files',
      'GET https://sync.test/v1/files/changes/0000000001.json',
      'GET https://sync.test/v1/files/changes/0000000002.json',
      'PUT https://sync.test/v1/files/changes/0000000002.json',
      'PUT https://sync.test/v1/files/changes/0000000002.json',
      'PUT https://sync.test/v1/head?base=none',
      'PUT https://sync.test/v1/head?base=1',
      'POST https://sync.test/v1/files/remove',
    ]);
    expect(
      calls.every((c) => (c.init.headers as Record<string, string>).Authorization === 'Bearer tok'),
    ).toBe(true);
    expect(JSON.parse(String(calls[7]!.init.body))).toEqual({ names: ['changes/0000000001.json'] });
  });

  it('turns the Worker’s refusals into what the app shows', async () => {
    expect(
      await kindOf(storeWith({ status: 401, body: { error: 'unauthorized' } }).store.list()),
    ).toBe('signedOut');
    expect(
      await kindOf(storeWith({ status: 429, body: { error: 'daily_limit' } }).store.list()),
    ).toBe('paused');
    expect(
      await kindOf(
        storeWith({ status: 507, body: { error: 'storage_full' } }).store.create('x', '{}'),
      ),
    ).toBe('full');
    expect(
      await kindOf(storeWith({ status: 429, body: { error: 'too_many_requests' } }).store.list()),
    ).toBe('busy');
    expect(
      await kindOf(
        storeWith({ status: 413, body: { error: 'too_large' } }).store.create('x', '{}'),
      ),
    ).toBe('server');
    expect(
      await kindOf(storeWith({ status: 502, body: '<html>Bad gateway</html>' }).store.list()),
    ).toBe('server');

    const offline = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof globalThis.fetch;
    const store = createHttpStore({ baseUrl: 'https://s', token: () => 't', fetch: offline });
    expect(await kindOf(store.list())).toBe('offline');
  });
});

describe('what Sync my cards says', () => {
  const NOW = new Date(2026, 10, 4, 15, 30).getTime();
  const status = (change = {}) => ({
    syncing: false,
    lastSyncedAt: null,
    problem: null,
    ...change,
  });

  it('says when it last synced', () => {
    expect(syncStatusText(status(), NOW)).toBe('Not synced yet');
    expect(syncStatusText(status({ lastSyncedAt: NOW - 20_000 }), NOW)).toBe(
      'Last synced just now',
    );
    expect(
      syncStatusText(status({ lastSyncedAt: new Date(2026, 10, 4, 9, 41).getTime() }), NOW),
    ).toBe('Last synced today at 9:41 AM');
    expect(
      syncStatusText(status({ lastSyncedAt: new Date(2026, 10, 2, 9, 41).getTime() }), NOW),
    ).toBe('Last synced Nov 2');
  });

  it('says it is syncing, or why it stopped', () => {
    expect(syncStatusText(status({ syncing: true, problem: 'offline' }), NOW)).toBe('Syncing…');
    expect(syncStatusText(status({ problem: 'paused', lastSyncedAt: NOW }), NOW)).toMatch(
      /paused until tomorrow/,
    );
    expect(syncStatusText(status({ problem: 'offline' }), NOW)).toMatch(/offline/);
  });
});
