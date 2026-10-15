// Reading cards aloud with the phone's own text-to-speech voices (free, works offline).
import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { showSnackbar } from '@/components/Snackbar';
import { t } from '@/lib/i18n';
import {
  cardLanguageName,
  detectLanguage,
  SPEECH_LOCALES,
  type CardLanguage,
} from '@/lib/language';

let voices: Promise<Speech.Voice[]> | undefined;
let audioMode: { inSilentMode: boolean; ready: Promise<void> } | undefined;
const warned = new Set<CardLanguage>();

function hasVoice(lang: CardLanguage): Promise<boolean> {
  voices ??= Speech.getAvailableVoicesAsync().catch(() => []);
  return voices.then(
    // If the engine reports no voices at all, assume it can still speak.
    (list) => list.length === 0 || list.some((v) => v.language.toLowerCase().startsWith(lang)),
  );
}

/**
 * iPhone mutes an app's sound in Silent mode unless it says it plays audio on purpose. Tapping the
 * speaker is asking for sound (like a podcast), so that plays in Silent mode too. Cards read by
 * themselves (Read cards aloud, on by default) follow the Silent switch, so a phone set to silent
 * stays silent. Either way it mixes with any music instead of stopping it. Only the kind of audio
 * is set here: nothing plays until a card is read. Android has no Silent switch for media.
 */
function prepareAudio(inSilentMode: boolean): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve();
  if (audioMode?.inSilentMode !== inSilentMode) {
    audioMode = {
      inSilentMode,
      ready: setAudioModeAsync({
        playsInSilentMode: inSilentMode,
        interruptionMode: 'mixWithOthers',
      }).catch(
        () => {}, // speaking still works, just not in Silent mode
      ),
    };
  }
  return audioMode.ready;
}

/**
 * Read `text` aloud, replacing anything playing, in `language` (the deck's setting for that side)
 * or, when that's null, the language guessed from the text. `auto`: read by itself rather than
 * from a tap (follows iPhone's Silent switch). `onDone` runs when the reading ends or can't start
 * (not when it's cut off by the next card).
 */
export function speak(
  text: string,
  options: { language?: CardLanguage | null; auto?: boolean; onDone?: () => void } = {},
): void {
  const trimmed = text.trim();
  if (!trimmed) {
    options.onDone?.();
    return;
  }
  const lang = options.language ?? detectLanguage(trimmed);
  Speech.stop();
  void prepareAudio(!options.auto).then(() =>
    Speech.speak(trimmed, {
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
      showSnackbar(t('speech.noVoice', { language: cardLanguageName(lang) ?? lang }));
    });
  }
}

export function stopSpeaking(): void {
  Speech.stop();
}
