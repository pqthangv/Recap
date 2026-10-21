// Reading cards aloud with the phone's own text-to-speech voices (free, works offline).
import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { showSnackbar } from '@/components/Snackbar';
import { t } from '@/lib/i18n';
import { sideToText } from '@/lib/math/plainText';
import { speakSide } from '@/lib/math/speak';
import { isWeb } from '@/lib/platform';
import {
  cardLanguageName,
  detectLanguage,
  SPEECH_LOCALES,
  type CardLanguage,
} from '@/lib/language';

let voices: Promise<Speech.Voice[]> | undefined;
let audioReady: Promise<void> | undefined;
const warned = new Set<CardLanguage>();

function hasVoice(lang: CardLanguage): Promise<boolean> {
  voices ??= Speech.getAvailableVoicesAsync().catch(() => []);
  return voices.then(
    // If the engine reports no voices at all, assume it can still speak.
    (list) => list.length === 0 || list.some((v) => v.language.toLowerCase().startsWith(lang)),
  );
}

/**
 * iPhone mutes an app's sound in Silent mode unless it says it plays audio on purpose. Reading a
 * card aloud is something you ask for (like a podcast), so Recap plays it in Silent mode too, also
 * when cards are read by themselves (user decision 2026-10-16; turn reading off in Settings
 * instead), and mixes with any music instead of stopping it. Set once and never switched back and
 * forth. Only the kind of audio is set here: nothing plays until a card is read. Android has no
 * Silent switch for media, so nothing changes there.
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

/**
 * Read `text` aloud, replacing anything playing, in `language` (the deck's setting for that side)
 * or, when that's null, the language guessed from the text. `onDone` runs when the reading ends or
 * can't start (not when it's cut off by the next card).
 */
export function speak(
  text: string,
  options: { language?: CardLanguage | null; onDone?: () => void } = {},
): void {
  const trimmed = text.trim();
  if (!trimmed) {
    options.onDone?.();
    return;
  }
  // The language is guessed without the formulas' TeX ("\frac" isn't English), and formulas
  // are read in words ("x squared", "x bình phương").
  const lang = options.language ?? detectLanguage(sideToText(trimmed));
  const words = speakSide(trimmed, lang);
  Speech.stop();
  void prepareAudio().then(() =>
    Speech.speak(words, {
      language: SPEECH_LOCALES[lang],
      rate: 0.95,
      onDone: options.onDone,
      onError: options.onDone,
    }),
  );
  // Every phone has an English voice; for the others, say once if this phone has none.
  if (lang !== 'en' && !warned.has(lang)) {
    hasVoice(lang).then((ok) => {
      if (ok || warned.has(lang)) return;
      warned.add(lang);
      const message = isWeb ? 'speech.noVoiceWeb' : 'speech.noVoice';
      showSnackbar(t(message, { language: cardLanguageName(lang) ?? lang }));
    });
  }
}

export function stopSpeaking(): void {
  Speech.stop();
}
