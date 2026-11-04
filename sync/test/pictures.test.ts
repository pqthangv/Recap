// Pictures on cards (src/pictures.ts) against Miniflare's local R2. Each test uses a new account.
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { removeAccountFiles } from '../src/files';
import { hex } from '../src/hash';
import { ACCOUNT_LIMITS, PICTURES_PER_DAY, today, type Usage } from '../src/limits';
import { MAX_PICTURE_BYTES } from '../src/pictures';
import { change, device } from './helpers';

/** A PNG header for a `width` × `height` picture, plus `extra` random bytes (a new MD5 each time). */
function png(width = 640, height = 480, extra = 200) {
  const bytes = new Uint8Array(24 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 0);
  bytes.set(
    [...'IHDR'].map((c) => c.charCodeAt(0)),
    12,
  );
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  crypto.getRandomValues(bytes.subarray(24, 24 + Math.min(extra, 65_536)));
  return bytes;
}

const md5 = async (bytes: Uint8Array) =>
  hex(new Uint8Array(await crypto.subtle.digest('MD5', bytes)));
const nameOf = async (bytes: Uint8Array, extension = 'png') => `${await md5(bytes)}.${extension}`;

const usageOf = (account: string) =>
  runInDurableObject(env.COUNTERS.getByName(account), (_, state) =>
    state.storage.get<Usage>('usage'),
  );
const setUsage = (account: string, usage: Usage) =>
  runInDurableObject(env.COUNTERS.getByName(account), (_, state) =>
    state.storage.put('usage', usage),
  );

async function phone() {
  const d = await device();
  return {
    ...d,
    upload: (name: string, bytes: Uint8Array) =>
      d.call(`/v1/pictures/${name}`, { method: 'PUT', body: bytes }),
    picture: (name: string) => d.call(`/v1/pictures/${name}`),
    pictures: async () =>
      ((await (await d.call('/v1/pictures')).json()) as { pictures: { name: string }[] }).pictures,
    removePictures: (names: string[]) =>
      d.call('/v1/pictures/remove', { method: 'POST', body: JSON.stringify({ names }) }),
  };
}

describe('pictures', () => {
  it('stores a picture once, and gives it back', async () => {
    const a = await phone();
    const bytes = png();
    const name = await nameOf(bytes);
    expect((await a.upload(name, bytes)).status).toBe(201);
    expect((await a.upload(name, bytes)).status).toBe(409);

    const back = await a.picture(name);
    expect(back.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
    expect((await a.picture(await nameOf(png()))).status).toBe(404);

    expect((await a.pictures()).map((p) => p.name)).toEqual([name]);
    // Pictures aren't sync files.
    expect((await a.list()).names).toEqual([]);
    expect(await usageOf(a.account)).toMatchObject({ pictures: 1, bytes: bytes.length });
  });

  it("refuses what isn't a picture, a name that isn't its MD5, and pictures over 2 MB", async () => {
    const a = await phone();
    const text = new TextEncoder().encode('not a picture at all, just some text');
    const notPicture = await a.upload(await nameOf(text), text);
    expect(notPicture.status).toBe(415);

    const huge = png(20_000, 20_000);
    expect((await a.upload(await nameOf(huge), huge)).status).toBe(415);

    const bytes = png();
    const wrong = await a.upload(await nameOf(png()), bytes);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'wrong_name' });

    const big = png(640, 480, MAX_PICTURE_BYTES);
    expect((await a.upload(await nameOf(big), big)).status).toBe(413);
    expect((await a.call('/v1/pictures/../files', { method: 'PUT', body: bytes })).status).toBe(
      404,
    );
    expect(await a.pictures()).toEqual([]);
  });

  it('counts toward 500 a day and the account’s space; removing frees it', async () => {
    const a = await phone();
    await setUsage(a.account, { day: today(), writes: 0, bytes: 0, pictures: PICTURES_PER_DAY });
    const bytes = png();
    const name = await nameOf(bytes);
    const paused = await a.upload(name, bytes);
    expect(paused.status).toBe(429);
    expect(await paused.json()).toEqual({ error: 'daily_limit' });
    // Syncing cards isn't affected.
    expect((await a.create(change(1), '{}')).status).toBe(201);

    await setUsage(a.account, {
      day: today(),
      writes: 1,
      bytes: ACCOUNT_LIMITS.bytes - 10,
      pictures: 0,
    });
    expect((await a.upload(name, bytes)).status).toBe(507);

    await setUsage(a.account, { day: today(), writes: 1, bytes: 0, pictures: 0 });
    expect((await a.upload(name, bytes)).status).toBe(201);
    expect((await usageOf(a.account))?.bytes).toBe(bytes.length);
    expect((await a.removePictures([name])).status).toBe(200);
    expect((await usageOf(a.account))?.bytes).toBe(0);
    expect(await a.pictures()).toEqual([]);
  });

  it('go with the account when it’s deleted, and a deleted account can’t add more', async () => {
    const a = await phone();
    const bytes = png();
    await a.upload(await nameOf(bytes), bytes);
    await a.create(change(1), '{}');
    await removeAccountFiles(env.FILES, a.account);
    expect((await env.FILES.list({ prefix: `${a.account}/` })).objects).toEqual([]);

    await runInDurableObject(env.COUNTERS.getByName(a.account), (counter) =>
      (counter as unknown as { close(): Promise<void> }).close(),
    );
    const another = png();
    const closed = await a.upload(await nameOf(another), another);
    expect(closed.status).toBe(401);
    expect(await closed.json()).toEqual({ error: 'account_deleted' });
  });
});
