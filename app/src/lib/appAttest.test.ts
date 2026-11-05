import { readFileSync } from 'fs';
import { join } from 'path';

import {
  attestServer,
  createAppAttest,
  generateClientData,
  parseAttestState,
  RETRY_REFUSED_MS,
  type AttestOptions,
  type AttestState,
} from './appAttest';

const KEY = 'a'.repeat(43) + '=';
const NEW_KEY = 'b'.repeat(43) + '=';
const NOW = 1_800_000_000_000;

function invalidKey() {
  return Object.assign(new Error('Invalid key provided'), {
    code: 'ERR_APP_INTEGRITY_INVALID_KEY',
  });
}

function setup(change: Partial<AttestOptions> = {}, saved: AttestState | null = null) {
  let state = saved;
  let clock = NOW;
  const keys = [KEY, NEW_KEY];
  const options = {
    supported: true,
    generateKey: jest.fn(() => Promise.resolve(keys.shift() ?? 'none')),
    attestKey: jest.fn((key: string, challenge: string) =>
      Promise.resolve(`attestation:${key}:${challenge}`),
    ),
    generateAssertion: jest.fn((key: string, data: string) =>
      Promise.resolve(`assertion:${key}:${data}`),
    ),
    server: {
      challenge: jest.fn(() => Promise.resolve('challenge-1')),
      register: jest.fn((): Promise<'ok' | 'refused'> => Promise.resolve('ok')),
    },
    load: () => state,
    save: jest.fn((next: AttestState | null) => {
      state = next;
    }),
    now: () => clock,
    onError: jest.fn(),
    ...change,
  };
  return {
    options,
    attest: createAppAttest(options),
    state: () => state,
    later: (ms: number) => {
      clock += ms;
    },
  };
}

describe('App Attest', () => {
  it('registers a key once, then signs every request', async () => {
    const { options, attest, state } = setup();
    expect(await attest.phone()).toBeNull(); // not registered yet
    expect(await attest.ticket('request 1')).toEqual({
      attestKeyId: KEY,
      assertion: `assertion:${KEY}:request 1`,
    });
    expect(options.server.register).toHaveBeenCalledWith(
      KEY,
      `attestation:${KEY}:challenge-1`,
      'challenge-1',
    );
    expect(state()).toEqual({ keyId: KEY, registered: true });
    expect(await attest.phone()).toEqual({ attestKeyId: KEY });

    await attest.ticket('request 2');
    expect(options.generateKey).toHaveBeenCalledTimes(1);
    expect(options.server.register).toHaveBeenCalledTimes(1);
    expect(options.generateAssertion).toHaveBeenLastCalledWith(KEY, 'request 2');
  });

  it('registers only once when requests come at the same time', async () => {
    const { options, attest } = setup();
    attest.warmUp();
    await Promise.all([attest.ticket('a'), attest.ticket('b')]);
    expect(options.generateKey).toHaveBeenCalledTimes(1);
    expect(options.server.register).toHaveBeenCalledTimes(1);
  });

  it('gives no proof where App Attest is missing (the simulator)', async () => {
    const { options, attest } = setup({ supported: false });
    expect(await attest.ticket('x')).toBeNull();
    expect(await attest.phone()).toBeNull();
    expect(options.generateKey).not.toHaveBeenCalled();
  });

  it('goes on without a proof when offline, keeps the key and tries again', async () => {
    const challenge = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue('challenge-2');
    const { options, attest, state } = setup({
      server: { challenge, register: jest.fn(() => Promise.resolve('ok' as const)) },
    });
    expect(await attest.ticket('x')).toBeNull();
    expect(state()).toEqual({ keyId: KEY, registered: false });
    expect(await attest.ticket('x')).not.toBeNull();
    expect(options.generateKey).toHaveBeenCalledTimes(1); // the same key
    expect(options.onError).toHaveBeenCalledTimes(1);
  });

  it('waits a day after the server refuses, then tries the same key again', async () => {
    const register = jest
      .fn<Promise<'ok' | 'refused'>, []>()
      .mockResolvedValueOnce('refused')
      .mockResolvedValue('ok');
    const { options, attest, state, later } = setup({
      server: { challenge: jest.fn(() => Promise.resolve('c')), register },
    });
    expect(await attest.ticket('x')).toBeNull();
    expect(state()).toEqual({ keyId: KEY, registered: false, refusedAt: NOW });
    expect(await attest.ticket('x')).toBeNull();
    expect(register).toHaveBeenCalledTimes(1); // not again the same day
    later(RETRY_REFUSED_MS);
    expect(await attest.ticket('x')).toEqual({ attestKeyId: KEY, assertion: `assertion:${KEY}:x` });
    expect(options.generateKey).toHaveBeenCalledTimes(1);
  });

  it('makes a new key when Apple no longer takes the old one', async () => {
    const generateAssertion = jest
      .fn()
      .mockRejectedValueOnce(invalidKey())
      .mockImplementation((key: string) => Promise.resolve(`assertion:${key}`));
    const { attest, state } = setup({ generateAssertion }, { keyId: KEY, registered: true });
    expect(await attest.ticket('x')).toBeNull();
    expect(state()).toBeNull();
    expect(await attest.ticket('x')).toEqual({ attestKeyId: KEY, assertion: `assertion:${KEY}` });
  });

  it('never throws, even when the settings can’t be read', async () => {
    const { attest } = setup({
      load: () => {
        throw new Error('database closed');
      },
    });
    expect(await attest.phone()).toBeNull();
    expect(await attest.ticket('x')).toBeNull();
  });

  it('gives up waiting after the timeout, while registering goes on', async () => {
    jest.useFakeTimers();
    let answer: (value: string) => void = () => undefined;
    const challenge = jest.fn(() => new Promise<string>((resolve) => (answer = resolve)));
    const { attest, state } = setup({
      timeoutMs: 1000,
      server: { challenge, register: jest.fn(() => Promise.resolve('ok' as const)) },
    });
    const pending = attest.ticket('x');
    await jest.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    answer('late challenge');
    await jest.advanceTimersByTimeAsync(0);
    expect(state()).toEqual({ keyId: KEY, registered: true });
    jest.useRealTimers();
  });
});

