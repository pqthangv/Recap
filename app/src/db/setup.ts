import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { normalizeStoredPictureRefs } from './cards';
import { db, openDatabase } from './client';
import migrations from './migrations';

/** Brings the on-device database up to the current schema. Run once at startup. */
export async function setupDatabase(): Promise<void> {
  await openDatabase(); // the web opens it here (client.web.ts); on a phone it's already open
  await migrate(db, migrations);
  normalizeStoredPictureRefs(); // pictures saved before 1.0.3 (cheap once done: nothing matches)
}
