// The web version of client.ts. In the browser, expo-sqlite runs SQLite in a worker (the data is
// kept in the site's private file storage, OPFS) and makes synchronous calls wait for it. Two
// things break the app's synchronous database code there, and are handled here:
// - The worker only starts once the page's main thread is free, and a synchronous call blocks
//   that thread, so a synchronous open at startup waits for itself ("Sync operation timeout").
//   The database is opened asynchronously instead, by openDatabase() at startup (db/setup.ts),
//   before anything else touches it; after that the worker is running.
// - Where the browser has Atomics.pause (Chrome/Edge), each synchronous call gives up after about a
//   million pauses, a few dozen milliseconds: less than a big query can take. Without it,
//   expo-sqlite waits seconds instead (as in Safari and Firefox), so it's hidden from expo-sqlite.
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';

(Atomics as { pause?: unknown }).pause = undefined;

let opened: SQLiteDatabase | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The error the start screen shows as "Recap is already open in another tab". */
const otherTab = () => new Error('NoModificationAllowedError: Recap is open in another tab');

/**
 * Only one page at a time can use the database file (the browser locks it). Each Recap page holds
 * a Web Lock while it's open, so a page can tell "another tab has Recap open" (the lock stays taken)
 * from "this is a reload" (the old page lets go of it within a moment). Resolves once this page
 * holds the lock; the lock is released when the page closes.
 */
async function takeTheDatabase(): Promise<void> {
  const locks = navigator.locks;
  if (!locks) return;
  const held = new Promise<boolean>((resolve) => {
    void locks.request('recap-database', () => {
      resolve(true);
      return new Promise<never>(() => {}); // keep it until the page closes
    });
    setTimeout(() => resolve(false), 4000);
  });
  const free = await locks.query().then((s) => !s.held?.some((l) => l.name === 'recap-database'));
  if (!(await held)) throw otherTab();
  // After a reload the old page's worker can hold the file a moment after its lock is gone.
  if (!free) await sleep(300);
}

/** Opens the database. On the web this must finish before any query runs. */
export async function openDatabase(): Promise<void> {
  if (opened) return;
  await takeTheDatabase();
  try {
    // No WAL: the browser's file storage gives SQLite no shared memory, so it keeps the default.
    opened = await openDatabaseAsync('recap.db', { enableChangeListener: true });
  } catch (e) {
    // Still locked: expo-sqlite can't try again in the same worker ("Invalid VFS state"), but a
    // fresh page can. Reload once; if that fails too, the start screen explains.
    const locked = /NoModificationAllowedError|Access Handle/i.test(String(e));
    if (locked && !sessionStorage.getItem('recap-reloaded')) {
      sessionStorage.setItem('recap-reloaded', '1');
      location.reload();
      await new Promise<never>(() => {});
    }
    throw locked ? otherTab() : e;
  }
  sessionStorage.removeItem('recap-reloaded');
}

/**
 * Stands in for the connection until openDatabase() has run, then forwards everything to it.
 * Drizzle only uses the connection to run queries, so `db` can be made (and queries built, as some
 * modules do when they load) straight away.
 */
export const sqlite = new Proxy({} as SQLiteDatabase, {
  get(_, key) {
    if (!opened) throw new Error('The database was used before openDatabase() finished');
    const value = Reflect.get(opened, key, opened);
    return typeof value === 'function' ? value.bind(opened) : value;
  },
});

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;
