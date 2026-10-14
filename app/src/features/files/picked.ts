// Files the user picks (backups, spreadsheets, PDFs) and files the app hands back (exports).
// On a phone they're real files in the app's cache, read with expo-file-system and shared with the
// share sheet; picked.web.ts does the same in a browser.
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { UploadFile } from '@/lib/ai';

export function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).text();
}

/** The picked file, ready to upload. */
export function pickedUpload(asset: DocumentPickerAsset): UploadFile {
  return new File(asset.uri);
}

/** The picker leaves a copy in the cache; delete it once it's been read. */
export function discardPicked(asset: DocumentPickerAsset): void {
  try {
    new File(asset.uri).delete();
  } catch (e) {
    console.warn(e);
  }
}

/** Offers a text file through the share sheet (save to Files, Drive, email…). */
export async function shareTextFile(
  name: string,
  text: string,
  options: { mimeType: string; UTI: string; dialogTitle: string },
): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
  await Sharing.shareAsync(file.uri, options);
}
