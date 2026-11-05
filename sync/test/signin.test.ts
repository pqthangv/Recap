// Signing in (src/signin.ts), with Google, Apple and Resend played by a fake fetch, their keys made
// here, and accounts kept in memory (the tests have no Postgres; schema.sql is checked by
// `npm run smoke` against Neon).
import { env, runInDurableObject } from 'cloudflare:test';
import {
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  SignJWT,
  type CryptoKey,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Accounts, Identity } from '../src/accounts';
import { accountOf, TOKEN_DAYS } from '../src/auth';
import { EMAIL_LIMITS } from '../src/email';
import { base64url, hex, sha256 } from '../src/hash';
import { handle } from '../src/index';
import { today, type Usage } from '../src/limits';
import { APPLE_ISSUER, APPLE_REVOKE, APPLE_TOKEN, GOOGLE_TOKEN } from '../src/providers';
import type { Deps } from '../src/signin';

const WORKER = 'https://sync.test';
const APP = 'recapcards://signed-in';
const GOOGLE_CLIENT = 'test-client.apps.googleusercontent.com';
const TEAM = 'TEAM123456';
const KEY_ID = 'KEY1234567';

type Person = { sub: string; email?: string };
type Email = { from: string; to: string[]; subject: string; text: string };

let testEnv: Env;
let googleKey: CryptoKey;
let appleKey: CryptoKey;
let appleP8Public: CryptoKey;
let keys: Deps['keys'];

beforeAll(async () => {
  const google = await generateKeyPair('RS256', { extractable: true });
  const apple = await generateKeyPair('ES256', { extractable: true });
  const p8 = await generateKeyPair('ES256', { extractable: true });
  googleKey = google.privateKey;
  appleKey = apple.privateKey;
  appleP8Public = p8.publicKey;
  const jwk = async (key: CryptoKey, kid: string) => ({ ...(await exportJWK(key)), kid });
  keys = {
    google: createLocalJWKSet({ keys: [await jwk(google.publicKey, 'g1')] }),
    apple: createLocalJWKSet({ keys: [await jwk(apple.publicKey, 'a1')] }),
  };
  testEnv = {
    ...env,
    GOOGLE_CLIENT_ID: GOOGLE_CLIENT,
    APPLE_TEAM_ID: TEAM,
    APPLE_KEY_ID: KEY_ID,
    APPLE_PRIVATE_KEY: await exportPKCS8(p8.privateKey),
  };
});

