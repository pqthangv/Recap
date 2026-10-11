// Reading cards aloud with the phone's own text-to-speech voices (free, works offline).
import * as Speech from 'expo-speech';

import { showSnackbar } from '@/components/Snackbar';
import { detectLanguage, SPEECH_LOCALES, type SpeechLanguage } from '@/lib/language';

let voices: Promise<Speech.Voice[]> | undefined;
const warned = new Set<SpeechLanguage>();

function hasVoice(lang: SpeechLanguage): Promise<boolean> {
  voices ??= Speech.getAvailableVoicesAsync().catch(() => []);
  return voices.then(
    // If the engine reports no voices at all, assume it can still speak.
    (list) => list.length === 0 || list.some((v) => v.language.toLowerCase().startsWith(lang)),
  );
}

/** Read `text` aloud in English or Vietnamese (detected from the text), replacing anything playing. */
export function speak(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const lang = detectLanguage(trimmed);
  Speech.stop();
  Speech.speak(trimmed, { language: SPEECH_LOCALES[lang], rate: 0.95 });
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
