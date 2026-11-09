// Signing in (roadmap 6.1): Google and Apple in a browser tab, Apple's own sheet on iPhones, and an
// emailed code. Each ends the same way: the account in Neon (src/accounts.ts) and a 90-day sign-in
// token (src/auth.ts). None of these need a token; they have their own per-network rate limit.
//   GET  /v1/auth/<google|apple>/start?return=<url>&challenge=<c>&lang=<en|vi>
//   GET  /v1/auth/<google|apple>/callback    where Google's or Apple's page sends the person back
//   POST /v1/auth/finish        {"code", "verifier", "device"}: the code the tab handed the app
//   POST /v1/auth/apple         {"idToken", "nonce", "device"}: Apple's sheet on an iPhone
//   POST /v1/auth/email/start   {"email", "lang"}: emails a code
//   POST /v1/auth/email/finish  {"email", "code", "device"}
// A sign-in answers {"token", "provider", "email"?, "created"}.
//
// The browser tab: the app makes a secret `verifier` and sends only its SHA-256 (`challenge`).
// The tab ends at `return` (the app, or the website) with a short-lived code, sealed with the
// Worker's secret, which works only together with that verifier. So another app that catches
// recapcards://… gets nothing it can use, and the address in it can't be read.
import { EncryptJWT, jwtDecrypt, jwtVerify, SignJWT } from 'jose';

import type { Accounts, Identity, Provider } from './accounts';
import { makeToken, secretKey, TOKEN_ISSUER } from './auth';
import type { Board } from './board';
import {
  addressHash,
  checkCode,
  EMAIL_LIMITS,
  emailAddress,
  isReviewAddress,
  sendCode,
  startCode,
  toLang,
  type Lang,
} from './email';
import { base64url, hmac, sameText, sha256 } from './hash';
import { today } from './limits';
import { APP_SCHEME, ORIGINS } from './origins';
import {
  appleAuthorizeUrl,
  applePerson,
  appleNativePerson,
  appleReady,
  googleAuthorizeUrl,
  googlePerson,
  googleReady,
  type Keys,
  type Person,
} from './providers';

/**
 * What the Worker needs from outside: swapped for fakes in the tests, which also give each test a
 * board of its own.
 */
export type Deps = {
  accounts: Accounts;
  fetch: typeof fetch;
  keys: Keys;
  board: DurableObjectStub<Board>;
};

type Browser = 'google' | 'apple';
/** What the tab carries to Google or Apple and back, signed. `k`: signing in again to delete. */
type State = { p: Browser; r: string; c: string; l: Lang; n: string; k?: 'delete' };
/**
 * The code the tab hands the app, sealed. One made for deleting an account (`k`) carries Apple's
 * refresh token (`r`) for the revoke, and only works for deleting.
 */
export type Handoff = { p: Provider; s: string; e?: string; c: string; k?: 'delete'; r?: string };

const STATE_AUDIENCE = 'recap-state';
const HANDOFF_AUDIENCE = 'recap-handoff';
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 8 * 1024;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);

/** Where a browser sign-in may end: the app, or one of the website's own addresses. */
export function returnAddress(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== APP_SCHEME && !ORIGINS.has(url.origin)) return null;
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** The JSON body of a small request, or null. */
export async function smallBody(request: Request): Promise<Record<string, unknown> | null> {
  const size = Number(request.headers.get('Content-Length') ?? NaN);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BODY_BYTES) return null;
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

const deviceOf = (value: unknown) =>
  typeof value === 'string' && DEVICE.test(value) ? value.toLowerCase() : null;

const handoffKey = (env: Env) => sha256(`handoff:${env.TOKEN_SECRET}`);

/** Google's PKCE secret for this sign-in, worked out again at the callback (nothing is stored). */
const pkceVerifier = async (env: Env, nonce: string) =>
  base64url(await hmac(env.TOKEN_SECRET, `pkce:${nonce}`));

const callbackUrl = (url: URL, provider: Browser) => `${url.origin}/v1/auth/${provider}/callback`;

async function signedIn(env: Env, deps: Deps, who: Identity, device: string, email?: string) {
  const account = await deps.accounts.signIn(who, device);
  const token = await makeToken(account.id, env.TOKEN_SECRET);
  return json({ token, provider: who.provider, email, created: account.created });
}