const googleToken = (person: Person, audience = GOOGLE_CLIENT) =>
  new SignJWT({ email: person.email, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'g1' })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setSubject(person.sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(googleKey);

const appleToken = (sub: string, audience: string, nonce?: string) =>
  new SignJWT(nonce ? { nonce } : {})
    .setProtectedHeader({ alg: 'ES256', kid: 'a1' })
    .setIssuer(APPLE_ISSUER)
    .setAudience(audience)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(appleKey);

/** A Worker with fresh accounts, and Google, Apple and Resend behind a fake fetch. */
function worker(overrides: Partial<Env> = {}) {
  const ids = new Map<string, string>();
  const accounts: Accounts = {
    async signIn({ provider, subject }) {
      const key = `${provider}:${subject}`;
      const known = ids.get(key);
      const id = known ?? crypto.randomUUID();
      ids.set(key, id);
      return { id, created: !known };
    },
    async find(id) {
      const key = [...ids].find(([, value]) => value === id)?.[0];
      if (!key) return null;
      const [provider, ...rest] = key.split(':');
      return { provider: provider as Identity['provider'], subject: rest.join(':') };
    },
    async remove(id) {
      for (const [key, value] of ids) if (value === id) ids.delete(key);
    },
  };
  // What Google's or Apple's page knows about each code it handed out.
  const codes = new Map<string, Person & { challenge?: string }>();
  const emails: Email[] = [];
  const appleSecrets: string[] = [];
  const revoked: { clientId: string; token: string }[] = [];

  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = String(init?.body ?? '');
    if (url === GOOGLE_TOKEN) {
      const form = new URLSearchParams(body);
      const person = codes.get(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      if (!person || base64url(await sha256(verifier)) !== person.challenge) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      if (form.get('client_secret') !== env.GOOGLE_CLIENT_SECRET) {
        return Response.json({ error: 'invalid_client' }, { status: 401 });
      }
      return Response.json({ id_token: await googleToken(person) });
    }
    if (url === APPLE_TOKEN || url === APPLE_REVOKE) {
      const form = new URLSearchParams(body);
      // The Services ID (browser) or the bundle id (iPhone); the secret must be made for it.
      const clientId = form.get('client_id') ?? '';
      const secret = form.get('client_secret') ?? '';
      appleSecrets.push(secret);
      try {
        await jwtVerify(secret, appleP8Public, {
          issuer: TEAM,
          subject: clientId,
          audience: APPLE_ISSUER,
        });
      } catch {
        return Response.json({ error: 'invalid_client' }, { status: 400 });
      }
      if (url === APPLE_REVOKE) {
        revoked.push({ clientId, token: form.get('token') ?? '' });
        return new Response(null, { status: 200 });
      }
      const code = form.get('code') ?? '';
      const person = codes.get(code);
      if (!person) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({
        id_token: await appleToken(person.sub, clientId),
        refresh_token: `refresh-${code}`,
      });
    }
    if (url === 'https://api.resend.com/emails') {
      emails.push(JSON.parse(body) as Email);
      return Response.json({ id: 'sent' });
    }
    return new Response('not found', { status: 404 });
  };
  const board = env.BOARD.getByName(crypto.randomUUID());
  const deps: Deps = { accounts, fetch: fetcher, keys, board };
  const workerEnv = { ...testEnv, ...overrides };
  // A new address for each call, so the per-network limit only trips where a test wants it.
  const call = (path: string, init: RequestInit = {}, network = crypto.randomUUID()) =>
    handle(
      new Request(`${WORKER}${path}`, {
        ...init,
        headers: { 'CF-Connecting-IP': network, ...init.headers },
      }),
      workerEnv,
      deps,
    );
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const text = JSON.stringify(body);
    return call(path, {
      method: 'POST',
      body: text,
      headers: { 'Content-Length': String(new TextEncoder().encode(text).length), ...headers },
    });
  };
  return { call, post, codes, emails, appleSecrets, revoked, ids, board };
}

type Worker = ReturnType<typeof worker>;
type SignedIn = { token: string; provider: string; email?: string; created: boolean };

/** What the app makes before opening the tab. */
async function secret() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: base64url(await sha256(verifier)) };
}

const startPath = (provider: string, challenge: string, back = APP, lang = 'en', purpose = '') =>
  `/v1/auth/${provider}/start?return=${encodeURIComponent(back)}&challenge=${challenge}&lang=${lang}` +
  (purpose ? `&purpose=${purpose}` : '');

/** The tab: start, Google's or Apple's page (the person signs in), the callback. */
async function tab(
  w: Worker,
  provider: 'google' | 'apple',
  person: Person,
  back = APP,
  purpose = '',
) {
  const { verifier, challenge } = await secret();
  const started = await w.call(startPath(provider, challenge, back, 'en', purpose));
  expect(started.status).toBe(302);
  const authorize = new URL(started.headers.get('Location')!);
  const code = `code-${crypto.randomUUID()}`;
  w.codes.set(code, { ...person, challenge: authorize.searchParams.get('code_challenge') ?? '' });
  const state = authorize.searchParams.get('state')!;
  const back_ = await w.call(
    `/v1/auth/${provider}/callback?code=${code}&state=${encodeURIComponent(state)}`,
  );
  return { authorize, back: back_, verifier };
}