describe('what the iPhone signs', () => {
  it('is the request itself', () => {
    expect(generateClientData('topic', 'Volcanoes')).toBe('recap-generate\ntopic\nVolcanoes');
  });

  it("is built exactly like the server's (server/app/appattest.py)", () => {
    const python = readFileSync(
      join(__dirname, '..', '..', '..', 'server', 'app', 'appattest.py'),
      'utf8',
    );
    expect(python).toContain('return f"recap-generate\\n{mode}\\n{text}"');
  });
});

describe('the saved key', () => {
  it('reads what was saved, and nothing else', () => {
    expect(parseAttestState({ keyId: KEY, registered: true })).toEqual({
      keyId: KEY,
      registered: true,
    });
    expect(parseAttestState({ keyId: KEY, registered: false, refusedAt: NOW })).toEqual({
      keyId: KEY,
      registered: false,
      refusedAt: NOW,
    });
    expect(parseAttestState({ keyId: '', registered: true })).toBeNull();
    expect(parseAttestState({ keyId: KEY })).toBeNull();
    expect(parseAttestState('a key')).toBeNull();
    expect(parseAttestState(null)).toBeNull();
  });
});

describe("the server's side", () => {
  const answer = (status: number, body: unknown = {}) =>
    ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

  it('gets a challenge and registers the key', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(answer(200, { challenge: 'c1' }))
      .mockResolvedValueOnce(answer(200, { ok: true }));
    const server = attestServer({ baseUrl: 'http://server/', fetch });
    expect(await server.challenge()).toBe('c1');
    expect(await server.register(KEY, 'att', 'c1')).toBe('ok');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'http://server/v1/attest/challenge',
      'http://server/v1/attest/key',
    ]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      key_id: KEY,
      attestation: 'att',
      challenge: 'c1',
    });
  });

  it('tells a refusal from trouble', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(answer(400, { error: 'attestation_failed' }))
      .mockResolvedValueOnce(answer(503))
      .mockResolvedValueOnce(answer(200, {}));
    const server = attestServer({ baseUrl: 'http://server', fetch });
    expect(await server.register(KEY, 'att', 'c')).toBe('refused');
    await expect(server.register(KEY, 'att', 'c')).rejects.toThrow('503');
    await expect(server.challenge()).rejects.toThrow('none');
  });
});
