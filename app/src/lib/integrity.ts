// Play Integrity tickets for AI requests (roadmap 6.0, Android only for now): proof for Recap's
// server that a request comes from the real app, installed from Google Play, on a real phone.
// The server then counts the day's AI cards by the phone itself, which a reinstall doesn't
// change. The phone is sent as a SHA-256 of its Android ID, never the ID itself. Anything that
// goes wrong (no Google Play, an emulator, a slow phone) just means no ticket, and the server
// counts by this install, as before.

/** What the server needs to vouch for a phone. Each ticket works once. */
export type Ticket = { phoneId: string; token: string };

export type TicketSource = {
  /** Gets Google Play ready ahead of time (it can take a few seconds). Never throws. */
  warmUp(): void;
  /** This phone's id (hashed), or null where there's none. Never throws. */
  phoneId(): Promise<string | null>;
  /** A fresh ticket for one request, or null. Never throws. */
  ticket(): Promise<Ticket | null>;
};

/** iPhones and the website (for now), and any build without a project number. */
export const NO_TICKETS: TicketSource = {
  warmUp: () => undefined,
  phoneId: () => Promise.resolve(null),
  ticket: () => Promise.resolve(null),
};

export type TicketOptions = {
  /** The Google Cloud project linked in Play Console › Play Integrity API. */
  projectNumber: string;
  androidId: () => string;
  /** SHA-256 as hex. */
  sha256: (text: string) => Promise<string>;
  /** @expo/app-integrity's prepareIntegrityTokenProviderAsync / requestIntegrityCheckAsync. */
  prepare: (projectNumber: string) => Promise<void>;
  request: (requestHash: string) => Promise<string>;
  /** Longest wait for a ticket before going on without one. */
  timeoutMs?: number;
  onError?: (error: unknown) => void;
};

const PHONE_ID = /^[0-9a-f]{64}$/;
// Google Play's ticket maker expired: make a new one and try again (@expo/app-integrity's code).
const PROVIDER_INVALID = 'ERR_APP_INTEGRITY_PROVIDER_INVALID';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function codeOf(error: unknown): unknown {
  return error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
}

export function createTickets({
  projectNumber,
  androidId,
  sha256,
  prepare,
  request,
  timeoutMs = 10_000,
  onError = () => undefined,
}: TicketOptions): TicketSource {
  if (!projectNumber) return NO_TICKETS;
  let phone: Promise<string | null> | undefined;
  let ready: Promise<boolean> | undefined;

  const phoneId = () => {
    phone ??= (async () => {
      const id = androidId();
      if (!id) return null;
      const hash = (await sha256(`recap-phone:${id}`)).toLowerCase();
      return PHONE_ID.test(hash) ? hash : null;
    })().catch((e: unknown) => {
      onError(e);
      return null;
    });
    return phone;
  };

  // Once, kept for later requests; after a failure the next request tries again.
  const prepared = () => {
    ready ??= withTimeout(prepare(projectNumber), timeoutMs).then(
      () => true,
      (e: unknown) => {
        onError(e);
        ready = undefined;
        return false;
      },
    );
    return ready;
  };

  async function attempt(id: string, retried = false): Promise<Ticket | null> {
    if (!(await prepared())) return null;
    try {
      return { phoneId: id, token: await request(id) };
    } catch (e) {
      if (retried || codeOf(e) !== PROVIDER_INVALID) throw e;
      ready = undefined;
      return attempt(id, true);
    }
  }

  return {
    warmUp() {
      void phoneId();
      void prepared();
    },
    phoneId,
    async ticket() {
      try {
        const id = await phoneId();
        return id ? await withTimeout(attempt(id), timeoutMs) : null;
      } catch (e) {
        onError(e);
        return null;
      }
    },
  };
}
