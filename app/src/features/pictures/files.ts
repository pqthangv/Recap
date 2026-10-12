// Saving pictures into the app's own folder (documents/media), shrunk and compressed first.
// Cards reference them by file URI (image_uri); Phase 6 uploads them by content hash.
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { newId } from '@/lib/id';
import {
  fitWithin,
  keepCompressed,
  PICTURE_EXTENSION,
  PICTURE_QUALITY,
  shouldCompress,
} from '@/lib/pictures';

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, 'media');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

const extensionOf = (fileName: string) => fileName.split('.').pop()?.toLowerCase() || 'img';

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

/** Copy, then delete: a file moved out of the cache folder would still be counted as cache. */
function moveFromCache(file: File, destination: File): void {
  file.copySync(destination);
  tryDelete(file);
}

/**
 * Stores a picture and returns its URI. Big pictures are shrunk to fit and everything is saved as
 * WebP, unless that wouldn't make it smaller; GIFs and pictures that can't be decoded are kept
 * as they are, so an import never fails over one odd file.
 */
export async function storePicture(bytes: Uint8Array, fileName: string): Promise<string> {
  const dir = mediaDir();
  const original = new File(Paths.cache, `${newId()}.${extensionOf(fileName)}`);
  original.create();
  original.write(bytes);

  const compressed = shouldCompress(fileName) ? await compress(original.uri) : null;
  if (compressed && keepCompressed(bytes.length, compressed.file.size, compressed.resized)) {
    const stored = new File(dir, `${newId()}.${PICTURE_EXTENSION}`);
    moveFromCache(compressed.file, stored);
    tryDelete(original);
    return stored.uri;
  }
  if (compressed) tryDelete(compressed.file);
  const stored = new File(dir, `${newId()}.${extensionOf(fileName)}`);
  moveFromCache(original, stored);
  return stored.uri;
}

/** Deletes stored pictures (e.g. ones copied for an import that added no cards). */
export function deletePictures(uris: Iterable<string>): void {
  for (const uri of uris) tryDelete(new File(uri));
}
