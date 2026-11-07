import * as Speech from 'expo-speech';

import { speak, stopSpeaking } from './speech';

// Nothing is ever played: the phone's speech engine is replaced by a recorder.
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => undefined) }));
jest.mock('@/components/Snackbar', () => ({ showSnackbar: jest.fn() }));

const spoken = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const calls = (Speech.speak as jest.Mock).mock.calls;
  const [text, options] = calls[calls.length - 1];
  return { text, language: options.language };
};

describe('speak', () => {
  it('reads formulas in words, in the side language', async () => {
    speak('What is $\\sqrt{2}$?', { language: 'en' });
    expect(await spoken()).toEqual({ text: 'What is the square root of 2?', language: 'en-US' });
    speak('Giải $x^2 = 9$', { language: 'vi' });
    expect(await spoken()).toEqual({ text: 'Giải x bình phương bằng 9', language: 'vi-VN' });
  });

  it('guesses the language without the TeX', async () => {
    speak('Tính $\\frac{1}{2}$');
    expect(await spoken()).toEqual({ text: 'Tính 1 phần 2', language: 'vi-VN' });
  });

  it('starts only the latest reading', async () => {
    const calls = (Speech.speak as jest.Mock).mock.calls;
    const before = calls.length;
    speak('first card', { language: 'en' });
    speak('second card', { language: 'en' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.slice(before).map(([text]) => text)).toEqual(['second card']);

    speak('third card', { language: 'en' });
    stopSpeaking();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.length).toBe(before + 1);
  });

  it('reads text without math as it is', async () => {
    speak('Delivery is free for orders over $50.');
    expect(await spoken()).toEqual({
      text: 'Delivery is free for orders over $50.',
      language: 'en-US',
    });
  });
});
