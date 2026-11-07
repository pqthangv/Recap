import * as Speech from 'expo-speech';

import { speak, VOICES_WAIT_MS } from './speech';

// The website in a browser that never lists its voices: expo's list never arrives. Nothing is
// ever played.
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(() => new Promise(() => {})),
}));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => undefined) }));
jest.mock('@/components/Snackbar', () => ({ showSnackbar: jest.fn() }));
jest.mock('@/lib/platform', () => ({ ...jest.requireActual('@/lib/platform'), isWeb: true }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("reads with the usual tag when the voice list doesn't come", async () => {
  speak('Hello there', { language: 'en' });
  await jest.advanceTimersByTimeAsync(VOICES_WAIT_MS - 100);
  expect(Speech.speak).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(100);
  expect(Speech.speak).toHaveBeenCalledWith(
    'Hello there',
    expect.objectContaining({ language: 'en-US' }),
  );
});
