// Each account's sync files in R2, under "<account>/". The Worker never reads what's inside a sync
// file (the device checks every file it reads), so big files stay far inside a Worker's CPU limit.
// The names are the ones the app's src/lib/sync/files.ts makes; anything else is refused.

const FILE_NAME = /^(changes\/\d{10}|cards\/\d{10}|reviews\/\d{4}-\d{2}\/\d{10})\.json$/;
const HEAD = 'head.json';
const JSON_TYPE = { contentType: 'application/json' };

/**
 * A change file holds about 5,000 rows, but a snapshot's cards file holds every card and a month
 * file a whole month of answers, so this leaves room (Workers accept bodies up to 100 MB).
 */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_HEAD_BYTES = 64 * 1024;
/** R2 deletes at most this many keys at once. */
export const MAX_REMOVE = 1000;

export const isFileName = (name: string) => FILE_NAME.test(name);

/** The head says which snapshot is current; only its base matters here. */
export type Head = { base: number };

export function isHead(value: unknown): value is Head {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { base } = value as { base?: unknown };
  return typeof base === 'number' && Number.isSafeInteger(base) && base >= 0;
}

const keyOf = (account: string, name: string) => `${account}/${name}`;

export async function listNames(bucket: R2Bucket, account: string): Promise<string[]> {
  const prefix = `${account}/`;
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const object of page.objects) names.push(object.key.slice(prefix.length));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return names.filter(isFileName).sort();
}

export async function readHead(
  bucket: R2Bucket,
  account: string,
): Promise<{ head: Head; etag: string } | null> {
  const object = await bucket.get(keyOf(account, HEAD));
  return object ? { head: await object.json<Head>(), etag: object.etag } : null;
}

export function readFile(bucket: R2Bucket, account: string, name: string) {
  return bucket.get(keyOf(account, name));
}

/** Stores a new file; false if one with that name exists (R2 checks and writes in one step). */
export async function createFile(
  bucket: R2Bucket,
  account: string,
  name: string,
  body: ReadableStream,
): Promise<boolean> {
  const stored = await bucket.put(keyOf(account, name), body, {
    onlyIf: new Headers({ 'If-None-Match': '*' }),
    httpMetadata: JSON_TYPE,
  });
  return stored !== null;
}

/** Replaces the head if the current one's base is still `base` (null: there's none yet). */
export async function swapHead(
  bucket: R2Bucket,
  account: string,
  base: number | null,
  head: Head,
): Promise<boolean> {
  const current = await readHead(bucket, account);
  if ((current?.head.base ?? null) !== base) return false;
  const stored = await bucket.put(keyOf(account, HEAD), JSON.stringify(head), {
    onlyIf: current ? { etagMatches: current.etag } : new Headers({ 'If-None-Match': '*' }),
    httpMetadata: JSON_TYPE,
  });
  return stored !== null;
}

/** How many bytes these files take up (a file that's gone counts 0). */
export async function storedBytes(
  bucket: R2Bucket,
  account: string,
  names: readonly string[],
): Promise<number> {
  const objects = await Promise.all(names.map((name) => bucket.head(keyOf(account, name))));
  return objects.reduce((sum, object) => sum + (object?.size ?? 0), 0);
}

/** Deletes every object in the account's folder (deleting the account); the bytes freed. */
export async function removeAccountFiles(bucket: R2Bucket, account: string): Promise<number> {
  const prefix = `${account}/`;
  let freed = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    if (page.objects.length > 0) await bucket.delete(page.objects.map((object) => object.key));
    freed += page.objects.reduce((sum, object) => sum + object.size, 0);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return freed;
}

export async function removeFiles(bucket: R2Bucket, account: string, names: readonly string[]) {
  if (names.length > 0) await bucket.delete(names.map((name) => keyOf(account, name)));
}