/** Where the "Open Recap" button on the tab's last page goes. */
async function buttonLink(page: Response) {
  const html = await page.text();
  return new URL(/href="([^"]+)"/.exec(html)![1]!.replace(/&amp;/g, '&'));
}

async function browserSignIn(w: Worker, provider: 'google' | 'apple', person: Person) {
  const { back, verifier } = await tab(w, provider, person);
  const link = await buttonLink(back);
  const finished = await w.post('/v1/auth/finish', {
    code: link.searchParams.get('code'),
    verifier,
    device: crypto.randomUUID(),
  });
  expect(finished.status).toBe(200);
  return (await finished.json()) as SignedIn;
}

const accountIn = (token: string) =>
  accountOf(
    new Request(WORKER, { headers: { Authorization: `Bearer ${token}` } }),
    env.TOKEN_SECRET,
  );

describe('signing in with Google', () => {
  it('ends in the app with a code that works only with the app’s secret', async () => {
    const w = worker();
    const { authorize, back, verifier } = await tab(w, 'google', { sub: 'g-1', email: 'an@x.com' });
    expect(authorize.origin + authorize.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(authorize.searchParams.get('client_id')).toBe(GOOGLE_CLIENT);
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${WORKER}/v1/auth/google/callback`);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');

    expect(back.status).toBe(200);
    expect(back.headers.get('Content-Type')).toContain('text/html');
    expect(back.headers.get('Referrer-Policy')).toBe('no-referrer');
    const link = await buttonLink(back);
    expect(link.protocol).toBe('recapcards:');
    const code = link.searchParams.get('code')!;
    // Sealed: the address in it can't be read.
    expect(code).not.toContain('an@x.com');
    expect(atob(code.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/'))).toContain('A256GCM');

    const device = crypto.randomUUID();
    const stolen = await w.post('/v1/auth/finish', { code, verifier: 'x'.repeat(43), device });
    expect(stolen.status).toBe(400);
    expect(await stolen.json()).toEqual({ error: 'bad_code' });

    const finished = await w.post('/v1/auth/finish', { code, verifier, device });
    const body = (await finished.json()) as SignedIn;
    expect(body).toMatchObject({ provider: 'google', email: 'an@x.com', created: true });
    expect(await accountIn(body.token)).toBe(w.ids.get('google:g-1'));
  });

  it('finds the same account the next time', async () => {
    const w = worker();
    const first = await browserSignIn(w, 'google', { sub: 'g-2' });
    const again = await browserSignIn(w, 'google', { sub: 'g-2' });
    expect(again.created).toBe(false);
    expect(await accountIn(again.token)).toBe(await accountIn(first.token));
    const other = await browserSignIn(w, 'google', { sub: 'g-3' });
    expect(await accountIn(other.token)).not.toBe(await accountIn(first.token));
  });

  it('sends the website back with a plain redirect', async () => {
    const w = worker();
    const { back } = await tab(w, 'google', { sub: 'g-4' }, 'https://recapflashcards.com/account');
    expect(back.status).toBe(302);
    const location = new URL(back.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://recapflashcards.com/account');
    expect(location.searchParams.get('code')).toBeTruthy();
  });

  it('only returns to the app and the website, and needs a challenge', async () => {
    const w = worker();
    const { challenge } = await secret();
    expect((await w.call(startPath('google', challenge, 'https://evil.example/x'))).status).toBe(
      400,
    );
    expect((await w.call(startPath('google', challenge, 'javascript:alert(1)'))).status).toBe(400);
    expect((await w.call(startPath('google', 'short'))).status).toBe(400);
    expect(
      (await w.call(startPath('google', challenge, 'http://localhost:8081/account'))).status,
    ).toBe(302);
  });

  it('goes back with error=cancelled, and shows an expired page for a bad state', async () => {
    const w = worker();
    const { challenge } = await secret();
    const started = await w.call(startPath('google', challenge));
    const state = new URL(started.headers.get('Location')!).searchParams.get('state')!;
    const cancelled = await w.call(
      `/v1/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    );
    expect((await buttonLink(cancelled)).searchParams.get('error')).toBe('cancelled');

    const changed = await w.call(`/v1/auth/google/callback?code=c&state=${state}x`);
    expect(changed.status).toBe(400);
    expect(await changed.text()).toContain('expired');
    // A state made for Google doesn't work at Apple's callback.
    expect((await w.call(`/v1/auth/apple/callback?code=c&state=${state}`)).status).toBe(400);
  });

  it('goes back with error=failed when Google refuses the code', async () => {
    const w = worker();
    const { challenge } = await secret();
    const started = await w.call(startPath('google', challenge));
    const state = new URL(started.headers.get('Location')!).searchParams.get('state')!;
    const back = await w.call(`/v1/auth/google/callback?code=unknown&state=${state}`);
    expect((await buttonLink(back)).searchParams.get('error')).toBe('failed');
  });

  it('answers not_set_up until Google’s settings are in', async () => {
    const w = worker({ GOOGLE_CLIENT_ID: '' });
    const { challenge } = await secret();
    const started = await w.call(startPath('google', challenge));
    expect(started.status).toBe(503);
    expect(await started.json()).toEqual({ error: 'not_set_up' });
  });
});

