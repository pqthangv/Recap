// The account's files through the sync Worker (sync/src/index.ts): round.ts's SyncStore over HTTP.
// The Worker's answers become SyncHttpError kinds the app can show: signed out (401), paused until
// tomorrow (429 daily_limit), full (507), busy (429), offline, or a server problem.
import type { Head } from './files';
import type { SyncStore } from './round';

export type SyncHttpErrorKind = 'offline' | 'signedOut' | 'busy' | 'paused' | 'full' | 'server';

export class SyncHttpError extends Error {
  constructor(
    readonly kind: SyncHttpErrorKind,
    /** The underlying error or the Worker's answer, for logs. */
    readonly reason?: unknown,
  ) {
    super(kind);
  }
}

/** The error for a Worker answer that isn't one the store handles itself. */
export async function errorFromAnswer(response: Response): Promise<SyncHttpError> {
  let code = '';
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') code = body.error;
  } catch {
    // Not JSON (e.g. a proxy error page).
  }
  const reason = `${response.status} ${code}`.trim();
  if (response.status === 401) return new SyncHttpError('signedOut', reason);
  if (code === 'daily_limit') return new SyncHttpError('paused', reason);
  if (code === 'storage_full') return new SyncHttpError('full', reason);
  if (response.status === 429) return new SyncHttpError('busy', reason);
  return new SyncHttpError('server', reason);
}

export type HttpStoreOptions = {
  baseUrl: string;
  /** The account's current sign-in token. */
  token: () => string;
  fetch?: typeof fetch;
};

const TIMEOUT_MS = 60_000;

export function createHttpStore({
  baseUrl,
  token,
  fetch: doFetch = fetch,
}: HttpStoreOptions): SyncStore {
  const base = baseUrl.replace(/\/+$/, '');

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await doFetch(`${base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token()}`, ...init.headers },
        signal: controller.signal,
      });
    } catch (e) {
      throw new SyncHttpError('offline', e);
    } finally {
      clearTimeout(timer);
    }
  }

  const json = { 'Content-Type': 'application/json' };

  return {
    async list() {
      const response = await call('/v1/files');
      if (!response.ok) throw await errorFromAnswer(response);
      return (await response.json()) as { head: Head | null; names: string[]; now: number };
    },

    async read(name) {
      const response = await call(`/v1/files/${name}`);
      if (response.status === 404) return null;
      if (!response.ok) throw await errorFromAnswer(response);
      return response.text();
    },

    async create(name, text) {
      const response = await call(`/v1/files/${name}`, {
        method: 'PUT',
        headers: json,
        body: text,
      });
      if (response.status === 409) return false;
      if (!response.ok) throw await errorFromAnswer(response);
      return true;
    },

    async swapHead(base, head) {
      const response = await call(`/v1/head?base=${base ?? 'none'}`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify(head),
      });
      if (response.status === 409) return false;
      if (!response.ok) throw await errorFromAnswer(response);
      return true;
    },

    async remove(names) {
      const response = await call('/v1/files/remove', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ names }),
      });
      if (!response.ok) throw await errorFromAnswer(response);
    },
  };
}
