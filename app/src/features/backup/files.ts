// Moving data in and out of the app through files: the share sheet on a phone, downloads on the
// web (see features/files/picked.ts).
import * as DocumentPicker from 'expo-document-picker';

import { exportBackup, exportCardsCsv, importBackup, type ImportResult } from '@/db/backup';
import { discardPicked, readPickedText, shareTextFile } from '@/features/files/picked';
import { parseBackup } from '@/lib/backup';
import { fileDate } from '@/lib/format';
import { t } from '@/lib/i18n';

/** Everything (decks, cards, review history, settings) as one JSON file. */
export async function shareBackup(): Promise<void> {
  const now = Date.now();
  await shareTextFile(`recap-backup-${fileDate(now)}.json`, JSON.stringify(exportBackup(now)), {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: t('backup.shareTitle'),
  });
}

export async function shareCardsCsv(): Promise<void> {
  await shareTextFile(`recap-cards-${fileDate(Date.now())}.csv`, exportCardsCsv(), {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: t('backup.exportCardsTitle'),
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
  const asset = picked.assets[0];
  const text = await readPickedText(asset);
  discardPicked(asset); // the picker's copy in the cache isn't needed any more
  return importBackup(parseBackup(text));
}