describe('signing in with Apple', () => {
  it('in a browser tab: asks for no name or email, and signs its client secret with the key', async () => {
    const w = worker();
    const { authorize } = await tab(w, 'apple', { sub: 'a-1' });
    expect(authorize.origin + authorize.pathname).toBe('https://appleid.apple.com/auth/authorize');
    expect(authorize.searchParams.get('client_id')).toBe(env.APPLE_SERVICES_ID);
    expect(authorize.searchParams.get('response_mode')).toBe('query');
    expect(authorize.searchParams.has('scope')).toBe(false);
    expect(w.appleSecrets).toHaveLength(1);
    expect(decodeJwt(w.appleSecrets[0]!).sub).toBe(env.APPLE_SERVICES_ID);

    const signedIn = await browserSignIn(w, 'apple', { sub: 'a-1' });
    expect(signedIn).toMatchObject({ provider: 'apple', created: true });
    expect(signedIn.email).toBeUndefined();
    // The client secret is made once and reused (signing it costs CPU time).
    expect(w.appleSecrets).toHaveLength(2);
    expect(w.appleSecrets[1]).toBe(w.appleSecrets[0]);
    const { iat, exp } = decodeJwt(w.appleSecrets[0]!);
    expect(exp! - iat!).toBeLessThanOrEqual(6 * 30 * 24 * 60 * 60);
  });

  it('on an iPhone: needs the nonce the app gave Apple, and finds the same account', async () => {
    const w = worker();
    const fromTab = await browserSignIn(w, 'apple', { sub: 'a-2' });
    const nonce = crypto.randomUUID();
    const idToken = await appleToken('a-2', env.APPLE_BUNDLE_ID, hex(await sha256(nonce)));
    const device = crypto.randomUUID();

    const wrong = await w.post('/v1/auth/apple', { idToken, nonce: 'another', device });
    expect(wrong.status).toBe(401);
    // A token made for the Services ID (the browser) isn't one from Apple's sheet.
    const forTab = await appleToken('a-2', env.APPLE_SERVICES_ID, hex(await sha256(nonce)));
    expect((await w.post('/v1/auth/apple', { idToken: forTab, nonce, device })).status).toBe(401);

    const sheet = await w.post('/v1/auth/apple', { idToken, nonce, device });
    const body = (await sheet.json()) as SignedIn;
    expect(body).toMatchObject({ provider: 'apple', created: false });
    expect(await accountIn(body.token)).toBe(await accountIn(fromTab.token));
  });

  it('answers not_set_up in a tab until Apple’s key is in', async () => {
    const w = worker({ APPLE_PRIVATE_KEY: '' });
    const { challenge } = await secret();
    expect((await w.call(startPath('apple', challenge))).status).toBe(503);
  });
});

