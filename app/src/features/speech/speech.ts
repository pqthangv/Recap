// Reading cards aloud with the phone's own text-to-speech voices (free, works offline).
import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { showSnackbar } from '@/components/Snackbar';
import { detectLanguage, SPEECH_LOCALES, type SpeechLanguage } from '@/lib/language';

let voices: Promise<Speech.Voice[]> | undefined;
let audioReady: Promise<void> | undefined;
const warned = new Set<SpeechLanguage>();

function hasVoice(lang: SpeechLanguage): Promise<boolean> {
  voices ??= Speech.getAvailableVoicesAsync().catch(() => []);
  return voices.then(
    // If the engine reports no voices at all, assume it can still speak.
    (list) => list.length === 0 || list.some((v) => v.language.toLowerCase().startsWith(lang)),
  );
}

/**
 * iPhone mutes an app's sound in Silent mode unless it says it plays audio on purpose. Reading a
 * card aloud is something you ask for (like a podcast), so Recap plays it in Silent mode too, and
 * mixes with any music instead of stopping it. Only the kind of audio is set here: nothing plays
 * until a card is read. Android has no Silent switch for media, so nothing changes there.
 */
function prepareAudio(): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve();
  audioReady ??= setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
  }).catch(
    () => {}, // speaking still works, just not in Silent mode
  );
  return audioReady;
}

/** Read `text` aloud in English or Vietnamese (detected from the text), replacing anything playing. */
export function speak(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const lang = detectLanguage(trimmed);
  Speech.stop();
  void prepareAudio().then(() =>
    Speech.speak(trimmed, { language: SPEECH_LOCALES[lang], rate: 0.95 }),
  );
  if (lang === 'vi' && !warned.has(lang)) {
    hasVoice(lang).then((ok) => {
      if (ok || warned.has(lang)) return;
      warned.add(lang);
      showSnackbar(
        "This phone has no Vietnamese voice yet. Add one in your phone's Settings › Text-to-speech.",
      );
    });
  }
}

export function stopSpeaking(): void {
  Speech.stop();
}
