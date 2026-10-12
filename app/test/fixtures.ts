// Helpers for tests that read files from test/fixtures.
import { DatabaseSync } from 'node:sqlite';

import type { SqlReader } from '@/lib/import/anki';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const DIR = path.join(__dirname, 'fixtures');

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(DIR, name)));
}

export function fixtureText(name: string): string {
  return fs.readFileSync(path.join(DIR, name), 'utf8');
}

/**
 * Opens an Anki collection (bytes) as an in-memory database with Node's SQLite, the way the app
 * does with expo-sqlite's deserializeDatabaseAsync (so in-memory limits, like no WAL, apply).
 */
export function openCollection(bytes: Uint8Array): { reader: SqlReader; close: () => void } {
  const db = new DatabaseSync(':memory:');
  db.deserialize(bytes);
  return {
    reader: { all: <T>(sql: string) => db.prepare(sql).all() as T[] },
    close: () => db.close(),
  };
}