describe('signing in with email', () => {
  const codeIn = (email: Email) => /\b(\d{6})\b/.exec(email.text)![1]!;
  const address = () => `${crypto.randomUUID()}@example.com`;

  it('emails a code that signs in once', async () => {
    const w = worker();
    const email = address();
    const started = await w.post('/v1/auth/email/start', { email: ` ${email.toUpperCase()} ` });
    expect(await started.json()).toEqual({ ok: true });
    expect(w.emails).toHaveLength(1);
    const sent = w.emails[0]!;
    expect(sent.to).toEqual([email]);
    expect(sent.from).toBe(env.EMAIL_FROM);
    const code = codeIn(sent);
    expect(sent.subject).toBe(`Your Recap code: ${code}`);

    const device = crypto.randomUUID();
    const finished = await w.post('/v1/auth/email/finish', { email, code, device });
    const body = (await finished.json()) as SignedIn;
    expect(body).toMatchObject({ provider: 'email', email, created: true });
    expect(await accountIn(body.token)).toBeTruthy();
    // The address itself isn't the account's subject.
    expect([...w.ids.keys()][0]).not.toContain(email);

    const again = await w.post('/v1/auth/email/finish', { email, code, device });
    expect(await again.json()).toEqual({ error: 'expired' });
  });

  it('counts wrong tries, then ends the code', async () => {
    const w = worker();
    const email = address();
    await w.post('/v1/auth/email/start', { email });
    const code = codeIn(w.emails[0]!);
    const wrong = code === '000000' ? '111111' : '000000';
    const device = crypto.randomUUID();
    for (const left of [4, 3, 2, 1]) {
      const tried = await w.post('/v1/auth/email/finish', { email, code: wrong, device });
      expect(await tried.json()).toEqual({ error: 'wrong_code', triesLeft: left });
    }
    const fifth = await w.post('/v1/auth/email/finish', { email, code: wrong, device });
    expect(await fifth.json()).toEqual({ error: 'expired' });
    const right = await w.post('/v1/auth/email/finish', { email, code, device });
    expect(await right.json()).toEqual({ error: 'expired' });
  });

  it('sends one email a minute per address, in the app’s language', async () => {
    const w = worker();
    const email = address();
    await w.post('/v1/auth/email/start', { email, lang: 'vi' });
    expect(w.emails[0]!.subject).toMatch(/^Mã Recap của bạn: \d{6}$/);
    const soon = await w.post('/v1/auth/email/start', { email });
    expect(soon.status).toBe(429);
    expect(await soon.json()).toEqual({ error: 'wait' });
    expect((await w.post('/v1/auth/email/start', { email: address() })).status).toBe(200);
    expect(w.emails).toHaveLength(2);
  });

  it('stops below Resend’s 100 a day for everyone', async () => {
    const counter = env.COUNTERS.getByName('emails');
    const saved = await runInDurableObject(counter, (_, state) =>
      state.storage.get<Usage>('usage'),
    );
    try {
      await runInDurableObject(counter, (_, state) =>
        state.storage.put('usage', { day: today(), writes: EMAIL_LIMITS.writes, bytes: 0 }),
      );
      const w = worker();
      const refused = await w.post('/v1/auth/email/start', { email: address() });
      expect(refused.status).toBe(429);
      expect(await refused.json()).toEqual({ error: 'email_limit' });
      expect(w.emails).toHaveLength(0);
    } finally {
      await runInDurableObject(counter, async (_, state) => {
        if (saved) await state.storage.put('usage', saved);
        else await state.storage.delete('usage');
      });
    }
  });

  it('never emails the review address, which takes the fixed code', async () => {
    const w = worker();
    const email = env.REVIEW_EMAIL;
    expect(await (await w.post('/v1/auth/email/start', { email })).json()).toEqual({ ok: true });
    expect(w.emails).toHaveLength(0);
    const device = crypto.randomUUID();
    const wrong = await w.post('/v1/auth/email/finish', { email, code: '135791', device });
    expect(await wrong.json()).toEqual({ error: 'wrong_code' });
    const right = await w.post('/v1/auth/email/finish', { email, code: env.REVIEW_CODE, device });
    expect(await right.json()).toMatchObject({ provider: 'email', email, created: true });
  });

  it('refuses what isn’t an address or a device', async () => {
    const w = worker();
    expect(await (await w.post('/v1/auth/email/start', { email: 'nope' })).json()).toEqual({
      error: 'bad_email',
    });
    const noDevice = await w.post('/v1/auth/email/finish', { email: address(), code: '123456' });
    expect(noDevice.status).toBe(400);
  });
});

