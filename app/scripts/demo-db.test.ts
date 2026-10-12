// A ready-made Recap database with the demo decks, for App Store screenshots in the iPhone
// simulator (.github/workflows/ios.yml copies it into the app before Maestro takes the pictures):
//
//   MAKE_DEMO_DB=path/to/recap.db npx jest scripts/demo-db
//
// It's made by the app's own migrations and backup import, and marked as already seeded so the
// welcome decks don't appear. Skipped in normal `npm test` runs.
import { closeTestDb, migrateTestDb } from '../test/db';

import type * as BackupDb from '@/db/backup';
import type * as SettingsDb from '@/db/settings';
import { SEEDED_KEY } from '@/lib/settings';

import { makeDemo } from './demo-data';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
/* eslint-enable @typescript-eslint/no-require-imports */

const OUT: string | undefined = process.env.MAKE_DEMO_DB;
// jest.mock factories may only use variables whose names start with "mock", and they run when the
// client is first imported. So the db modules are required inside the test (after mockFile is set),
// and an old file is removed here, before the database opens: deleting an open file would lose
// everything written to it.
const mockFile = OUT ?? ':memory:';
jest.mock('@/db/client', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  if (mockFile !== ':memory:') require('fs').rmSync(mockFile, { force: true });
  return require('../test/db').createTestClient(mockFile);
  /* eslint-enable @typescript-eslint/no-require-imports */
});

(OUT ? it : it.skip)('writes the demo database', async () => {
  await migrateTestDb(); // opens the file (the mock above) and runs the app's migrations
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { importBackup } = require('@/db/backup') as typeof BackupDb;
  const { setRawSetting } = require('@/db/settings') as typeof SettingsDb;
  /* eslint-enable @typescript-eslint/no-require-imports */
  const result = importBackup(makeDemo(Date.now()));
  setRawSetting(SEEDED_KEY, true);
  closeTestDb();
  console.log(`${result.decks} decks, ${result.cards} cards, ${result.reviews} reviews → ${OUT}`);
  expect(fs.statSync(OUT as string).size).toBeGreaterThan(0);
  expect(result.cards).toBeGreaterThan(50);
});
