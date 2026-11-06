// Signing in to sync (roadmap 6.1): talking to the sync Worker's /v1/auth/… (sync/src/signin.ts).
// Google, and Apple outside iPhones, run in a browser tab: the app makes a secret `verifier`, sends
// only its SHA-256 (`challenge`) to start, and the tab comes back with a code that works only
// together with the verifier. Apple's sheet on iPhones and the emailed code go straight here.
// Every way ends with an Account: the Worker's 90-day token, renewed once it's a week old.
// Errors come back as AccountError with a friendly message to show as-is.
import { t, tn, type Language } from '../i18n';

export type Provider = 'google' | 'apple' | 'email';
export type BrowserProvider = 'google' | 'apple';

/** Who this device is signed in as. Kept on the device only (secure storage), never in backups. */
export type Account = { token: string; provider: Provider; email?: string };

/** The app asks for a new token once its token is this old (tokens work for 90 days). */
export const RENEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type AccountErrorKind =
  | 'offline'
  | 'busy' // too many tries from this network
  | 'wait' // a code was just sent to this address
  | 'addressLimit' // this address had its codes for today
  | 'emailLimit' // Recap sent all its emails for today
  | 'badEmail'
  | 'wrongCode'
  | 'expired'
  | 'notSetUp'
  | 'signedOut' // the token isn't valid any more
  | 'otherApple' // deleting: signed in with another Apple ID than the account's
  | 'failed'
  | 'server';

export class AccountError extends Error {
  constructor(
    readonly kind: AccountErrorKind,
    message: string,
    /** The underlying error (e.g. why fetch failed), for logs. */
    readonly reason?: unknown,
  ) {
    super(message);
  }
}

/** The error for an answer from the Worker. */
export function errorFromResponse(status: number, body: unknown): AccountError {
  const b = (body ?? {}) as { error?: unknown; triesLeft?: unknown };
  const code = typeof b.error === 'string' ? b.error : '';
  const error = (kind: AccountErrorKind, message: string) => new AccountError(kind, message);
  switch (code) {
    case 'too_many_requests':
      return error('busy', t('accountError.busy'));
    case 'wait':
      return error('wait', t('accountError.wait'));
    case 'address_limit':
      return error('addressLimit', t('accountError.addressLimit'));
    case 'email_limit':
      return error('emailLimit', t('accountError.emailLimit'));
    case 'bad_email':
      return error('badEmail', t('accountError.badEmail'));
    case 'wrong_code':
      return typeof b.triesLeft === 'number'
        ? error('wrongCode', tn('accountError.wrongCode', b.triesLeft))
        : error('wrongCode', t('accountError.wrongCodeOnly'));
    case 'expired':
      return error('expired', t('accountError.expired'));
    case 'not_set_up':
      return error('notSetUp', t('accountError.notSetUp'));
    case 'other_apple_account':
      return error('otherApple', t('accountError.otherApple'));
    case 'bad_code':
    case 'bad_token':
    case 'bad_request':
    case 'apple_sign_in_needed':
      return error('failed', t('accountError.failed'));
  }
  if (status === 401) return error('signedOut', t('accountError.failed'));
  return error('server', t('accountError.server'));
}

export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Standard base64 (what expo-crypto gives) → base64url (what the Worker compares). */
export const toBase64url = (base64: string) =>
  base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The token's payload (not checked: the Worker does that), or null if it can't be read. */
function tokenPayload(token: string): { iat?: unknown; sub?: unknown } | null {
  try {
    const part = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** When the token was made (ms), read from its payload; 0 if it can't be read. */
export function tokenIssuedAt(token: string): number {
  const iat = tokenPayload(token)?.iat;
  return typeof iat === 'number' ? iat * 1000 : 0;
}

/** The account the token is for (its `sub`, the account's id), or null if it can't be read. */
export function tokenAccount(token: string): string | null {
  const sub = tokenPayload(token)?.sub;
  return typeof sub === 'string' && sub !== '' ? sub : null;
}

export const needsRenewal = (token: string, now = Date.now()) =>
  now - tokenIssuedAt(token) > RENEW_AFTER_MS;

/**
 * Deleting an Apple account needs Apple once more: the tab's code and the app's secret (Android,
 * the website), or what Apple's sheet gave (iPhone).
 */
export type AppleProof =
  | { code: string; verifier: string }
  | { idToken: string; nonce: string; authorizationCode: string };

/** What the tab came back with: a code to finish with, or why there's none. */
export type TabResult = { code: string } | { error: 'cancelled' | 'failed' };

/** Reads the address the tab ended at (recapcards://signed-in?code=…, or the website's). */
export function readTabResult(url: string): TabResult {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return { error: 'failed' };
  }
  const code = params.get('code');
  if (code) return { code };
  return { error: params.get('error') === 'cancelled' ? 'cancelled' : 'failed' };
}

export type AccountClientOptions = {
  baseUrl: string;
  /** This install's id (src/db/device.ts), recorded with the account. */
  deviceId: () => string;
  fetch?: typeof fetch;
};

const TIMEOUT_MS = 30_000;

export function createAccountClient({
  baseUrl,
  deviceId,
  fetch: doFetch = fetch,
}: AccountClientOptions) {
  const base = baseUrl.replace(/\/+$/, '');

  async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      throw new AccountError('offline', t('accountError.offline'), e);
    } finally {
      clearTimeout(timer);
    }
    let answer: unknown = null;
    try {
      answer = await response.json();
    } catch {
      // Not JSON (e.g. a proxy error page).
    }
    if (!response.ok) throw errorFromResponse(response.status, answer);
    if (answer === null) throw new AccountError('server', t('accountError.server'));
    return answer as T;
  }

  const account = (answer: { token: string; provider: Provider; email?: string }): Account => ({
    token: answer.token,
    provider: answer.provider,
    ...(answer.email ? { email: answer.email } : {}),
  });

  return {
    /**
     * Where the browser tab starts. `returnTo` is where it ends: the app, or the website.
     * `deleting`: Apple again, to delete the account.
     */
    startUrl(
      provider: BrowserProvider,
      returnTo: string,
      challenge: string,
      lang: Language,
      deleting = false,
    ) {
      const params = new URLSearchParams({ return: returnTo, challenge, lang });
      if (deleting) params.set('purpose', 'delete');
      return `${base}/v1/auth/${provider}/start?${params.toString()}`;
    },

    /** Finishes a browser sign-in with the code the tab came back with. */
    async finish(code: string, verifier: string): Promise<Account> {
      return account(await post('/v1/auth/finish', { code, verifier, device: deviceId() }));
    },

    /** Apple's sheet on an iPhone: its ID token, and the nonce whose SHA-256 Apple was given. */
    async apple(idToken: string, nonce: string): Promise<Account> {
      return account(await post('/v1/auth/apple', { idToken, nonce, device: deviceId() }));
    },

    /** Emails a 6-digit code. */
    async sendCode(email: string, lang: Language): Promise<void> {
      await post('/v1/auth/email/start', { email, lang });
    },

    async emailSignIn(email: string, code: string): Promise<Account> {
      return account(await post('/v1/auth/email/finish', { email, code, device: deviceId() }));
    },

    /** Deletes the account and its synced files (an Apple account also needs `apple`). */
    async deleteAccount(token: string, apple?: AppleProof): Promise<void> {
      await post('/v1/account/delete', apple ?? {}, token);
    },

    /** A new token for the same account. */
    async renew(token: string): Promise<string> {
      return (await post<{ token: string }>('/v1/token', {}, token)).token;
    },
  };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
