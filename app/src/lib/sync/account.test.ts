import {
  AccountError,
  base64url,
  createAccountClient,
  errorFromResponse,
  needsRenewal,
  readTabResult,
  RENEW_AFTER_MS,
  toBase64url,
  tokenIssuedAt,
} from './account';

const DEVICE = '7f4c2a5e-9d1b-4c3a-8e2f-0a1b2c3d4e5f';

/** A token-shaped string with this iat (seconds); the signature isn't checked here. */
const tokenAt = (iatSeconds: number) =>
  `e30.${toBase64url(btoa(JSON.stringify({ sub: 'x', iat: iatSeconds })))}.sig`;

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('server answers', () => {
  it.each([
    [429, 'too_many_requests', 'busy'],
    [429, 'wait', 'wait'],
    [429, 'address_limit', 'addressLimit'],
    [429, 'email_limit', 'emailLimit'],
    [400, 'bad_email', 'badEmail'],
    [400, 'expired', 'expired'],
    [503, 'not_set_up', 'notSetUp'],
    [400, 'bad_code', 'failed'],
    [401, 'bad_token', 'failed'],
    [401, 'unauthorized', 'signedOut'],
    [502, 'email_failed', 'server'],
    [500, undefined, 'server'],
  ])('%i %s → %s', (status, error, kind) => {
    expect(errorFromResponse(status, error ? { error } : null).kind).toBe(kind);
  });

  it('says how many tries are left for a wrong code', () => {
    expect(errorFromResponse(400, { error: 'wrong_code', triesLeft: 3 }).message).toBe(
      "That code isn't right. 3 tries left.",
    );
    expect(errorFromResponse(400, { error: 'wrong_code', triesLeft: 1 }).message).toBe(
      "That code isn't right. 1 try left.",
    );
    // The review address has no count.
    expect(errorFromResponse(400, { error: 'wrong_code' }).message).toBe("That code isn't right.");
  });
});

describe('the browser tab', () => {
  it('ends with a code, or why there is none', () => {
    expect(readTabResult('recapcards://signed-in?code=abc.def')).toEqual({ code: 'abc.def' });
    expect(readTabResult('recapcards://signed-in?error=cancelled')).toEqual({ error: 'cancelled' });
    expect(readTabResult('recapcards://signed-in?error=failed')).toEqual({ error: 'failed' });
    expect(readTabResult('https://recapflashcards.com/account')).toEqual({ error: 'failed' });
    expect(readTabResult('not a link')).toEqual({ error: 'failed' });
  });

  it('starts at the Worker with where to come back to, the challenge and the language', () => {
    const client = createAccountClient({ baseUrl: 'https://sync.test/', deviceId: () => DEVICE });
    const url = new URL(client.startUrl('google', 'recapcards://signed-in', 'c'.repeat(43), 'vi'));
    expect(url.origin + url.pathname).toBe('https://sync.test/v1/auth/google/start');
    expect(url.searchParams.get('return')).toBe('recapcards://signed-in');
    expect(url.searchParams.get('challenge')).toBe('c'.repeat(43));
    expect(url.searchParams.get('lang')).toBe('vi');
  });

  it('base64url has no padding or +/', () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe('-_-_');
    expect(toBase64url('+/8=')).toBe('-_8');
  });
});

describe('the account client', () => {
  it('finishes a sign-in with this device and keeps what the Worker answered', async () => {
    const { fetch, calls } = fakeFetch(200, {
      token: 't',
      provider: 'google',
      email: 'an@x.com',
      created: true,
    });
    const client = createAccountClient({
      baseUrl: 'https://sync.test',
      deviceId: () => DEVICE,
      fetch,
    });
    expect(await client.finish('code', 'verifier')).toEqual({
      token: 't',
      provider: 'google',
      email: 'an@x.com',
    });
    expect(calls[0]!.url).toBe('https://sync.test/v1/auth/finish');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      code: 'code',
      verifier: 'verifier',
      device: DEVICE,
    });
  });

  it('leaves out an email the Worker didn’t send (Apple)', async () => {
    const { fetch } = fakeFetch(200, { token: 't', provider: 'apple', created: false });
    const client = createAccountClient({
      baseUrl: 'https://sync.test',
      deviceId: () => DEVICE,
      fetch,
    });
    expect(await client.apple('id-token', 'nonce')).toEqual({ token: 't', provider: 'apple' });
  });

  it('renews with the token, and turns failures into AccountError', async () => {
    const ok = fakeFetch(200, { token: 'new' });
    const client = createAccountClient({
      baseUrl: 'https://sync.test',
      deviceId: () => DEVICE,
      fetch: ok.fetch,
    });
    expect(await client.renew('old')).toBe('new');
    expect((ok.calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer old');

    const wrong = fakeFetch(400, { error: 'wrong_code', triesLeft: 2 });
    const failing = createAccountClient({
      baseUrl: 'https://sync.test',
      deviceId: () => DEVICE,
      fetch: wrong.fetch,
    });
    await expect(failing.emailSignIn('a@x.com', '123456')).rejects.toMatchObject({
      kind: 'wrongCode',
    });

    const page = fakeFetch(502, '<html>Bad gateway</html>');
    await expect(
      createAccountClient({
        baseUrl: 'https://s',
        deviceId: () => DEVICE,
        fetch: page.fetch,
      }).sendCode('a@x.com', 'en'),
    ).rejects.toMatchObject({ kind: 'server' });

    const offline = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof globalThis.fetch;
    const error = await createAccountClient({
      baseUrl: 'https://s',
      deviceId: () => DEVICE,
      fetch: offline,
    })
      .renew('t')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccountError);
    expect((error as AccountError).kind).toBe('offline');
  });
});

describe('renewing', () => {
  it('reads when the token was made', () => {
    expect(tokenIssuedAt(tokenAt(1_700_000_000))).toBe(1_700_000_000_000);
    expect(tokenIssuedAt('garbage')).toBe(0);
  });

  it('asks for a new token once the token is a week old', () => {
    const made = 1_700_000_000;
    const token = tokenAt(made);
    expect(needsRenewal(token, made * 1000 + RENEW_AFTER_MS - 1)).toBe(false);
    expect(needsRenewal(token, made * 1000 + RENEW_AFTER_MS + 1)).toBe(true);
    // A token that can't be read is renewed (the Worker decides whether it's still good).
    expect(needsRenewal('garbage', made * 1000)).toBe(true);
  });
});
