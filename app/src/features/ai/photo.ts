// "Photo" tab: take or choose a photo of notes and read its text on the phone (ML Kit; no upload).
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { recognizeText } from 'expo-mlkit-ocr';

import { AiError, tidyOcrText } from '@/lib/ai';
import { t } from '@/lib/i18n';

/** The photo's text, or null if the user cancelled. */
export async function readTextFromPhoto(from: 'camera' | 'library'): Promise<string | null> {
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new AiError('input', t('ai.needCamera'));
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;

  const uri = result.assets[0].uri;
  try {
    const text = tidyOcrText((await recognizeText(uri)).text);
    if (!text) {
      throw new AiError('input', t('ai.noTextInPhoto'));
    }
    return text;
  } finally {
    try {
      new File(uri).delete(); // the picker's copy in the cache; the photo itself isn't kept
    } catch {
      // Already gone.
    }
  }
}
