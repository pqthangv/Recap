// How pictures are stored: shrunk and compressed when they come into the app, so the folder (and
// later, sync) stays small. WebP keeps transparency, is smaller than JPEG, and shows on Android,
// iOS and the web.

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
