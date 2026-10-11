import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from './client';
import migrations from './migrations';

/** Brings the on-device database up to the current schema. Run once at startup. */
export function setupDatabase(): Promise<void> {
  return migrate(db, migrations);
}
