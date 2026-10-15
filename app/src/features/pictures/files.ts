// Saving pictures into the app's own folder (documents/media): checked, shrunk and compressed
// first. Cards reference them as "media/<name>" (see lib/pictures.ts); pictureUri() turns that
// into this phone's path, so it's the only place a reference becomes a file.
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { keptPictureRefs, pictureRefsInUse } from '@/db/cards';
import { newId } from '@/lib/id';
import { readImageSize, type ImageSize } from '@/lib/imageSize';
import {
  checkPicture,
  fitWithin,
  keepCompressed,
  PICTURE_EXTENSION,
  PICTURE_FOLDER,
  PICTURE_QUALITY,
  pictureExtension,
  pictureName,
  pictureRef,
  shouldCompress,
  unusedPictureFiles,
} from '@/lib/pictures';
import { can } from '@/lib/platform';

/** A picture Recap won't store: too big to open safely, or not a picture it can read. */
export class PictureError extends Error {
  kind: 'tooBig' | 'unreadable';
  constructor(kind: 'tooBig' | 'unreadable') {
    super(`Picture refused: ${kind}`);
    this.kind = kind;
  }
}

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, PICTURE_FOLDER);
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** The file on this phone for a picture reference, or null. */
export function pictureUri(ref: string | null | undefined): string | null {
  if (!can.pictures) return null; // the web version has no picture files (cards show without them)
  const name = pictureName(ref);
  return name ? new File(Paths.document, PICTURE_FOLDER, name).uri : null;
}

/** WebP copy of the picture at `uri`, shrunk to fit; null if it can't be decoded. */
async function compress(uri: string): Promise<{ file: File; resized: boolean } | null> {
  try {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const size = fitWithin(original.width, original.height);
    const image = size
      ? await ImageManipulator.manipulate(original).resize(size).renderAsync()
      : original;
    const saved = await image.saveAsync({ format: SaveFormat.WEBP, compress: PICTURE_QUALITY });
    return { file: new File(saved.uri), resized: size !== null };
  } catch (e) {
    console.warn(e);
    return null;
  }
}

const tryDelete = (file: File) => {
  try {
    if (file.exists) file.delete();
  } catch (e) {
    console.warn(e);
  }
};

/**
 * Moves a finished picture into the media folder, named by its MD5, and returns its reference.
 * If the same picture is there already (another card's), that file is used.
 */
function keep(file: File, extension: string): string {
  const name = `${file.md5 ?? newId()}.${extension}`;
  const stored = new File(mediaDir(), name);
  // Copy, then delete: a file moved out of the cache folder would still be counted as cache.
  if (!stored.exists) file.copySync(stored);
  tryDelete(file);
  return pictureRef(name);
}

/**
 * Stores a picture and returns its reference. Its size is read from the file's header first, and
 * anything too big to open safely is refused with a PictureError, before anything decodes it
 * (`known`: the size the photo picker reported, for formats the header reader doesn't know).
 * Big pictures are shrunk to fit and everything is saved as WebP, unless that wouldn't make it
 * smaller. GIFs stay as they are (they may be animated), and so does a picture with a readable
 * header that can't be decoded, so an import never fails over one odd file.
 */
export async function storePicture(
  bytes: Uint8Array,
  fileName: string,
  known?: ImageSize | null,
): Promise<string> {
  const header = readImageSize(bytes);
  const check = checkPicture(header ?? known ?? null, bytes.length);
  if (check !== 'ok') throw new PictureError(check);

  const original = new File(Paths.cache, `${newId()}.${pictureExtension(fileName)}`);
  original.create();
  original.write(bytes);

  const compressed = shouldCompress(fileName) ? await compress(original.uri) : null;
  if (compressed && keepCompressed(bytes.length, compressed.file.size, compressed.resized)) {
    tryDelete(original);
    return keep(compressed.file, PICTURE_EXTENSION);
  }
  if (compressed) tryDelete(compressed.file);
  else if (shouldCompress(fileName) && !header) {
    tryDelete(original); // couldn't be opened, and isn't a format phones are sure to show
    throw new PictureError('unreadable');
  }
  return keep(original, pictureExtension(fileName));
}

/** Deletes these pictures, unless a card still uses them (deleted cards too: Undo). */
export function deleteUnusedPictures(refs: Iterable<string>): void {
  const candidates = [...new Set(refs)];
  const used = pictureRefsInUse(candidates);
  for (const ref of candidates) {
    const name = pictureName(ref);
    if (name && !used.has(ref)) tryDelete(new File(Paths.document, PICTURE_FOLDER, name));
  }
}

/**
 * Removes picture files no card needs any more (see unusedPictureFiles). Run at start-up, before
 * anything is shown, so it never meets a picture that's being added or an Undo that's waiting.
 */
export function sweepPictures(now = Date.now()): void {
  if (!can.pictures) return;
  try {
    const dir = new Directory(Paths.document, PICTURE_FOLDER);
    if (!dir.exists) return;
    const inUse = new Set(keptPictureRefs(now).flatMap((ref) => pictureName(ref) ?? []));
    // Dates are only read for files no card uses, which are few.
    const unused = dir
      .list()
      .flatMap((f) => (f instanceof File && !inUse.has(f.name) ? [f] : []))
      .map((f) => ({ name: f.name, lastModified: f.lastModified }));
    for (const name of unusedPictureFiles(unused, inUse, now)) tryDelete(new File(dir, name));
  } catch (e) {
    console.warn(e);
  }
}
