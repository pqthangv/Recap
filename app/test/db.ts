// Test database: the app's real drizzle expo-sqlite driver and migrations, running on Node's
// built-in SQLite instead of the native module. Use it in a test file with:
//
//   jest.mock('@/db/client', () => require('../../test/db').createTestClient());
//   beforeAll(() => migrateTestDb());
//   beforeEach(() => clearTestDb());
import { drizzle } from 'drizzle-orm/expo-sqlite/driver';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import migrations from '@/db/migrations';
import * as schema from '@/db/schema';

type Params = SQLInputValue[];

/** The handful of expo-sqlite statement methods drizzle's expo driver uses. */
function expoLikeClient(raw: DatabaseSync) {
  return {
    prepareSync(sql: string) {
      const stmt = raw.prepare(sql);
      const returnsRows = stmt.columns().length > 0;
      return {
        executeSync(params: Params = []) {
          if (returnsRows) {
            const rows = stmt.all(...params);
            return {
              changes: 0,
              lastInsertRowId: 0,
              getAllSync: () => rows,
              getFirstSync: () => rows[0] ?? null,
            };
          }
          const r = stmt.run(...params);
          return {
            changes: Number(r.changes),
            lastInsertRowId: Number(r.lastInsertRowid),
            getAllSync: () => [],
            getFirstSync: () => null,
          };
        },
        executeForRawResultSync(params: Params = []) {
          stmt.setReturnArrays(true);
          const rows = stmt.all(...params);
          stmt.setReturnArrays(false);
          return { getAllSync: () => rows };
        },
      };
    },
  };
}

/** `file`: write the database to this file instead of memory (scripts/demo-db.test.ts). */
export function createTestClient(file = ':memory:') {
  const raw = new DatabaseSync(file);
  const sqlite = expoLikeClient(raw) as unknown as SQLiteDatabase;
  const db = drizzle(sqlite, { schema });
  testState = { raw, db };
  return { sqlite, db, openDatabase: async () => {} };
}

let testState: { raw: DatabaseSync; db: ReturnType<typeof drizzle<typeof schema>> } | undefined;

function state() {
  if (!testState) throw new Error('Call jest.mock("@/db/client", ...) with createTestClient first');
  return testState;
}

export async function migrateTestDb(): Promise<void> {
  // Importing the client triggers the jest.mock factory, which creates the database.
  require('@/db/client');
  await migrate(state().db, migrations);
}

export function clearTestDb(): void {
  const { raw } = state();
  for (const table of ['decks', 'cards', 'review_logs', 'settings'])
    raw.exec(`DELETE FROM ${table}`);
}

/** Closes the database (so a file database is complete on disk). */
export function closeTestDb(): void {
  state().raw.close();
}

/** Raw SQL access for assertions. */
export function rawQuery(sql: string, ...params: Params): Record<string, unknown>[] {
  return state()
    .raw.prepare(sql)
    .all(...params) as Record<string, unknown>[];
}
