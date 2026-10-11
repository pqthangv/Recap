import { db } from './client';

let depth = 0;

/**
 * Runs `fn` in one SQLite transaction. Re-entrant: repository functions can call each other and
 * share the outer transaction. All database calls are synchronous, so a simple depth counter is
 * safe. Inside `fn`, use `db` as usual — it's the same connection.
 */
export function transaction<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  try {
    return db.transaction(() => fn());
  } finally {
    depth--;
  }
}
