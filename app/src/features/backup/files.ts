// Moving data in and out of the app through files and the share sheet.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportBackup, exportCardsCsv, importBackup, type ImportResult } from '@/db/backup';
import { parseBackup } from '@/lib/backup';
import { fileDate } from '@/lib/format';

async function shareText(
  name: string,
  text: string,
  options: { mimeType: string; UTI: string; dialogTitle: string },
) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
  await Sharing.shareAsync(file.uri, options);
}

/** Everything (decks, cards, review history, settings) as one JSON file. */
export async function shareBackup(): Promise<void> {
  const now = Date.now();
  await shareText(`recap-backup-${fileDate(now)}.json`, JSON.stringify(exportBackup(now)), {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save your Recap backup',
  });
}

export async function shareCardsCsv(): Promise<void> {
  await shareText(`recap-cards-${fileDate(Date.now())}.csv`, exportCardsCsv(), {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export cards',
  });
}

/** Pick a backup file and merge it in. Returns null if the user cancelled. */
export async function pickAndImportBackup(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    // Android often labels .json files as plain text or binary, so accept those too.
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.assets.length === 0) return null;
  const file = new File(picked.assets[0].uri);
  const text = await file.text();
  try {
    file.delete(); // the picker's copy in the cache isn't needed any more
  } catch (e) {
    console.warn(e);
  }
  return importBackup(parseBackup(text));
}