describe('tokens', () => {
  it('last 90 days, and POST /v1/token gives a new one for the same account', async () => {
    const w = worker();
    const { token } = await browserSignIn(w, 'google', { sub: 'g-5' });
    const { iat, exp } = decodeJwt(token);
    expect(exp! - iat!).toBe(TOKEN_DAYS * 24 * 60 * 60);

    const renewed = await w.call('/v1/token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await renewed.json()) as { token: string };
    expect(await accountIn(body.token)).toBe(await accountIn(token));
    expect((await w.call('/v1/token', { method: 'POST' })).status).toBe(401);
  });

  it('limits signing in per network', async () => {
    const w = worker();
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const response = await w.call('/v1/auth/email/start', { method: 'POST' }, 'same-network');
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });
});

describe('deleting an account', () => {
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const put = (w: Worker, token: string, name: string, text: string) =>
    w.call(`/v1/files/${name}`, {
      method: 'PUT',
      body: text,
      headers: { ...auth(token), 'Content-Length': String(text.length) },
    });
  const remove = (w: Worker, token: string, body: unknown = {}) =>
    w.post('/v1/account/delete', body, auth(token));
  const filesOf = async (account: string) =>
    (await env.FILES.list({ prefix: `${account}/` })).objects.length;

  it('deletes a Google account, its files and its tokens on every device; the cards were synced', async () => {
    const w = worker();
    const { token } = await browserSignIn(w, 'google', { sub: 'g-del' });
    const other = await browserSignIn(w, 'google', { sub: 'g-del' }); // a second phone
    const account = (await accountIn(token))!;
    expect((await put(w, token, 'changes/0000000001.json', '{"x":1}')).status).toBe(201);
    expect(await filesOf(account)).toBe(1);
    const names = { displayName: 'Deleted Owl', username: 'deleted.owl', anonymous: false };
    expect(await w.board.save(account, names, Date.now())).toMatchObject(names);

    const deleted = await remove(w, token);
    expect(await deleted.json()).toEqual({ ok: true });
    expect(await filesOf(account)).toBe(0);
    expect(w.ids.has('google:g-del')).toBe(false);
    expect(await w.board.profile(account)).toBeNull();

    // Both phones' tokens stop working: listing, writing and renewing.
    for (const t of [token, other.token]) {
      const listing = await w.call('/v1/files', { headers: auth(t) });
      expect(listing.status).toBe(401);
      expect(await listing.json()).toEqual({ error: 'account_deleted' });
      expect((await put(w, t, 'changes/0000000002.json', '{}')).status).toBe(401);
      expect((await w.call('/v1/token', { method: 'POST', headers: auth(t) })).status).toBe(401);
    }
    // Deleting again is harmless, and the same Google account can start over.
    expect((await remove(w, token)).status).toBe(200);
    const again = await browserSignIn(w, 'google', { sub: 'g-del' });
    expect(again.created).toBe(true);
    expect(await accountIn(again.token)).not.toBe(account);
  });

  it('an email account needs only its token', async () => {
    const w = worker();
    const email = `${crypto.randomUUID()}@example.com`;
    await w.post('/v1/auth/email/start', { email });
    const code = /\b(\d{6})\b/.exec(w.emails[0]!.text)![1]!;
    const signedIn = (await (
      await w.post('/v1/auth/email/finish', { email, code, device: crypto.randomUUID() })
    ).json()) as SignedIn;
    expect(await (await remove(w, signedIn.token)).json()).toEqual({ ok: true });
    expect(w.ids.size).toBe(0);
    expect(w.revoked).toEqual([]);
  });

  it('an Apple account needs Apple again, with the same Apple ID, and is revoked', async () => {
    const w = worker();
    const { token } = await browserSignIn(w, 'apple', { sub: 'a-del' });
    const needed = await remove(w, token);
    expect(needed.status).toBe(400);
    expect(await needed.json()).toEqual({ error: 'apple_sign_in_needed' });

    // A sign-in code doesn't work for deleting, and a deleting code doesn't sign in.
    const signIn = await tab(w, 'apple', { sub: 'a-del' });
    const signInCode = (await buttonLink(signIn.back)).searchParams.get('code');
    expect((await remove(w, token, { code: signInCode, verifier: signIn.verifier })).status).toBe(
      400,
    );
    const forDeleting = await tab(w, 'apple', { sub: 'a-del' }, APP, 'delete');
    const deleteCode = (await buttonLink(forDeleting.back)).searchParams.get('code')!;
    const finished = await w.post('/v1/auth/finish', {
      code: deleteCode,
      verifier: forDeleting.verifier,
      device: crypto.randomUUID(),
    });
    expect(finished.status).toBe(400);

    // Another Apple ID: nothing is deleted.
    const wrong = await tab(w, 'apple', { sub: 'someone-else' }, APP, 'delete');
    const wrongCode = (await buttonLink(wrong.back)).searchParams.get('code');
    const refused = await remove(w, token, { code: wrongCode, verifier: wrong.verifier });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'other_apple_account' });
    expect(w.revoked).toEqual([]);
    expect((await w.call('/v1/files', { headers: auth(token) })).status).toBe(200);

    const ok = await remove(w, token, { code: deleteCode, verifier: forDeleting.verifier });
    expect(await ok.json()).toEqual({ ok: true });
    expect(w.revoked).toHaveLength(1);
    expect(w.revoked[0]!.clientId).toBe(env.APPLE_SERVICES_ID);
    expect(w.revoked[0]!.token).toMatch(/^refresh-code-/);
    expect(w.ids.has('apple:a-del')).toBe(false);
  });

  it("Apple's sheet on an iPhone: the code is swapped with the app's id and revoked", async () => {
    const w = worker();
    const nonce = crypto.randomUUID();
    const idToken = await appleToken('a-sheet', env.APPLE_BUNDLE_ID, hex(await sha256(nonce)));
    const sheet = (await (
      await w.post('/v1/auth/apple', { idToken, nonce, device: crypto.randomUUID() })
    ).json()) as SignedIn;

    const again = crypto.randomUUID();
    const freshToken = await appleToken('a-sheet', env.APPLE_BUNDLE_ID, hex(await sha256(again)));
    w.codes.set('sheet-code', { sub: 'a-sheet' });
    const ok = await remove(w, sheet.token, {
      idToken: freshToken,
      nonce: again,
      authorizationCode: 'sheet-code',
    });
    expect(await ok.json()).toEqual({ ok: true });
    expect(w.revoked).toEqual([{ clientId: env.APPLE_BUNDLE_ID, token: 'refresh-sheet-code' }]);
  });

  it('only Apple signs in again for deleting', async () => {
    const w = worker();
    const { challenge } = await secret();
    expect((await w.call(startPath('google', challenge, APP, 'en', 'delete'))).status).toBe(400);
  });
});
