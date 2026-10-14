// Opening an .apkg / .colpkg file: a zip with the collection database and numbered media files.
//
// Two layouts exist:
//   • Classic ("Support older Anki versions"): collection.anki21 or collection.anki2, a JSON
//     "media" map, and media files stored as-is.
//   • Newer (Anki 2.1.50+ default): collection.anki21b, the "media" map and every media file are
//     zstd-compressed, and the map is protobuf. A placeholder collection.anki2 that only says
//     "please update" is included for old versions — we must not import that one.
import { decompress } from 'fzstd';
import JSZip from 'jszip';

import { t } from '../i18n';
import { AnkiImportError, protobufFields } from './anki';

export type ApkgPackage = {
  /** The SQLite collection to read cards from. */
  collection: Uint8Array;
  /** Whether the package contains this picture/sound (decks can be exported without media). */
  hasMedia(name: string): boolean;
  /** Picture/sound file name → its bytes, loaded on demand. */
  readMedia(name: string): Promise<Uint8Array | null>;
};

/** Media files we copy into the app (sound files are skipped: Recap reads text aloud). */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

export function isImageName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

const isZstd = (b: Uint8Array) =>
  b.length >= 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;

const unzstd = (b: Uint8Array) => (isZstd(b) ? decompress(b) : b);

const utf8 = new TextDecoder();

// Newer collections declare text columns "COLLATE unicase", a collation only Anki defines. SQLite
// can't even scan those tables without it, so in our temporary copy we swap it for the built-in
// NOCASE. The replacement has the same length, so the database file stays valid.
const ANKI_COLLATION = new TextEncoder().encode('COLLATE unicase');
const SQLITE_COLLATION = new TextEncoder().encode('COLLATE nocase ');

export function withoutAnkiCollation(db: Uint8Array): Uint8Array {
  const out = new Uint8Array(db);
  const first = ANKI_COLLATION[0];
  for (
    let i = out.indexOf(first);
    i !== -1 && i <= out.length - ANKI_COLLATION.length;
    i = out.indexOf(first, i + 1)
  ) {
    let match = true;
    for (let j = 1; j < ANKI_COLLATION.length; j++) {
      if (out[i + j] !== ANKI_COLLATION[j]) {
        match = false;
        break;
      }
    }
    if (match) out.set(SQLITE_COLLATION, i);
  }
  return out;
}

// Newer collections are saved in WAL mode (header bytes 18 and 19 are 2). The app opens the
// collection as an in-memory database, which can't use WAL ("unable to open database file"),
// so the copy is switched to the classic journal (1). The rest of the file is unchanged.
const WAL_HEADER_BYTES = [18, 19];

export function withoutWal(db: Uint8Array): Uint8Array {
  if (WAL_HEADER_BYTES.every((i) => db[i] !== 2)) return db;
  const out = new Uint8Array(db);
  for (const i of WAL_HEADER_BYTES) if (out[i] === 2) out[i] = 1;
  return out;
}

/** Newer media map: MediaEntries { repeated MediaEntry entries = 1 }, where MediaEntry has
 *  name = 1 and an optional legacy_zip_filename = 255. Entry i is stored in the zip as "i". */
function readProtobufMediaMap(bytes: Uint8Array): Map<string, string> {
  const index = new Map<string, string>();
  let i = 0;
  for (const [field, value] of protobufFields(bytes)) {
    if (field !== 1 || !(value instanceof Uint8Array)) continue;
    let name = '';
    let zipName = String(i);
    for (const [f, v] of protobufFields(value)) {
      if (f === 1 && v instanceof Uint8Array) name = utf8.decode(v);
      if (f === 255 && typeof v === 'number') zipName = String(v);
    }
    if (name) index.set(name, zipName);
    i++;
  }
  return index;
}

function readJsonMediaMap(text: string): Map<string, string> {
  const index = new Map<string, string>();
  const map = JSON.parse(text) as Record<string, string>;
  for (const [zipName, fileName] of Object.entries(map)) index.set(fileName, zipName);
  return index;
}

export async function openApkg(bytes: Uint8Array): Promise<ApkgPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new AnkiImportError(t('anki.notApkg'));
  }

  const latest = zip.file('collection.anki21b');
  const classic = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  let collection: Uint8Array;
  if (latest) {
    try {
      collection = unzstd(await latest.async('uint8array'));
    } catch {
      throw new AnkiImportError(t('anki.newFormat'));
    }
  } else if (classic) {
    collection = await classic.async('uint8array');
  } else {
    throw new AnkiImportError(t('anki.noDeck'));
  }

  // Map real file names to zip entries. Without a readable map, cards import without pictures.
  let index = new Map<string, string>();
  const mediaFile = zip.file('media');
  if (mediaFile) {
    try {
      const raw = await mediaFile.async('uint8array');
      index =
        latest || isZstd(raw)
          ? readProtobufMediaMap(unzstd(raw))
          : readJsonMediaMap(utf8.decode(raw));
    } catch {
      index = new Map();
    }
  }

  const entry = (name: string) => {
    const entryName = index.get(name);
    return entryName ? zip.file(entryName) : null;
  };

  return {
    collection: withoutWal(withoutAnkiCollation(collection)),
    hasMedia: (name) => entry(name) !== null,
    async readMedia(name) {
      const file = entry(name);
      if (!file) return null;
      return unzstd(await file.async('uint8array'));
    },
  };
}
