import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

// One database file on the device. The change listener powers live queries (src/db/live.ts).
export const sqlite = openDatabaseSync('recap.db', { enableChangeListener: true });
sqlite.execSync('PRAGMA journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;