async function start(provider: Browser, url: URL, env: Env): Promise<Response> {
  if (!(provider === 'google' ? googleReady(env) : appleReady(env))) {
    return fail('not_set_up', 503);
  }
  const target = returnAddress(url.searchParams.get('return'));
  const challenge = url.searchParams.get('challenge') ?? '';
  if (!target || !CHALLENGE.test(challenge)) return fail('bad_request', 400);
  const lang = toLang(url.searchParams.get('lang'));
  // Signing in again to delete the account: only Apple needs it (its token has to be revoked).
  const deleting = url.searchParams.get('purpose') === 'delete';
  if (deleting && provider !== 'apple') return fail('bad_request', 400);
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const fields: State = { p: provider, r: target, c: challenge, l: lang, n: nonce };
  if (deleting) fields.k = 'delete';
  const state = await new SignJWT(fields)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(STATE_AUDIENCE)
    .setExpirationTime('15m')
    .sign(secretKey(env.TOKEN_SECRET));
  const redirect = callbackUrl(url, provider);
  const location =
    provider === 'google'
      ? googleAuthorizeUrl(
          env,
          redirect,
          state,
          base64url(await sha256(await pkceVerifier(env, nonce))),
        )
      : appleAuthorizeUrl(env, redirect, state);
  return new Response(null, { status: 302, headers: { Location: location } });
}

async function readState(env: Env, value: string | null): Promise<State | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, secretKey(env.TOKEN_SECRET), {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
      audience: STATE_AUDIENCE,
    });
    return payload as unknown as State;
  } catch {
    return null;
  }
}

async function callback(provider: Browser, url: URL, env: Env, deps: Deps): Promise<Response> {
  const state = await readState(env, url.searchParams.get('state'));
  if (!state || state.p !== provider) return expiredPage();
  const code = url.searchParams.get('code');
  if (!code) {
    // Google says access_denied and Apple user_cancelled_authorize when the person backs out.
    const error = url.searchParams.get('error') ?? '';
    const cancelled = error === 'access_denied' || error === 'user_cancelled_authorize';
    return backTo(state.r, { error: cancelled ? 'cancelled' : 'failed' }, state.l);
  }
  let person: Person & { refreshToken?: string };
  try {
    const redirect = callbackUrl(url, provider);
    person =
      provider === 'google'
        ? await googlePerson(
            env,
            deps.fetch,
            deps.keys,
            code,
            redirect,
            await pkceVerifier(env, state.n),
          )
        : await applePerson(env, deps.fetch, deps.keys, code, redirect);
  } catch (error) {
    console.log(`sign-in with ${provider} failed:`, String(error));
    return backTo(state.r, { error: 'failed' }, state.l);
  }
  const handoff: Handoff = { p: provider, s: person.subject, e: person.email, c: state.c };
  if (state.k === 'delete') {
    if (!person.refreshToken) return backTo(state.r, { error: 'failed' }, state.l);
    handoff.k = 'delete';
    handoff.r = person.refreshToken;
  }
  const sealed = await new EncryptJWT(handoff)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(HANDOFF_AUDIENCE)
    .setExpirationTime('5m')
    .encrypt(await handoffKey(env));
  return backTo(state.r, { code: sealed }, state.l);
}

async function finish(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await smallBody(request);
  const device = deviceOf(body?.device);
  const { code, verifier } = body ?? {};
  if (typeof code !== 'string' || typeof verifier !== 'string' || !device) {
    return fail('bad_request', 400);
  }
  const handoff = await openHandoff(env, code, verifier);
  if (!handoff || handoff.k === 'delete') return fail('bad_code', 400);
  return signedIn(env, deps, { provider: handoff.p, subject: handoff.s }, device, handoff.e);
}

/** The tab's code, if it's genuine, still fresh, and goes with the app's secret; else null. */
export async function openHandoff(
  env: Env,
  code: string,
  verifier: string,
): Promise<Handoff | null> {
  let handoff: Handoff;
  try {
    const { payload } = await jwtDecrypt(code, await handoffKey(env), {
      issuer: TOKEN_ISSUER,
      audience: HANDOFF_AUDIENCE,
    });
    handoff = payload as unknown as Handoff;
  } catch {
    return null;
  }
  return sameText(base64url(await sha256(verifier)), handoff.c) ? handoff : null;
}

async function appleSheet(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await smallBody(request);
  const device = deviceOf(body?.device);
  const { idToken, nonce } = body ?? {};
  if (typeof idToken !== 'string' || typeof nonce !== 'string' || !device) {
    return fail('bad_request', 400);
  }
  let person;
  try {
    person = await appleNativePerson(env, deps.keys, idToken, nonce);
  } catch {
    return fail('bad_token', 401);
  }
  return signedIn(env, deps, { provider: 'apple', subject: person.subject }, device);
}

const emailReady = (env: Env) => Boolean(env.EMAIL_KEY && env.RESEND_API_KEY && env.EMAIL_FROM);

async function emailStart(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await smallBody(request);
  const email = emailAddress(body?.email);
  if (!email) return fail('bad_email', 400);
  if (!env.EMAIL_KEY) return fail('not_set_up', 503);
  // The review address is never emailed: its code is REVIEW_CODE.
  if (isReviewAddress(env, email)) return json({ ok: true });
  if (!emailReady(env)) return fail('not_set_up', 503);
  const started = await startCode(env, await addressHash(env, email));
  if ('refused' in started) return fail(started.refused, 429);
  const everyone = await env.COUNTERS.getByName('emails').charge(today(), 0, EMAIL_LIMITS);
  if (everyone !== 'ok') return fail('email_limit', 429);
  const lang = toLang(body?.lang);
  if (!(await sendCode(env, deps.fetch, email, started.code, lang))) {
    return fail('email_failed', 502);
  }
  return json({ ok: true });
}

