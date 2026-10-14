// How pictures are stored: shrunk and compressed when they come into the app, so the folder (and
// later, sync) stays small. WebP keeps transparency, is smaller than JPEG, and shows on Android,
// iOS and the web.
//
// Cards point at a picture with a reference like "media/<name>": a name inside the app's media
// folder, never a full path. The full path changes on iPhone when the app is updated, and differs
// on every phone, so it can't be stored or synced. Names are the file's MD5 hash, so the same
// picture is stored once (and, later, uploaded once).
import type { ImageSize } from './imageSize';

/** Pictures bigger than this are refused before anything opens them (a 50 MP photo fits). */
export const PICTURE_MAX_BYTES = 30 * 1024 * 1024;
/** Decoding needs about 4 bytes per pixel: 50 MP is ~200 MB, a 100,000 × 100,000 fake is 40 GB. */
export const PICTURE_MAX_PIXELS = 50_000_000;
export const PICTURE_MAX_DIMENSION = 16_384;

export type PictureCheck = 'ok' | 'tooBig' | 'unreadable';

/** Whether a picture of this size (from its header) and file size is safe to open. */
export function checkPicture(size: ImageSize | null, bytes: number): PictureCheck {
  if (bytes > PICTURE_MAX_BYTES) return 'tooBig';
  if (!size) return 'unreadable';
  const { width, height } = size;
  if (width > PICTURE_MAX_DIMENSION || height > PICTURE_MAX_DIMENSION) return 'tooBig';
  return width * height > PICTURE_MAX_PIXELS ? 'tooBig' : 'ok';
}

export const PICTURE_FOLDER = 'media';

/**
 * The file name a picture reference points at, or null if it isn't a plain name. Older cards
 * stored a full `file://…/media/<name>` URI, which gives the same name. Anything with path tricks
 * (a crafted backup saying "../recap.db") gives null, so it can't reach outside the media folder.
 */
export function pictureName(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const name = ref.slice(ref.lastIndexOf('/') + 1);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) ? name : null;
}

export const pictureRef = (name: string) => `${PICTURE_FOLDER}/${name}`;

/** "media/<name>" for any reference to a picture (old full URIs included), or null. */
export function normalizePictureRef(ref: string | null | undefined): string | null {
  const name = pictureName(ref);
  return name ? pictureRef(name) : null;
}

/** "photo.JPG" → "jpg"; anything odd → "img". */
export function pictureExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'img';
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Files in the media folder that no card uses any more: a replaced or removed picture, a deleted
 * card's, one picked in the editor and never saved, or an import that was cut short. Only files
 * older than a day go, to be safe with anything that writes the file before its card.
 */
export function unusedPictureFiles(
  files: readonly { name: string; lastModified: number | null }[],
  inUse: ReadonlySet<string>,
  now: number,
): string[] {
  return files
    .filter((f) => !inUse.has(f.name) && f.lastModified !== null && now - f.lastModified > DAY)
    .map((f) => f.name);
}

/** Longest side, in pixels, of a stored picture. Plenty for a phone screen. */
export const PICTURE_MAX_SIDE = 1280;
/** WebP quality (0–1). */
export const PICTURE_QUALITY = 0.7;
export const PICTURE_EXTENSION = 'webp';

/** The size that fits within `max` on both sides, or null when the picture already fits. */
export function fitWithin(
  width: number,
  height: number,
  max = PICTURE_MAX_SIDE,
): { width: number; height: number } | null {
  if (width <= max && height <= max) return null;
  const scale = max / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** GIFs may be animated, and re-encoding would keep only the first frame, so they stay as-is. */
export function shouldCompress(fileName: string): boolean {
  return !/\.gif$/i.test(fileName.trim());
}

/** Use the compressed copy if it's smaller, or if the original had to be shrunk to fit. */
export function keepCompressed(originalBytes: number, compressedBytes: number, resized: boolean) {
  return compressedBytes > 0 && (resized || compressedBytes < originalBytes);
}
