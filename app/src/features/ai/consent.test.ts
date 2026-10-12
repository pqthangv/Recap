import { Alert, type AlertButton } from 'react-native';

import { clearTestDb, migrateTestDb } from '../../../test/db';

import { askAiConsent, hasAiConsent, setAiConsent } from './consent';

// jest.mock factories can't use imports, so this one needs require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/db/client', () => require('../../../test/db').createTestClient());

beforeAll(() => migrateTestDb());
beforeEach(() => clearTestDb());
afterEach(() => jest.restoreAllMocks());

/** Answer the next alert by tapping the button with this text. */
function answer(text: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    (buttons as AlertButton[]).find((b) => b.text === text)?.onPress?.();
  });
}

describe('AI consent', () => {
  it('asks once, then remembers "Allow"', async () => {
    const alert = answer('Allow');
    await expect(askAiConsent()).resolves.toBe(true);
    expect(hasAiConsent()).toBe(true);
    await expect(askAiConsent()).resolves.toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('sends nothing after "Not now", and asks again next time', async () => {
    const alert = answer('Not now');
    await expect(askAiConsent()).resolves.toBe(false);
    expect(hasAiConsent()).toBe(false);
    await expect(askAiConsent()).resolves.toBe(false);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('asks again after it is turned off in Settings', async () => {
    setAiConsent(true);
    setAiConsent(false);
    const alert = answer('Not now');
    await expect(askAiConsent()).resolves.toBe(false);
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
