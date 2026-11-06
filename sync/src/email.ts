// "Continue with email" (roadmap 6.1): a 6-digit code, emailed through Resend's free plan (100 a
// day), that works for 10 minutes and 5 tries. Each address has a Durable Object (named by the
// address's HMAC, so the address is never stored) that keeps its code and how often it was sent.
// The store-review address takes a fixed code (REVIEW_CODE) and is never emailed.
import { DurableObject } from 'cloudflare:workers';

import { hex, hmac, sameText, sha256 } from './hash';
import { today, type Limits } from './limits';

export const CODE_MINUTES = 10;
export const CODE_TRIES = 5;
/** Per address: one email a minute and 5 a day. */
export const RESEND_SECONDS = 60;
export const EMAILS_PER_ADDRESS = 5;
/** Everyone together, under Resend's free 100 a day (counted by the "emails" Counter). */
export const EMAIL_LIMITS: Limits = { writes: 90, bytes: Number.MAX_SAFE_INTEGER };

export type Lang = 'en' | 'vi';

/** The address as typed, trimmed and lowercased, or null if it isn't one. */
export function emailAddress(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** The address's HMAC: the email account's subject, and its code keeper's name. */
export async function addressHash(env: Env, email: string): Promise<string> {
  return hex(await hmac(env.EMAIL_KEY, email));
}

export const isReviewAddress = (env: Env, email: string) =>
  Boolean(env.REVIEW_EMAIL) && email === env.REVIEW_EMAIL.toLowerCase();

export function newCode(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n! % 1_000_000).padStart(6, '0');
}

const codeHash = async (address: string, code: string) => hex(await sha256(`${address}:${code}`));

type Saved = {
  code?: { hash: string; expires: number; tries: number };
  sentAt: number;
  day: string;
  sentToday: number;
};

export type Send = 'ok' | 'wait' | 'address_limit';
export type Check = 'ok' | 'wrong' | 'expired';

/** One address's code and sending record. Handles one call at a time, so tries can't race. */
export class SignInCode extends DurableObject<Env> {
  private async saved(day: string): Promise<Saved> {
    const saved = await this.ctx.storage.get<Saved>('code');
    if (!saved) return { sentAt: 0, day, sentToday: 0 };
    return saved.day === day ? saved : { ...saved, day, sentToday: 0 };
  }

  /** Keeps a new code (its hash) if this address may get another email now. */
  async start(hash: string, now: number, day: string): Promise<Send> {
    const saved = await this.saved(day);
    if (now - saved.sentAt < RESEND_SECONDS * 1000) return 'wait';
    if (saved.sentToday >= EMAILS_PER_ADDRESS) return 'address_limit';
    await this.ctx.storage.put('code', {
      code: { hash, expires: now + CODE_MINUTES * 60_000, tries: 0 },
      sentAt: now,
      day,
      sentToday: saved.sentToday + 1,
    } satisfies Saved);
    return 'ok';
  }

  /** Checks a code. The right one works once; the 5th wrong try ends the code. */
  async check(hash: string, now: number): Promise<{ result: Check; triesLeft: number }> {
    const saved = await this.saved(today());
    const code = saved.code;
    if (!code || now > code.expires) return { result: 'expired', triesLeft: 0 };
    if (sameText(hash, code.hash)) {
      await this.ctx.storage.put('code', { ...saved, code: undefined } satisfies Saved);
      return { result: 'ok', triesLeft: 0 };
    }
    const tries = code.tries + 1;
    const left = CODE_TRIES - tries;
    await this.ctx.storage.put('code', {
      ...saved,
      code: left > 0 ? { ...code, tries } : undefined,
    } satisfies Saved);
    return left > 0 ? { result: 'wrong', triesLeft: left } : { result: 'expired', triesLeft: 0 };
  }
}

const keeper = (env: Env, address: string) => env.CODES.getByName(address);

/** Makes and keeps a code for the address; the code to email, or why there's none. */
export async function startCode(
  env: Env,
  address: string,
  now = Date.now(),
): Promise<{ code: string } | { refused: Send }> {
  const code = newCode();
  const result = await keeper(env, address).start(await codeHash(address, code), now, today());
  return result === 'ok' ? { code } : { refused: result };
}

export async function checkCode(env: Env, address: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return { result: 'wrong' as const, triesLeft: CODE_TRIES };
  return keeper(env, address).check(await codeHash(address, code), now);
}

const MESSAGES: Record<Lang, (code: string) => { subject: string; text: string }> = {
  en: (code) => ({
    subject: `Your Recap code: ${code}`,
    text:
      `Your code for signing in to Recap is ${code}.\n\n` +
      `It works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.\n`,
  }),
  vi: (code) => ({
    subject: `Mã Recap của bạn: ${code}`,
    text:
      `Mã đăng nhập Recap của bạn là ${code}.\n\n` +
      `Mã dùng được trong ${CODE_MINUTES} phút. Nếu bạn không yêu cầu mã này, bạn có thể bỏ qua email này.\n`,
  }),
};

/** Sends one plain email through Resend's API. False if Resend didn't take it. */
export async function sendEmail(
  env: Env,
  fetcher: typeof fetch,
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
  });
  return response.ok;
}

/** Emails the code. False if Resend didn't take it. */
export function sendCode(
  env: Env,
  fetcher: typeof fetch,
  email: string,
  code: string,
  lang: Lang,
): Promise<boolean> {
  const { subject, text } = MESSAGES[lang](code);
  return sendEmail(env, fetcher, email, subject, text);
}
