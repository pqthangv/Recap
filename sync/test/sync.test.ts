// The sync API against Miniflare's local R2. Each test uses new account ids, so tests never see
// each other's files.
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { MAX_FILE_BYTES } from '../src/files';
import { change, device, makeToken, ORIGIN } from './helpers';

describe('sync API', () => {
  it('answers /health without a token', async () => {
    const response = await SELF.fetch(`${ORIGIN}/health`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('turns away requests without a good token', async () => {
    const account = crypto.randomUUID();
    const bad = [
      undefined,
      'Bearer nonsense',
      `Bearer ${await makeToken(account, { secret: 'another-secret-that-is-32-characters-long' })}`,
      `Bearer ${await makeToken(account, { audience: 'something-else' })}`,
      `Bearer ${await makeToken(account, { expires: Math.floor(Date.now() / 1000) - 60 })}`,
      `Bearer ${await makeToken('not-an-account-id')}`,
    ];
    for (const auth of bad) {
      const headers: Record<string, string> = auth ? { Authorization: auth } : {};
      const response = await SELF.fetch(`${ORIGIN}/v1/files`, { headers });
      expect(response.status).toBe(401);
    }
  });

  it('stores a new file, and never overwrites one', async () => {
    const a = await device();
    expect((await a.create(change(1), '{"first":true}')).status).toBe(201);
    expect((await a.create(change(1), '{"second":true}')).status).toBe(409);
    const read = await a.read(change(1));
    expect(read.status).toBe(200);
    expect(await read.text()).toBe('{"first":true}');
    expect((await a.read(change(2))).status).toBe(404);
  });

  it('lists the files and the head, with the server clock', async () => {
    const a = await device();
    expect(await a.list()).toMatchObject({ head: null, names: [] });
    await a.create(change(2), '{}');
    await a.create(change(1), '{}');
    await a.create('cards/0000000002.json', '{}');
    await a.create('reviews/2026-11/0000000002.json', '{}');
    await a.swapHead(null, { base: 2, months: {}, prev: null });
    const listing = await a.list();
    expect(listing.names).toEqual([
      'cards/0000000002.json',
      change(1),
      change(2),
      'reviews/2026-11/0000000002.json',
    ]);
    expect(listing.head).toEqual({ base: 2, months: {}, prev: null });
    expect(Math.abs(listing.now - Date.now())).toBeLessThan(60_000);
  });

  // 1,005 files take about 4 seconds alone, more with the other test files running alongside: past
  // the usual 5-second limit (2026-11-05).
  it('lists more than one page of files', { timeout: 20_000 }, async () => {
    const a = await device();
    await Promise.all(
      Array.from({ length: 1005 }, (_, i) => env.FILES.put(`${a.account}/${change(i + 1)}`, '{}')),
    );
    expect((await a.list()).names).toHaveLength(1005);
  });

  it('keeps accounts apart', async () => {
    const a = await device();
    const b = await device();
    await a.create(change(1), '{"a":1}');
    expect((await b.read(change(1))).status).toBe(404);
    expect((await b.list()).names).toEqual([]);
    expect((await b.create(change(1), '{"b":1}')).status).toBe(201);
    expect(await (await a.read(change(1))).text()).toBe('{"a":1}');
  });

  it('only accepts the names sync uses', async () => {
    const a = await device();
    for (const name of ['head.json', 'changes/1.json', '..%2Fother/changes/0000000001.json', 'x']) {
      expect((await a.create(name, '{}')).status).toBe(400);
      expect((await a.read(name)).status).toBe(400);
    }
    expect((await a.remove(['head.json'])).status).toBe(400);
  });

  it('refuses files that are too big', async () => {
    const a = await device();
    const big = 'x'.repeat(MAX_FILE_BYTES + 1);
    expect((await a.create(change(1), big)).status).toBe(413);
    expect((await a.list()).names).toEqual([]);
  });

  it('replaces the head only if it is still the one the device saw', async () => {
    const a = await device();
    expect((await a.swapHead(null, { base: 20 })).status).toBe(200);
    expect((await a.swapHead(null, { base: 20 })).status).toBe(409);
    expect((await a.swapHead(10, { base: 30 })).status).toBe(409);
    expect((await a.swapHead(20, { base: 40 })).status).toBe(200);
    expect((await a.list()).head).toEqual({ base: 40 });
    expect((await a.swapHead(40, { base: -1 })).status).toBe(400);
    expect((await a.swapHead(40, 'nonsense')).status).toBe(400);
    expect((await a.call('/v1/head?base=x', { method: 'PUT', body: '{"base":1}' })).status).toBe(
      400,
    );
  });

  it('removes files', async () => {
    const a = await device();
    for (const n of [1, 2, 3]) await a.create(change(n), '{}');
    expect((await a.remove([change(1), change(2)])).status).toBe(200);
    expect((await a.list()).names).toEqual([change(3)]);
    expect((await a.remove('nonsense')).status).toBe(400);
  });

  it('lets the website call it, and no other site', async () => {
    const preflight = (origin: string) =>
      SELF.fetch(`${ORIGIN}/v1/files`, { method: 'OPTIONS', headers: { Origin: origin } });
    const allowed = await preflight('https://recapflashcards.com');
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://recapflashcards.com');
    expect(allowed.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    const other = await preflight('https://example.com');
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const a = await device();
    const response = await a.call('/v1/files', {
      headers: { Origin: 'https://recapflashcards.com' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://recapflashcards.com');
  });
});
