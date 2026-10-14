import { clearTestDb, migrateTestDb } from '../../../test/db';

import { setSetting } from '@/db/settings';

import { markReminderOffered, shouldOfferReminder } from './offer';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../../test/db').createTestClient());

beforeAll(() => migrateTestDb());
beforeEach(() => clearTestDb());

describe('the reminder offer', () => {
  it('is made once to someone without reminders', () => {
    expect(shouldOfferReminder()).toBe(true);
    markReminderOffered();
    expect(shouldOfferReminder()).toBe(false);
  });

  it('is not made when reminders are already on', () => {
    setSetting('reminderEnabled', true);
    expect(shouldOfferReminder()).toBe(false);
  });
});
