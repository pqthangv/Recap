// Pictures on cards (roadmap 6.4, part 5). Each is its own object in R2, <account>/pictures/<name>,
// named by its MD5 like on the phone (app/src/features/pictures/files.ts), so it's uploaded once
// however many cards or phones use it. Every upload is checked: at most 2 MB, a picture header with
// a sane size (read from the first bytes, never decoded), and the MD5 really is the name.
//   PUT  /v1/pictures/<name>      a new picture; 409 if it's there already
//   GET  /v1/pictures/<name>      one picture (404 if not)
//   GET  /v1/pictures             every picture's name, size and when it was uploaded
//   POST /v1/pictures/remove      {"names": [...]}: deletes them
// Uploads count toward the account's 500 a day and its 100 MB (src/limits.ts); listing counts as a
// write, like the sync files' listing. Pictures over 2 MB stay on the phone that has them.
import { hex } from './hash';
import { readImageSize } from './imageSize';
import { chargePictureUpload, chargeWrite, releaseBytes, type Charge } from './limits';

export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
/** The same limits as the app's checkPicture (app/src/lib/pictures.ts). */
const MAX_DIMENSION = 16_384;
const MAX_PIXELS = 50_000_000;
const MAX_REMOVE = 1000;

const NAME = /^[0-9a-f]{32}\.[a-z0-9]{1,5}$/;
export const isPictureName = (name: string) => NAME.test(name);

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const keyOf = (account: string, name: string) => `${account}/pictures/${name}`;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);
const refused = (charge: Exclude<Charge, 'ok'>) =>
  charge === 'closed'
    ? fail('account_deleted', 401)
    : charge === 'writes'
      ? fail('daily_limit', 429)
      : fail('storage_full', 507);

async function upload(request: Request, env: Env, account: string, name: string) {
  const size = Number(request.headers.get('Content-Length') ?? NaN);
  if (!request.body || !Number.isSafeInteger(size) || size <= 0) {
    return fail('length_required', 411);
  }
  if (size > MAX_PICTURE_BYTES) return fail('too_large', 413);
  const key = keyOf(account, name);
  if (await env.FILES.head(key)) return fail('exists', 409);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== size) return fail('bad_picture', 400);
  const picture = readImageSize(bytes);
  if (
    !picture ||
    picture.width > MAX_DIMENSION ||
    picture.height > MAX_DIMENSION ||
    picture.width * picture.height > MAX_PIXELS
  ) {
    return fail('not_a_picture', 415);
  }
  const md5 = hex(new Uint8Array(await crypto.subtle.digest('MD5', bytes)));
  if (md5 !== name.slice(0, 32)) return fail('wrong_name', 400);

  const charge = await chargePictureUpload(env, account, bytes.length);
  if (charge !== 'ok') return refused(charge);
  const extension = name.slice(name.indexOf('.') + 1);
  const stored = await env.FILES.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: TYPES[extension] ?? 'application/octet-stream' },
  });
  if (!stored) {
    // Another device sent the same picture a moment ago.
    await releaseBytes(env, account, bytes.length);
    return fail('exists', 409);
  }
  return json({ ok: true }, 201);
}

async function list(env: Env, account: string) {
  const charge = await chargeWrite(env, account);
  if (charge !== 'ok') return refused(charge);
  const prefix = keyOf(account, '');
  const pictures: { name: string; bytes: number; uploaded: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.FILES.list({ prefix, cursor });
    for (const object of page.objects) {
      const name = object.key.slice(prefix.length);
      if (isPictureName(name)) {
        pictures.push({ name, bytes: object.size, uploaded: object.uploaded.getTime() });
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ pictures });
}

async function remove(request: Request, env: Env, account: string) {
  const size = Number(request.headers.get('Content-Length') ?? NaN);
  if (!Number.isSafeInteger(size) || size <= 0 || size > 64 * 1024) return fail('bad_names', 400);
  const names = ((await request.json().catch(() => null)) as { names?: unknown } | null)?.names;
  const ok =
    Array.isArray(names) &&
    names.length <= MAX_REMOVE &&
    names.every((name) => typeof name === 'string' && isPictureName(name));
  if (!ok) return fail('bad_names', 400);
  const keys = (names as string[]).map((name) => keyOf(account, name));
  const objects = await Promise.all(keys.map((key) => env.FILES.head(key)));
  const freed = objects.reduce((sum, object) => sum + (object?.size ?? 0), 0);
  if (keys.length > 0) await env.FILES.delete(keys);
  await releaseBytes(env, account, freed);
  return json({ ok: true });
}

/** Answers /v1/pictures…, or null for any other path. */
export async function pictures(
  request: Request,
  env: Env,
  account: string,
  path: string,
): Promise<Response | null> {
  const { method } = request;
  if (path === 'pictures' && method === 'GET') return list(env, account);
  if (path === 'pictures/remove' && method === 'POST') return remove(request, env, account);
  if (!path.startsWith('pictures/')) return null;
  const name = path.slice('pictures/'.length);
  if (!isPictureName(name)) return fail('bad_name', 400);
  if (method === 'PUT') return upload(request, env, account, name);
  if (method === 'GET') {
    const object = await env.FILES.get(keyOf(account, name));
    if (!object) return fail('not_found', 404);
    return new Response(object.body, {
      headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
    });
  }
  return null;
}
