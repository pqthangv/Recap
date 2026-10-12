import { fitWithin, keepCompressed, shouldCompress } from './pictures';

describe('pictures', () => {
  it('shrinks big pictures to fit, keeping their shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(1000, 5000)).toEqual({ width: 256, height: 1280 });
    expect(fitWithin(20000, 10)).toEqual({ width: 1280, height: 1 });
  });

  it('leaves pictures that already fit', () => {
    expect(fitWithin(1280, 720)).toBeNull();
    expect(fitWithin(64, 64)).toBeNull();
  });

  it('keeps GIFs as they are, compresses everything else', () => {
    expect(shouldCompress('dance.GIF')).toBe(false);
    expect(shouldCompress('photo.jpg')).toBe(true);
    expect(shouldCompress('diagram.png')).toBe(true);
  });

  it('only uses the compressed copy when it helps', () => {
    expect(keepCompressed(500_000, 80_000, false)).toBe(true);
    expect(keepCompressed(2_000, 3_000, false)).toBe(false); // tiny icon: keep the original
    expect(keepCompressed(2_000, 3_000, true)).toBe(true); // shrunk: always use it
    expect(keepCompressed(2_000, 0, true)).toBe(false); // nothing was written
  });
});
