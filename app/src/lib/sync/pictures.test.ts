import { createPictureStore } from './http';
import {
  cleanDue,
  noPictureState,
  planPictures,
  readPictureState,
  RETRY_AFTER_MS,
  unusedOnServer,
  UNUSED_AFTER_MS,
} from './pictures';

const NOW = Date.UTC(2026, 10, 4, 12);
const pic = (n: number, ext = 'webp') => `${String(n).padStart(32, '0')}.${ext}`;

describe('which pictures a sync sends and fetches', () => {
  it('sends what this phone has and the server lacks, fetches what it lacks', () => {
    const state = { ...noPictureState(), sent: [pic(1)], skipped: [pic(2)] };
    const plan = planPictures(
      [pic(1), pic(2), pic(3), pic(4), pic(4)],
      new Set([pic(1), pic(2), pic(3)]),
      state,
      NOW,
    );
    expect(plan).toEqual({ upload: [pic(3)], download: [pic(4)] });
  });

  it('leaves names that are not an MD5 (they never sync), and limits each sync', () => {
    const plan = planPictures(
      ['photo.jpg', ...[5, 6, 7].map((n) => pic(n))],
      new Set(),
      noPictureState(),
      NOW,
      2,
    );
    expect(plan.download).toEqual([pic(5), pic(6)]);
  });

  it('asks again for a missing picture a day later', () => {
    const state = { ...noPictureState(), missing: { [pic(8)]: NOW - 1000 } };
    expect(planPictures([pic(8)], new Set(), state, NOW).download).toEqual([]);
    expect(planPictures([pic(8)], new Set(), state, NOW + RETRY_AFTER_MS).download).toEqual([
      pic(8),
    ]);
  });

  it('removes from the account only old pictures no card uses', () => {
    const listed = [
      { name: pic(1), uploaded: NOW - 2 * UNUSED_AFTER_MS },
      { name: pic(2), uploaded: NOW - 2 * UNUSED_AFTER_MS },
      { name: pic(3), uploaded: NOW - 1000 }, // its card may not have arrived yet
    ];
    expect(unusedOnServer(listed, new Set([pic(2)]), NOW)).toEqual([pic(1)]);
  });

  it('reads a saved state, whatever is in it', () => {
    expect(readPictureState(undefined)).toEqual(noPictureState());
    expect(readPictureState({ sent: [pic(1), 3], cleanedAt: 'x' })).toEqual({
      ...noPictureState(),
      sent: [pic(1)],
    });
    expect(cleanDue(noPictureState(), NOW)).toBe(true);
    expect(cleanDue({ ...noPictureState(), cleanedAt: NOW - 1000 }, NOW)).toBe(false);
  });
});

describe('pictures over HTTP', () => {
  function fakeFetch(...answers: { status: number; body?: unknown }[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const answer = answers.shift() ?? { status: 500 };
      const body =
        answer.body instanceof Uint8Array ? answer.body : JSON.stringify(answer.body ?? {});
      return new Response(body as BodyInit, { status: answer.status });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
  }

  it('uploads, fetches, lists and removes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { fetch, calls } = fakeFetch(
      { status: 201 },
      { status: 409 },
      { status: 413 },
      { status: 200, body: bytes },
      { status: 404 },
      { status: 200, body: { pictures: [{ name: pic(1), bytes: 3, uploaded: NOW }] } },
      { status: 200 },
    );
    const store = createPictureStore({ baseUrl: 'https://sync.test', token: () => 'tok', fetch });
    expect(await store.upload(pic(1), bytes)).toBe('stored');
    expect(await store.upload(pic(1), bytes)).toBe('exists');
    expect(await store.upload(pic(2), bytes)).toBe('refused');
    expect(await store.download(pic(1))).toEqual(bytes);
    expect(await store.download(pic(9))).toBeNull();
    expect(await store.list()).toEqual([{ name: pic(1), bytes: 3, uploaded: NOW }]);
    await store.remove([pic(1)]);
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      `PUT https://sync.test/v1/pictures/${pic(1)}`,
      `PUT https://sync.test/v1/pictures/${pic(1)}`,
      `PUT https://sync.test/v1/pictures/${pic(2)}`,
      `GET https://sync.test/v1/pictures/${pic(1)}`,
      `GET https://sync.test/v1/pictures/${pic(9)}`,
      'GET https://sync.test/v1/pictures',
      'POST https://sync.test/v1/pictures/remove',
    ]);
  });

  it('stops for the day once 500 pictures went up', async () => {
    const { fetch } = fakeFetch({ status: 429, body: { error: 'daily_limit' } });
    const store = createPictureStore({ baseUrl: 'https://sync.test', token: () => 'tok', fetch });
    await expect(store.upload(pic(1), new Uint8Array([1]))).rejects.toMatchObject({
      kind: 'paused',
    });
  });
});