async function emailFinish(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await smallBody(request);
  const email = emailAddress(body?.email);
  const device = deviceOf(body?.device);
  const code = typeof body?.code === 'string' ? body.code.replace(/\s/g, '') : null;
  if (!email || !device || code === null) return fail('bad_request', 400);
  if (!env.EMAIL_KEY) return fail('not_set_up', 503);
  const address = await addressHash(env, email);
  if (isReviewAddress(env, email)) {
    if (!env.REVIEW_CODE || !sameText(code, env.REVIEW_CODE)) return fail('wrong_code', 400);
  } else {
    const checked = await checkCode(env, address, code);
    if (checked.result === 'expired') return fail('expired', 400);
    if (checked.result === 'wrong') {
      return json({ error: 'wrong_code', triesLeft: checked.triesLeft }, 400);
    }
  }
  return signedIn(env, deps, { provider: 'email', subject: address }, device, email);
}

/** Answers /v1/auth/…, or null for any other path. */
export async function signIn(
  request: Request,
  env: Env,
  deps: Deps,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname.slice('/v1/auth/'.length);
  const { method } = request;
  const browser = /^(google|apple)\/(start|callback)$/.exec(path);
  if (browser && method === 'GET') {
    const provider = browser[1] as Browser;
    return browser[2] === 'start' ? start(provider, url, env) : callback(provider, url, env, deps);
  }
  if (method !== 'POST') return null;
  if (path === 'finish') return finish(request, env, deps);
  if (path === 'apple') return appleSheet(request, env, deps);
  if (path === 'email/start') return emailStart(request, env, deps);
  if (path === 'email/finish') return emailFinish(request, env, deps);
  return null;
}

// The pages a browser sign-in ends on.

const PAGE_TEXT: Record<Lang, { going: string; button: string }> = {
  en: { going: 'Going back to Recap…', button: 'Open Recap' },
  vi: { going: 'Đang quay lại Recap…', button: 'Mở Recap' },
  hi: { going: 'Recap खुल रहा है…', button: 'Recap खोलें' },
  es: { going: 'Volviendo a Recap…', button: 'Abrir Recap' },
  fr: { going: 'Retour à Recap…', button: 'Ouvrir Recap' },
  bn: { going: 'Recap-এ ফিরে যাওয়া হচ্ছে…', button: 'Recap খুলুন' },
  pt: { going: 'Voltando para o Recap…', button: 'Abrir o Recap' },
};

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'",
};

// Recap's colors (app/src/lib/theme.ts), light and dark.
const PAGE_STYLE =
  'body{font:18px/1.4 system-ui,sans-serif;margin:0;padding:16px;min-height:100vh;box-sizing:border-box;' +
  'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;' +
  'text-align:center;background:#FFFFFF;color:#1A1530}' +
  'a{display:inline-block;min-height:48px;box-sizing:border-box;padding:12px 28px;border-radius:12px;' +
  'background:#5A31D6;color:#FFFFFF;font-weight:600;text-decoration:none}' +
  '@media (prefers-color-scheme:dark){body{background:#121017;color:#ECEAF4}' +
  'a{background:#B5A0FF;color:#1A1530}}';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function page(lang: Lang, body: string, status = 200) {
  const html =
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>Recap</title><style>${PAGE_STYLE}</style></head><body>${body}</body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

/**
 * Sends the tab back with `params`. The website gets a plain redirect. The app gets a page that
 * opens recapcards://… itself and also has an "Open Recap" button, because Chrome can leave a
 * blank tab when a redirect goes straight to an app's link with no tap.
 */
function backTo(target: string, params: Record<string, string>, lang: Lang): Response {
  const url = new URL(target);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const address = url.toString();
  if (url.protocol !== APP_SCHEME) {
    return new Response(null, {
      status: 302,
      headers: { Location: address, 'Cache-Control': 'no-store' },
    });
  }
  const text = PAGE_TEXT[lang];
  const script = JSON.stringify(address).replace(/</g, '\\u003c');
  return page(
    lang,
    `<p>${text.going}</p><a href="${escapeHtml(address)}">${text.button}</a>` +
      `<script>location.replace(${script})</script>`,
  );
}

/** A tab whose sign-in can't be read any more (too old, or changed): both languages. */
const expiredPage = () =>
  page(
    'en',
    '<p>This sign-in has expired. Go back to Recap and try again.</p>' +
      '<p lang="vi">Phiên đăng nhập này đã hết hạn. Hãy quay lại Recap và thử lại.</p>',
    400,
  );
