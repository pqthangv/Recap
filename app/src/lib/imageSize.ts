// A picture's width and height, read from its first bytes without decoding it. A file of a few
// bytes can claim to be 100,000 × 100,000 pixels, and decoding it would need 40 GB of memory, so
// every picture is measured this way before anything opens it (see checkPicture in pictures.ts).
// Covers the formats Recap stores or imports: PNG, JPEG, GIF, WebP and BMP.

export type ImageSize = { width: number; height: number };

type Bytes = Uint8Array;

const u16be = (b: Bytes, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Bytes, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Bytes, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Bytes, i: number) =>
  b[i] * 0x1000000 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const u32le = (b: Bytes, i: number) =>
  b[i + 3] * 0x1000000 + ((b[i + 2] << 16) | (b[i + 1] << 8) | b[i]);
const i32le = (b: Bytes, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const ascii = (b: Bytes, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const size = (width: number, height: number): ImageSize | null =>
  width > 0 && height > 0 ? { width, height } : null;

function png(b: Bytes): ImageSize | null {
  // Signature, then the IHDR chunk: length, "IHDR", width, height (big-endian).
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return size(u32be(b, 16), u32be(b, 20));
}

function jpeg(b: Bytes): ImageSize | null {
  // Walk the segments to the first "start of frame". Thumbnails live inside APP segments, which
  // are skipped whole, so the size found is the picture's own.
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff) i++; // fill bytes
    const marker = b[i++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null; // end, or image data
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue; // no length
    if (i + 2 > b.length) return null;
    const length = u16be(b, i);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return i + 7 <= b.length ? size(u16be(b, i + 5), u16be(b, i + 3)) : null;
    i += length;
  }
  return null;
}

function gif(b: Bytes): ImageSize | null {
  if (b.length < 13) return null;
  // The canvas, then each frame, which can reach past it: the largest of all counts.
  let width = u16le(b, 6);
  let height = u16le(b, 8);
  const colorTable = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0);
  const skipSubBlocks = (at: number) => {
    let j = at;
    while (j < b.length && b[j] !== 0) j += b[j] + 1;
    return j + 1;
  };
  let i = 13 + colorTable(b[10]);
  while (i < b.length) {
    const block = b[i];
    if (block === 0x2c) {
      if (i + 10 > b.length) break;
      width = Math.max(width, u16le(b, i + 1) + u16le(b, i + 5));
      height = Math.max(height, u16le(b, i + 3) + u16le(b, i + 7));
      i = skipSubBlocks(i + 10 + colorTable(b[i + 9]) + 1); // + the LZW code size byte
    } else if (block === 0x21) {
      i = skipSubBlocks(i + 2);
    } else {
      break; // 0x3b is the end; anything else is damage, so stop with what's known
    }
  }
  return size(width, height);
}

function webp(b: Bytes): ImageSize | null {
  // "RIFF" size "WEBP", then the first chunk: its name, its length, its data from byte 20.
  if (b.length < 30) return null;
  switch (ascii(b, 12, 4)) {
    case 'VP8 ': // lossy: frame tag, start code 9d 01 2a, then 14-bit width and height
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      return size(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    case 'VP8L': {
      // lossless: signature 0x2f, then width − 1 and height − 1 in 14 bits each
      if (b[20] !== 0x2f) return null;
      const bits = u32le(b, 21);
      return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    case 'VP8X': // extended (animation, transparency): canvas width − 1 and height − 1, 24 bits each
      return size(u24le(b, 24) + 1, u24le(b, 27) + 1);
    default:
      return null;
  }
}

function bmp(b: Bytes): ImageSize | null {
  if (b.length < 26) return null;
  const header = u32le(b, 14);
  if (header === 12) return size(u16le(b, 18), u16le(b, 20)); // old OS/2 header
  if (header < 40) return null;
  return size(i32le(b, 18), Math.abs(i32le(b, 22))); // a negative height means top-down rows
}

/** Width and height from the file's header, or null if it isn't a picture this can read. */
export function readImageSize(b: Bytes): ImageSize | null {
  if (b.length < 4) return null;
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return png(b);
  if (b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
  if (ascii(b, 0, 4) === 'GIF8') return gif(b);
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webp(b);
  if (ascii(b, 0, 2) === 'BM') return bmp(b);
  return null;
}
