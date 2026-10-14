import { readImageSize } from './imageSize';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const zeros = (n: number) => new Array<number>(n).fill(0);

const png = (w: number, h: number) =>
  bytes(
    [0x89],
    'PNG',
    [0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    be32(w),
    be32(h),
    [8, 6, 0, 0, 0],
    zeros(4),
  );

const sof = (w: number, h: number) => [
  0xff,
  0xc0,
  ...be16(17),
  8,
  ...be16(h),
  ...be16(w),
  3,
  ...zeros(9),
];

describe('readImageSize', () => {
  it('reads PNG, even a 33-byte fake that claims 100,000 × 100,000', () => {
    expect(readImageSize(png(640, 480))).toEqual({ width: 640, height: 480 });
    const bomb = png(100_000, 100_000);
    expect(bomb.length).toBe(33);
    expect(readImageSize(bomb)).toEqual({ width: 100_000, height: 100_000 });
  });

  it("reads JPEG from its frame, skipping the EXIF segment and the thumbnail's frame inside it", () => {
    const exif = [...'Exif']
      .map((c) => c.charCodeAt(0))
      .concat(zeros(2), sof(160, 120), zeros(4000));
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe1],
      be16(exif.length + 2),
      exif,
      [0xff, 0xff],
      sof(4000, 3000),
    );
    expect(readImageSize(jpeg)).toEqual({ width: 4000, height: 3000 });
  });

  it('reads JPEG progressive frames, and gives up at the image data', () => {
    const progressive = bytes(
      [0xff, 0xd8, 0xff, 0xc2],
      be16(17),
      [8],
      be16(50),
      be16(70),
      zeros(10),
    );
    expect(readImageSize(progressive)).toEqual({ width: 70, height: 50 });
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xda], be16(4), zeros(10)))).toBeNull();
  });

  it('reads GIF, counting frames that reach past the canvas', () => {
    const frame = (w: number, h: number) => [
      0x2c,
      ...le16(0),
      ...le16(0),
      ...le16(w),
      ...le16(h),
      0,
      2,
      2,
      0x4c,
      0x01,
      0,
    ];
    const gif = (w: number, h: number, ...frames: number[][]) =>
      bytes(
        'GIF89a',
        le16(w),
        le16(h),
        [0x80, 0, 0],
        zeros(6),
        [0x21, 0xf9, 4, 0, 0, 0, 0, 0],
        ...frames,
        [0x3b],
      );
    expect(readImageSize(gif(320, 200, frame(320, 200)))).toEqual({ width: 320, height: 200 });
    expect(readImageSize(gif(1, 1, frame(1, 1), frame(65_535, 65_535)))).toEqual({
      width: 65_535,
      height: 65_535,
    });
  });

  it('reads all three kinds of WebP', () => {
    const riff = (chunk: string, data: number[]) =>
      bytes('RIFF', le32(4 + 8 + data.length), 'WEBP', chunk, le32(data.length), data, zeros(8));
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(1280), ...le16(720)]);
    expect(readImageSize(lossy)).toEqual({ width: 1280, height: 720 });
    const lossless = riff('VP8L', [0x2f, ...le32((800 - 1) | ((600 - 1) << 14))]);
    expect(readImageSize(lossless)).toEqual({ width: 800, height: 600 });
    const extended = riff('VP8X', [0x10, 0, 0, 0, ...le24(16_777_215), ...le24(16_777_215)]);
    expect(readImageSize(extended)).toEqual({ width: 16_777_216, height: 16_777_216 });
  });

  it('reads BMP, including top-down rows (negative height)', () => {
    const bmp = (w: number, h: number) =>
      bytes('BM', zeros(12), le32(40), le32(w), le32(h), zeros(28));
    expect(readImageSize(bmp(64, 32))).toEqual({ width: 64, height: 32 });
    expect(readImageSize(bmp(64, -32 >>> 0))).toEqual({ width: 64, height: 32 });
  });

  it("gives null for cut-off files, zero sizes and things that aren't pictures", () => {
    expect(readImageSize(new Uint8Array())).toBeNull();
    expect(readImageSize(png(640, 480).subarray(0, 20))).toBeNull();
    expect(readImageSize(png(0, 480))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff]))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8], sof(10, 10).slice(0, 6)))).toBeNull();
    expect(readImageSize(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(readImageSize(bytes('PK', [3, 4], zeros(40)))).toBeNull();
  });
});
