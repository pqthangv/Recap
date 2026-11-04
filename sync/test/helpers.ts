// What the tests share: tokens, and the calls a device makes.
import { env, SELF } from 'cloudflare:test';
import { SignJWT } from 'jose';

import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../src/auth';

export const ORIGIN = 'https://sync.test';
export const change = (n: number) => `changes/${String(n).padStart(10, '0')}.json`;

export type Listing = { head: { base: number } | null; names: string[]; now: number };

export async function makeToken(
  account: string,
  { secret = env.TOKEN_SECRET, audience = TOKEN_AUDIENCE, expires = '1h' as string | number } = {},
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(account)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(new TextEncoder().encode(secret));
}

/** The calls a device makes, as one account. */
export async function device(account: string = crypto.randomUUID()) {
  const auth = `Bearer ${await makeToken(account)}`;
  const call = (path: string, init: RequestInit = {}) =>
    SELF.fetch(`${ORIGIN}${path}`, { ...init, headers: { Authorization: auth, ...init.headers } });
  return {
    account,
    call,
    list: async () => (await (await call('/v1/files')).json()) as Listing,
    read: (name: string) => call(`/v1/files/${name}`),
    create: (name: string, text: string) =>
      call(`/v1/files/${name}`, { method: 'PUT', body: text }),
    swapHead: (base: number | null, head: unknown) =>
      call(`/v1/head?base=${base ?? 'none'}`, { method: 'PUT', body: JSON.stringify(head) }),
    remove: (names: unknown) =>
      call('/v1/files/remove', { method: 'POST', body: JSON.stringify({ names }) }),
  };
}
