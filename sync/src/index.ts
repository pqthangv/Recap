// The sync API (roadmap Phase 6.2): the app's SyncStore (src/lib/sync/round.ts) over HTTP.
//   GET  /v1/files               the head, every file name and the server's clock
//   GET  /v1/files/<name>        one file
//   PUT  /v1/files/<name>        a new file; 409 if the name is taken
//   PUT  /v1/head?base=<n|none>  a new head, if the current one's base is still n; 409 if not
//   POST /v1/files/remove        {"names": [...]}: deletes those files
//   GET  /health                 "ok", touching nothing (for uptime checks)
// Every /v1 request needs "Authorization: Bearer <token>"; the token's account is the folder.
// Listing, creating and the head count toward the daily limits (src/limits.ts): 429 daily_limit
// when today's writes are used up, 507 storage_full when there's no room for a file.
import { accountOf } from './auth';
import {
  createFile,
  isFileName,
  isHead,
  listNames,
  MAX_FILE_BYTES,
  MAX_HEAD_BYTES,
  MAX_REMOVE,
  readFile,
  readHead,
  removeFiles,
  storedBytes,
  swapHead,
} from './files';
import { chargeWrite, releaseBytes, type Charge } from './limits';

export { Counter } from './limits';

/** The website, and the app's web version running locally (Metro, npm run web:preview). */
const ORIGINS = new Set([
  'https://recapflashcards.com',
  'https://www.recapflashcards.com',
  'http://localhost:8081',
  'http://localhost:8090',
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (!origin || !ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);
const refused = (charge: Exclude<Charge, 'ok'>) =>
  charge === 'writes' ? fail('daily_limit', 429) : fail('storage_full', 507);

/** The body's declared size, or null without one (chunked uploads aren't accepted). */
function bodySize(request: Request): number | null {
  const size = Number(request.headers.get('Content-Length') ?? NaN);
  return request.body && Number.isSafeInteger(size) && size > 0 ? size : null;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health') return new Response('ok');
  if (!url.pathname.startsWith('/v1/')) return fail('not_found', 404);

  const account = await accountOf(request, env.TOKEN_SECRET);
  if (!account) return fail('unauthorized', 401);
  if (!(await env.LIMITER.limit({ key: account })).success) return fail('too_many_requests', 429);

  const path = url.pathname.slice('/v1/'.length);
  const { method } = request;

  if (path === 'files' && method === 'GET') {
    const charge = await chargeWrite(env, account);
    if (charge !== 'ok') return refused(charge);
    const [names, head] = await Promise.all([
      listNames(env.FILES, account),
      readHead(env.FILES, account),
    ]);
    return json({ head: head?.head ?? null, names, now: Date.now() });
  }

  if (path === 'files/remove' && method === 'POST') {
    const size = bodySize(request);
    if (size === null || size > MAX_HEAD_BYTES * 2) return fail('bad_names', 400);
    const names = ((await request.json().catch(() => null)) as { names?: unknown } | null)?.names;
    const ok =
      Array.isArray(names) &&
      names.length <= MAX_REMOVE &&
      names.every((name) => typeof name === 'string' && isFileName(name));
    if (!ok) return fail('bad_names', 400);
    const freed = await storedBytes(env.FILES, account, names);
    await removeFiles(env.FILES, account, names);
    await releaseBytes(env, account, freed);
    return json({ ok: true });
  }

  if (path === 'head' && method === 'PUT') {
    const base = url.searchParams.get('base') ?? '';
    const expected = base === 'none' ? null : /^\d{1,15}$/.test(base) ? Number(base) : undefined;
    if (expected === undefined) return fail('bad_base', 400);
    const size = bodySize(request);
    if (size === null) return fail('length_required', 411);
    if (size > MAX_HEAD_BYTES) return fail('too_large', 413);
    const head: unknown = await request.json().catch(() => null);
    if (!isHead(head)) return fail('bad_head', 400);
    const charge = await chargeWrite(env, account);
    if (charge !== 'ok') return refused(charge);
    const swapped = await swapHead(env.FILES, account, expected, head);
    return swapped ? json({ ok: true }) : fail('changed', 409);
  }

  if (path.startsWith('files/')) {
    const name = path.slice('files/'.length);
    if (!isFileName(name)) return fail('bad_name', 400);
    if (method === 'GET') {
      const file = await readFile(env.FILES, account, name);
      if (!file) return fail('not_found', 404);
      return new Response(file.body, { headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'PUT') {
      const size = bodySize(request);
      if (size === null) return fail('length_required', 411);
      if (size > MAX_FILE_BYTES) return fail('too_large', 413);
      const charge = await chargeWrite(env, account, size);
      if (charge !== 'ok') return refused(charge);
      let created = false;
      try {
        created = await createFile(env.FILES, account, name, request.body!);
      } finally {
        if (!created) await releaseBytes(env, account, size);
      }
      return created ? json({ ok: true }, 201) : fail('taken', 409);
    }
  }
  return fail('not_found', 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const response = await handle(request, env);
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
    return response;
  },
} satisfies ExportedHandler<Env>;
