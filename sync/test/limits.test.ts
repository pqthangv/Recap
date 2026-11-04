// The daily limits (src/limits.ts): the counters themselves, and what the API answers when one is
// reached. Each test uses new account ids; the shared "all" counter is put back afterwards.
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { ACCOUNT_LIMITS, ALL_LIMITS, today, type Usage } from '../src/limits';
import { change, device } from './helpers';

const counter = (name: string) => env.COUNTERS.getByName(name);

const usage = (name: string) =>
  runInDurableObject(counter(name), (_, state) => state.storage.get<Usage>('usage'));

const setUsage = (name: string, value: Usage | undefined) =>
  runInDurableObject(counter(name), async (_, state) => {
    if (value) await state.storage.put('usage', value);
    else await state.storage.delete('usage');
  });

describe('daily limit counters', () => {
  const small = { writes: 2, bytes: 100 };

  it('counts writes and bytes, and refuses past the limits without counting', async () => {
    const c = counter(crypto.randomUUID());
    expect(await c.charge('2026-11-03', 60, small)).toBe('ok');
    expect(await c.charge('2026-11-03', 50, small)).toBe('bytes');
    expect(await c.charge('2026-11-03', 40, small)).toBe('ok');
    expect(await c.charge('2026-11-03', 0, small)).toBe('writes');
  });

  it('starts the writes over each day, and keeps the bytes', async () => {
    const name = crypto.randomUUID();
    const c = counter(name);
    await c.charge('2026-11-03', 90, small);
    await c.charge('2026-11-03', 0, small);
    expect(await c.charge('2026-11-03', 0, small)).toBe('writes');
    expect(await c.charge('2026-11-04', 0, small)).toBe('ok');
    // Yesterday's 90 bytes are still stored.
    expect(await c.charge('2026-11-04', 20, small)).toBe('bytes');
    expect(await usage(name)).toEqual({ day: '2026-11-04', writes: 1, bytes: 90 });
  });

  it('gives back space, never below nothing', async () => {
    const name = crypto.randomUUID();
    const c = counter(name);
    await c.charge('2026-11-03', 90, small);
    await c.release('2026-11-03', 30);
    expect((await usage(name))?.bytes).toBe(60);
    await c.release('2026-11-03', 500);
    expect((await usage(name))?.bytes).toBe(0);
  });
});

describe('daily limits in the API', () => {
  it('counts listing, creating and the head, but not reading', async () => {
    const a = await device();
    await a.list();
    await a.create(change(1), '{"x":1}');
    await a.swapHead(null, { base: 0 });
    await a.read(change(1));
    await a.read(change(1));
    expect(await usage(a.account)).toMatchObject({ writes: 3, bytes: 7 });
  });

  it('pauses an account for the day once its writes are used up', async () => {
    const a = await device();
    await setUsage(a.account, { day: today(), writes: ACCOUNT_LIMITS.writes, bytes: 0 });
    const listing = await a.call('/v1/files');
    expect(listing.status).toBe(429);
    expect(await listing.json()).toEqual({ error: 'daily_limit' });
    expect((await a.create(change(1), '{}')).status).toBe(429);
    expect((await a.swapHead(null, { base: 0 })).status).toBe(429);
    // Reading still works, and so does every other account.
    const b = await device();
    expect((await b.list()).names).toEqual([]);
  });

  it("refuses a file there's no room for, and removing files makes room", async () => {
    const a = await device();
    await a.create(change(1), 'x'.repeat(1000));
    const used = (await usage(a.account))!.bytes;
    await setUsage(a.account, {
      day: today(),
      writes: 1,
      bytes: ACCOUNT_LIMITS.bytes - 500 + used,
    });
    const refused = await a.create(change(2), 'x'.repeat(600));
    expect(refused.status).toBe(507);
    expect(await refused.json()).toEqual({ error: 'storage_full' });

    await a.remove([change(1)]);
    expect((await usage(a.account))!.bytes).toBe(ACCOUNT_LIMITS.bytes - 500);
    expect((await a.create(change(2), 'x'.repeat(400))).status).toBe(201);
  });

  it('a name that was taken gives its bytes back', async () => {
    const a = await device();
    await a.create(change(1), '{"first":1}');
    const before = (await usage(a.account))!;
    expect((await a.create(change(1), '{"second":2}')).status).toBe(409);
    expect(await usage(a.account)).toEqual({ ...before, writes: before.writes + 1 });
  });

  it("pauses everyone once the shared day's writes are used up", async () => {
    const saved = await usage('all');
    try {
      await setUsage('all', { day: today(), writes: ALL_LIMITS.writes, bytes: saved?.bytes ?? 0 });
      const a = await device();
      expect((await a.call('/v1/files')).status).toBe(429);
      // That try still counts for the account.
      expect((await usage(a.account))?.writes).toBe(1);
    } finally {
      await setUsage('all', saved);
    }
  });

  it('a file the shared limit refuses gives the account its bytes back', async () => {
    const saved = await usage('all');
    try {
      await setUsage('all', { day: today(), writes: 0, bytes: ALL_LIMITS.bytes });
      const a = await device();
      const refused = await a.create(change(1), 'x'.repeat(100));
      expect(refused.status).toBe(507);
      // The try counts, but nothing was stored.
      expect(await usage(a.account)).toEqual({ day: today(), writes: 1, bytes: 0 });
    } finally {
      await setUsage('all', saved);
    }
  });
});
