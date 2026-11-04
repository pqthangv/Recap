// Google and Apple (roadmap 6.1). In a browser tab, their sign-in page sends a code back to the
// Worker, which swaps it for an ID token and checks that token with their public keys. On an
// iPhone, Apple's own sheet gives the app an ID token, which the app sends to /v1/auth/apple.
// Apple is asked for no name or email, so its answer comes back as a plain redirect.
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';

import { hex, sha256 } from './hash';

export type Keys = { google: JWTVerifyGetKey; apple: JWTVerifyGetKey };

/** Google's and Apple's public keys, fetched when first needed and cached by jose. */
export const REMOTE_KEYS: Keys = {
  google: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
  apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
};

export const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const APPLE_AUTHORIZE = 'https://appleid.apple.com/auth/authorize';
export const APPLE_TOKEN = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE = 'https://appleid.apple.com/auth/revoke';
export const APPLE_ISSUER = 'https://appleid.apple.com';

/** Who Google or Apple says signed in. Google's answer also has the address, to show in Settings. */
export type Person = { subject: string; email?: string };

export const googleReady = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const appleReady = (env: Env) =>
  Boolean(env.APPLE_SERVICES_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);

export function googleAuthorizeUrl(
  env: Env,
  redirectUri: string,
  state: string,
  challenge: string,
) {
  const url = new URL(GOOGLE_AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export function appleAuthorizeUrl(env: Env, redirectUri: string, state: string) {
  const url = new URL(APPLE_AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: env.APPLE_SERVICES_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    state,
  }).toString();
  return url.toString();
}

/** Swaps a sign-in code for the ID token (and Apple's refresh token) at a token endpoint. */
async function tokensFor(
  fetcher: typeof fetch,
  endpoint: string,
  form: Record<string, string>,
): Promise<{ idToken: string; refreshToken?: string }> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await response.json().catch(() => null)) as {
    id_token?: unknown;
    refresh_token?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok || typeof body?.id_token !== 'string') {
    // OAuth's error name (invalid_client: the secret; invalid_grant: the code), for the logs.
    const reason = typeof body?.error === 'string' ? ` ${body.error.slice(0, 60)}` : '';
    throw new Error(`${endpoint} answered ${response.status}${reason}`);
  }
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
  return { idToken: body.id_token, refreshToken };
}

export async function googlePerson(
  env: Env,
  fetcher: typeof fetch,
  keys: Keys,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<Person> {
  const { idToken } = await tokensFor(fetcher, GOOGLE_TOKEN, {
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    // A space or line break pasted along with the secret would make Google refuse it.
    client_secret: env.GOOGLE_CLIENT_SECRET.trim(),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const { payload } = await jwtVerify(idToken, keys.google, {
    issuer: GOOGLE_ISSUERS,
    audience: env.GOOGLE_CLIENT_ID,
    requiredClaims: ['sub'],
  });
  const email =
    typeof payload.email === 'string' && payload.email_verified === true
      ? payload.email
      : undefined;
  return { subject: payload.sub!, email };
}

/** Client secrets already made, by key and client id. */
const madeSecrets = new Map<string, { secret: string; until: number }>();
const SECRET_REUSE_MS = 30 * 60_000;

/**
 * Apple's client secret: a JWT signed with the Sign in with Apple key (.p8), for the Services ID
 * (browser) or the bundle id (iPhone; deleting an account, part 4). Reading the key and signing
 * took a cold Worker past Workers Free's 10 ms of CPU, so each one is reused for half an hour
 * (Apple takes them for up to 6 months; this one says 40 minutes).
 */
export async function appleClientSecret(
  env: Env,
  clientId: string,
  now = Date.now(),
): Promise<string> {
  const id = `${env.APPLE_TEAM_ID}:${env.APPLE_KEY_ID}:${clientId}`;
  const made = madeSecrets.get(id);
  if (made && made.until > now) return made.secret;
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n').trim(), 'ES256');
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + SECRET_REUSE_MS + 10 * 60_000) / 1000))
    .sign(key);
  madeSecrets.set(id, { secret, until: now + SECRET_REUSE_MS });
  return secret;
}

/** Who signed in with Apple in the tab; with Apple's refresh token, which deleting needs. */
export async function applePerson(
  env: Env,
  fetcher: typeof fetch,
  keys: Keys,
  code: string,
  redirectUri: string,
): Promise<Person & { refreshToken?: string }> {
  const { idToken, refreshToken } = await tokensFor(fetcher, APPLE_TOKEN, {
    code,
    client_id: env.APPLE_SERVICES_ID,
    client_secret: await appleClientSecret(env, env.APPLE_SERVICES_ID),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const { payload } = await jwtVerify(idToken, keys.apple, {
    issuer: APPLE_ISSUER,
    audience: env.APPLE_SERVICES_ID,
    requiredClaims: ['sub'],
  });
  return { subject: payload.sub!, refreshToken };
}

/**
 * The person in an ID token from Apple's sheet on an iPhone. The app made `nonce` and gave Apple
 * its SHA-256, so a token caught on its own can't be replayed.
 */
export async function appleNativePerson(
  env: Env,
  keys: Keys,
  idToken: string,
  nonce: string,
): Promise<Person> {
  const { payload } = await jwtVerify(idToken, keys.apple, {
    issuer: APPLE_ISSUER,
    audience: env.APPLE_BUNDLE_ID,
    requiredClaims: ['sub', 'nonce'],
  });
  if (payload.nonce !== hex(await sha256(nonce))) throw new Error('nonce does not match');
  return { subject: payload.sub! };
}

/**
 * Apple's refresh token for a code from its sheet on an iPhone (deleting an account: the app signs
 * in with Apple once more and sends the code along).
 */
export async function appleSheetRefreshToken(
  env: Env,
  fetcher: typeof fetch,
  code: string,
): Promise<string> {
  const { refreshToken } = await tokensFor(fetcher, APPLE_TOKEN, {
    code,
    client_id: env.APPLE_BUNDLE_ID,
    client_secret: await appleClientSecret(env, env.APPLE_BUNDLE_ID),
    grant_type: 'authorization_code',
  });
  if (!refreshToken) throw new Error('Apple gave no refresh token');
  return refreshToken;
}

/**
 * Ends Recap's Sign in with Apple for that person (Apple requires it when an account is deleted):
 * Recap leaves their Apple ID's list. `clientId` is the one the token was made for.
 */
export async function revokeApple(
  env: Env,
  fetcher: typeof fetch,
  clientId: string,
  refreshToken: string,
): Promise<void> {
  const response = await fetcher(APPLE_REVOKE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await appleClientSecret(env, clientId),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }).toString(),
  });
  if (!response.ok) throw new Error(`${APPLE_REVOKE} answered ${response.status}`);
}
