// Daily limits, like the AI quota: so one account, or everyone together, can't run R2 past its free
// allowance (10 GB stored, 1 million writes and lists a month; reads stay far below theirs, since
// Workers Free stops at 100,000 requests a day). Counted in Durable Objects, one per account and
// one for everyone ("all"), never in Neon. A Durable Object handles one call at a time, so checking
// and counting can't race; days are UTC dates, like the free plans' own limits.
import { DurableObject } from 'cloudflare:workers';

const MB = 1024 * 1024;

export type Limits = { writes: number; bytes: number };

export const ACCOUNT_LIMITS: Limits = { writes: 150, bytes: 100 * MB };
/** About 775,000 writes a month and 9 GB, under R2's free 1 million and 10 GB. */
export const ALL_LIMITS: Limits = { writes: 25_000, bytes: 9 * 1024 * MB };

/** Picture uploads a day per account (src/pictures.ts), on top of the writes; counted in "all". */
export const PICTURES_PER_DAY = 500;

export type Usage = { day: string; writes: number; bytes: number; pictures?: number };
/** 'closed': the account was deleted, so its old tokens get nothing. */
export type Charge = 'ok' | 'writes' | 'bytes' | 'closed';

export const today = () => new Date().toISOString().slice(0, 10);

/**
 * One counter: today's writes (R2 writes and lists) and the bytes stored. An account's counter also
 * remembers that the account was deleted: tokens are checked without Neon, so this is what stops
 * the ones still on other devices (listing, writing and renewing all ask here).
 */
export class Counter extends DurableObject<Env> {
  async close(): Promise<void> {
    await this.ctx.storage.put('closed', true);
    await this.ctx.storage.delete('usage');
  }

  async isClosed(): Promise<boolean> {
    return (await this.ctx.storage.get<boolean>('closed')) === true;
  }

  private async usage(day: string): Promise<Usage> {
    const saved = await this.ctx.storage.get<Usage>('usage');
    if (!saved) return { day, writes: 0, bytes: 0 };
    return saved.day === day ? saved : { day, writes: 0, bytes: saved.bytes };
  }

  /** Counts one write adding `bytes`, if both stay within `limits`; otherwise counts nothing. */
  async charge(day: string, bytes: number, limits: Limits): Promise<Charge> {
    if (await this.isClosed()) return 'closed';
    const usage = await this.usage(day);
    if (usage.writes + 1 > limits.writes) return 'writes';
    if (bytes > 0 && usage.bytes + bytes > limits.bytes) return 'bytes';
    // Spread, so today's picture count (chargePicture) is kept.
    await this.ctx.storage.put('usage', {
      ...usage,
      writes: usage.writes + 1,
      bytes: usage.bytes + bytes,
    } satisfies Usage);
    return 'ok';
  }

  /** Counts one picture upload adding `bytes`, within today's pictures and the account's space. */
  async chargePicture(
    day: string,
    bytes: number,
    perDay: number,
    maxBytes: number,
  ): Promise<Charge> {
    if (await this.isClosed()) return 'closed';
    const usage = await this.usage(day);
    const pictures = usage.pictures ?? 0;
    if (pictures + 1 > perDay) return 'writes';
    if (usage.bytes + bytes > maxBytes) return 'bytes';
    await this.ctx.storage.put('usage', {
      ...usage,
      pictures: pictures + 1,
      bytes: usage.bytes + bytes,
    } satisfies Usage);
    return 'ok';
  }

  /** Gives back space: files removed, or a file that wasn't stored after all. */
  async release(day: string, bytes: number): Promise<void> {
    if (bytes <= 0) return;
    const usage = await this.usage(day);
    await this.ctx.storage.put('usage', { ...usage, bytes: Math.max(0, usage.bytes - bytes) });
  }
}

/**
 * Counts one write for the account and for everyone. The account's counter goes first: a write
 * the shared limit then refuses still counts for the account, so nobody can keep trying for free,
 * but its bytes are given back, since nothing gets stored.
 */
export async function chargeWrite(env: Env, account: string, bytes = 0): Promise<Charge> {
  const day = today();
  const mine = env.COUNTERS.getByName(account);
  const charged = await mine.charge(day, bytes, ACCOUNT_LIMITS);
  if (charged !== 'ok') return charged;
  const all = await env.COUNTERS.getByName('all').charge(day, bytes, ALL_LIMITS);
  if (all !== 'ok') await mine.release(day, bytes);
  return all;
}

/** Counts one picture upload: the account's pictures today and space, then everyone's writes. */
export async function chargePictureUpload(
  env: Env,
  account: string,
  bytes: number,
): Promise<Charge> {
  const day = today();
  const mine = env.COUNTERS.getByName(account);
  const charged = await mine.chargePicture(day, bytes, PICTURES_PER_DAY, ACCOUNT_LIMITS.bytes);
  if (charged !== 'ok') return charged;
  const all = await env.COUNTERS.getByName('all').charge(day, bytes, ALL_LIMITS);
  if (all !== 'ok') await mine.release(day, bytes);
  return all;
}

export async function releaseBytes(env: Env, account: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  const day = today();
  await Promise.all([
    env.COUNTERS.getByName(account).release(day, bytes),
    env.COUNTERS.getByName('all').release(day, bytes),
  ]);
}
