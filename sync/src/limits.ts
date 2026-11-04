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

export type Usage = { day: string; writes: number; bytes: number };
export type Charge = 'ok' | 'writes' | 'bytes';

export const today = () => new Date().toISOString().slice(0, 10);

/** One counter: today's writes (R2 writes and lists) and the bytes stored. */
export class Counter extends DurableObject<Env> {
  private async usage(day: string): Promise<Usage> {
    const saved = await this.ctx.storage.get<Usage>('usage');
    if (!saved) return { day, writes: 0, bytes: 0 };
    return saved.day === day ? saved : { day, writes: 0, bytes: saved.bytes };
  }

  /** Counts one write adding `bytes`, if both stay within `limits`; otherwise counts nothing. */
  async charge(day: string, bytes: number, limits: Limits): Promise<Charge> {
    const usage = await this.usage(day);
    if (usage.writes + 1 > limits.writes) return 'writes';
    if (bytes > 0 && usage.bytes + bytes > limits.bytes) return 'bytes';
    await this.ctx.storage.put('usage', {
      day,
      writes: usage.writes + 1,
      bytes: usage.bytes + bytes,
    });
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

export async function releaseBytes(env: Env, account: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  const day = today();
  await Promise.all([
    env.COUNTERS.getByName(account).release(day, bytes),
    env.COUNTERS.getByName('all').release(day, bytes),
  ]);
}
