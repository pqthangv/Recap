// Apple App Attest for "Create with AI" on iPhones (roadmap 6.0, 1.0.8): the iPhone's version of
// Play Integrity (integrity.ts), checked by Recap's server (server/app/appattest.py). Once per
// install the phone makes a key in its security chip and Apple vouches for it to the server; then
// each "Make cards" request is signed with that key, and the server counts the day's AI cards by
// the key. Anything that goes wrong (an old iPhone, the simulator, Apple or the server busy,
// offline) just means no proof: the server counts by this install, as before, and it's tried
// again later. The key never leaves the phone; the server only sees Apple's id for it.
import { codeOf, NO_TICKETS, withTimeout, type TicketSource } from './integrity';

/** What this phone remembers (a device-only setting): its key, and whether the server took it.
 *  `refusedAt`: when the server last refused the key's attestation (tried again a day later). */
export type AttestState = { keyId: string; registered: boolean; refusedAt?: number };

/** The server's side of registering a key (attestServer below). */
export type AttestServer = {
  challenge(): Promise<string>;
  /** "refused": the server didn't take Apple's attestation. Other trouble throws. */
  register(keyId: string, attestation: string, challenge: string): Promise<'ok' | 'refused'>;
};

export type AttestOptions = {
  /** DCAppAttestService.isSupported: false on the simulator and very old iPhones. */
  supported: boolean;
  /** @expo/app-integrity's generateKeyAsync / attestKeyAsync / generateAssertionAsync. */
  generateKey: () => Promise<string>;
  attestKey: (keyId: string, challenge: string) => Promise<string>;
  generateAssertion: (keyId: string, clientData: string) => Promise<string>;
  server: AttestServer;
  load: () => AttestState | null;
  save: (state: AttestState | null) => void;
  now?: () => number;
  /** Longest wait for a proof before a request goes on without one. */
  timeoutMs?: number;
  onError?: (error: unknown) => void;
};

/** Apple no longer knows the key (e.g. the app's data came back on another iPhone). */
const INVALID_KEY = 'ERR_APP_INTEGRITY_INVALID_KEY';
export const RETRY_REFUSED_MS = 24 * 60 * 60 * 1000;

/**
 * What an iPhone signs for a "Make cards" request: the request itself, so its signature can't be
 * moved to another one. The server builds the same text (server/app/appattest.py
 * generate_client_data; appAttest.test.ts checks the two match).
 */
export const generateClientData = (mode: string, text: string) =>
  `recap-generate\n${mode}\n${text}`;

export function parseAttestState(value: unknown): AttestState | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<AttestState>;
  if (typeof v.keyId !== 'string' || !v.keyId || typeof v.registered !== 'boolean') return null;
  return {
    keyId: v.keyId,
    registered: v.registered,
    ...(typeof v.refusedAt === 'number' ? { refusedAt: v.refusedAt } : {}),
  };
}

export function createAppAttest({
  supported,
  generateKey,
  attestKey,
  generateAssertion,
  server,
  load,
  save,
  now = Date.now,
  timeoutMs = 15_000,
  onError = () => undefined,
}: AttestOptions): TicketSource {
  if (!supported) return NO_TICKETS;
  let registering: Promise<string | null> | undefined;

  /** Forgets a key Apple no longer takes: the next try makes a new one. */
  function dropKeyIf(e: unknown) {
    if (codeOf(e) === INVALID_KEY) save(null);
  }

  async function register(): Promise<string | null> {
    let state = load();
    if (state?.registered) return state.keyId;
    if (state?.refusedAt && now() - state.refusedAt < RETRY_REFUSED_MS) return null;
    try {
      if (!state) {
        state = { keyId: await generateKey(), registered: false };
        save(state);
      }
      const challenge = await server.challenge();
      const attestation = await attestKey(state.keyId, challenge);
      if ((await server.register(state.keyId, attestation, challenge)) === 'refused') {
        save({ ...state, refusedAt: now() });
        return null;
      }
      save({ keyId: state.keyId, registered: true });
      return state.keyId;
    } catch (e) {
      onError(e);
      dropKeyIf(e);
      return null;
    }
  }

  /** This phone's registered key, registering it first if needed (one try at a time). */
  const registered = () => {
    registering ??= register().finally(() => {
      registering = undefined;
    });
    return registering;
  };

  return {
    warmUp() {
      void registered();
    },
    async phone() {
      try {
        const state = load();
        return state?.registered ? { attestKeyId: state.keyId } : null;
      } catch (e) {
        onError(e);
        return null;
      }
    },
    async ticket(request) {
      try {
        // Registering goes on in the background if it takes longer than this.
        const keyId = await withTimeout(registered(), timeoutMs);
        if (!keyId) return null;
        const assertion = await withTimeout(generateAssertion(keyId, request), timeoutMs);
        return { attestKeyId: keyId, assertion };
      } catch (e) {
        onError(e);
        dropKeyIf(e);
        return null;
      }
    },
  };
}

/** Recap's server's side of registering a key (server/app/api.py /v1/attest/…). */
export function attestServer({
  baseUrl,
  fetch: doFetch = fetch,
  timeoutMs = 70_000,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  /** The free server can take a minute to wake up. */
  timeoutMs?: number;
}): AttestServer {
  const base = baseUrl.replace(/\/+$/, '');

  async function post(path: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async challenge() {
      const response = await post('/v1/attest/challenge', {});
      if (!response.ok) throw new Error(`attest challenge: ${response.status}`);
      const { challenge } = (await response.json()) as { challenge?: unknown };
      if (typeof challenge !== 'string' || !challenge) throw new Error('attest challenge: none');
      return challenge;
    },
    async register(keyId, attestation, challenge) {
      const response = await post('/v1/attest/key', { key_id: keyId, attestation, challenge });
      if (response.ok) return 'ok';
      if (response.status === 400) return 'refused';
      throw new Error(`attest key: ${response.status}`);
    },
  };
}
