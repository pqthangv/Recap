import {
  checkPicture,
  fitWithin,
  keepCompressed,
  normalizePictureRef,
  pictureExtension,
  pictureName,
  shouldCompress,
  unusedPictureFiles,
} from './pictures';

describe('checkPicture', () => {
  const MB = 1024 * 1024;

  it('accepts phone photos, up to 50 megapixels', () => {
    expect(checkPicture({ width: 4032, height: 3024 }, 4 * MB)).toBe('ok');
    expect(checkPicture({ width: 8160, height: 6120 }, 25 * MB)).toBe('ok'); // 50 MP
  });

  it('refuses pictures that would take too much memory to open', () => {
    expect(checkPicture({ width: 100_000, height: 100_000 }, 33)).toBe('tooBig');
    expect(checkPicture({ width: 10_000, height: 6_000 }, 1 * MB)).toBe('tooBig'); // 60 MP
    expect(checkPicture({ width: 20_000, height: 100 }, 1 * MB)).toBe('tooBig'); // too long a side
  });

  it('refuses big files and files whose size it can’t read', () => {
    expect(checkPicture({ width: 640, height: 480 }, 31 * MB)).toBe('tooBig');
    expect(checkPicture(null, 1000)).toBe('unreadable');
  });
});

describe('picture references', () => {
  it('turn old full paths into "media/<name>"', () => {
    const old = 'file:///data/user/0/com.recapcards.app/files/media/6f1c2a.webp';
    expect(pictureName(old)).toBe('6f1c2a.webp');
    expect(normalizePictureRef(old)).toBe('media/6f1c2a.webp');
    expect(normalizePictureRef('media/6f1c2a.webp')).toBe('media/6f1c2a.webp');
  });

  it('never point outside the media folder', () => {
    expect(normalizePictureRef('../../databases/recap.db')).toBe('media/recap.db');
    expect(pictureName('media/..')).toBeNull();
    expect(pictureName('media/.hidden')).toBeNull();
    expect(pictureName('media/a%2F..%2Fb')).toBeNull();
    expect(pictureName('media\\..\\x')).toBeNull();
    expect(pictureName('media/')).toBeNull();
    expect(pictureName(null)).toBeNull();
  });

  it('keep a plain extension', () => {
    expect(pictureExtension('Photo.JPG')).toBe('jpg');
    expect(pictureExtension('no extension')).toBe('img');
    expect(pictureExtension('x.svg+xml')).toBe('img');
  });
});

describe('unusedPictureFiles', () => {
  const now = Date.UTC(2026, 9, 13);
  const DAY = 24 * 60 * 60 * 1000;

  it('picks files no card uses that are over a day old', () => {
    const files = [
      { name: 'used.webp', lastModified: now - 30 * DAY },
      { name: 'old.webp', lastModified: now - 2 * DAY },
      { name: 'just-added.webp', lastModified: now - 60_000 }, // maybe in the editor right now
      { name: 'unknown-age.webp', lastModified: null },
    ];
    expect(unusedPictureFiles(files, new Set(['used.webp']), now)).toEqual(['old.webp']);
  });
});

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
