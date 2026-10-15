// Files for import: picking them, reading them, and saving Anki pictures into the app.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { deserializeDatabaseAsync } from 'expo-sqlite';
import { create } from 'zustand';

import { readPickedText } from '@/features/files/picked';
import { deleteUnusedPictures, PictureError, storePicture } from '@/features/pictures/files';
import { readAnkiCollection, type AnkiCard } from '@/lib/import/anki';
import { isImageName, openApkg, type ApkgPackage } from '@/lib/import/apkg';
import { t } from '@/lib/i18n';
import { parseTable, type Table } from '@/lib/import/csv';
import { isWeb } from '@/lib/platform';

export class ImportFileError extends Error {}

export type TableDraft = { fileName: string; table: Table };
export type AnkiDraft = { fileName: string; uri: string; size: number | undefined };

/** Hands the picked file from the Import screen to the screen that imports it. */
export const useImportDraft = create<{ table: TableDraft | null; anki: AnkiDraft | null }>(() => ({
  table: null,
  anki: null,
}));

/** "Spanish words.apkg" → "Spanish words" */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || t('import.defaultDeck');
}

/**
 * The document picker copies each picked file into the cache and never removes it, so a few big
 * decks would quietly fill the phone. Copies from earlier imports are deleted before each pick,
 * and after a deck is imported.
 */
export function clearPickedFiles(): void {
  if (isWeb) return; // the browser keeps picked files in memory only
  try {
    const dir = new Directory(Paths.cache, 'DocumentPicker');
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn(e);
  }
}

async function pick(type: string[]) {
  clearPickedFiles();
  const picked = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
  return picked.canceled || picked.assets.length === 0 ? null : picked.assets[0];
}

/** Pick a CSV/TSV file and parse it. Returns null if the user cancelled. */
export async function pickTableFile(): Promise<TableDraft | null> {
  // Android labels CSV files inconsistently, so accept any file and check the name.
  const asset = await pick(['*/*']);
  if (!asset) return null;
  if (/\.(xlsx?|numbers|ods)$/i.test(asset.name)) {
    throw new ImportFileError(t('import.errorSpreadsheet'));
  }
  const table = parseTable(await readPickedText(asset));
  if (table.rows.length === 0) throw new ImportFileError(t('import.errorNoRows'));
  if (table.columns.length < 2) {
    throw new ImportFileError(t('import.errorTwoColumns'));
  }
  return { fileName: asset.name, table };
}

/** Pick an Anki .apkg file. Returns null if the user cancelled. */
export async function pickAnkiFile(): Promise<AnkiDraft | null> {
  const asset = await pick(['*/*']);
  if (!asset) return null;
  if (!/\.(apkg|colpkg)$/i.test(asset.name)) {
    throw new ImportFileError(t('import.errorNotApkgName'));
  }
  return { fileName: asset.name, uri: asset.uri, size: asset.size };
}

const MAX_DECK_BYTES = 300 * 1024 * 1024;

export type LoadedAnkiDeck = { cards: AnkiCard[]; skipped: number; pkg: ApkgPackage };

/** Opens the package and reads its cards (the collection database is opened in memory). */
export async function loadAnkiDeck(draft: AnkiDraft): Promise<LoadedAnkiDeck> {
  if (draft.size && draft.size > MAX_DECK_BYTES) {
    throw new ImportFileError(t('import.errorTooBig'));
  }
  const pkg = await openApkg(await new File(draft.uri).bytes());
  const db = await deserializeDatabaseAsync(pkg.collection);
  try {
    const result = readAnkiCollection(
      { all: <T>(sql: string) => db.getAllSync<T>(sql) },
      baseName(draft.fileName),
    );
    return { ...result, pkg };
  } finally {
    await db.closeAsync();
  }
}

/** Different pictures the cards use (that Recap can show), in order. */
function pictureNames(cards: readonly AnkiCard[]): string[] {
  return [
    ...new Set(cards.flatMap((c) => (c.image && isImageName(c.image.name) ? [c.image.name] : []))),
  ];
}

/** How many of the cards' pictures are in the package, and how many it left out. */
export function pictureCounts(
  cards: readonly AnkiCard[],
  pkg: ApkgPackage,
): { found: number; missing: number } {
  const names = pictureNames(cards);
  const found = names.filter((name) => pkg.hasMedia(name)).length;
  return { found, missing: names.length - found };
}

export type CopiedPictures = {
  /** File name in the deck → picture reference ("media/<name>"). */
  refs: Map<string, string>;
  /** Pictures left out because they're too big to open safely (or not really pictures). */
  refused: number;
};

/**
 * Saves the pictures the cards use into the app (checked, shrunk and compressed). Only referenced
 * pictures are saved; sounds are skipped (shared decks can carry lots of audio). A picture that's
 * refused (see storePicture) is left out, and its card comes in without it.
 */
export async function copyPictures(
  cards: readonly AnkiCard[],
  pkg: ApkgPackage,
  onProgress: (done: number, total: number) => void,
): Promise<CopiedPictures> {
  const names = pictureNames(cards).filter((name) => pkg.hasMedia(name));
  const refs = new Map<string, string>();
  let refused = 0;
  try {
    for (const [i, name] of names.entries()) {
      onProgress(i, names.length);
      const bytes = await pkg.readMedia(name);
      if (!bytes) continue;
      try {
        refs.set(name, await storePicture(bytes, name));
      } catch (e) {
        if (!(e instanceof PictureError)) throw e;
        refused++;
      }
    }
  } catch (e) {
    deleteUnusedPictures(refs.values()); // don't leave half an import behind
    throw e;
  }
  onProgress(names.length, names.length);
  return { refs, refused };
}

/**
 * Deletes saved pictures no card uses, e.g. when every card was already there. Pictures are named
 * by their content, so one may also belong to an older card: that one stays.
 */
export function removeUnusedPictures(copied: CopiedPictures | null): void {
  if (copied) deleteUnusedPictures(copied.refs.values());
}
