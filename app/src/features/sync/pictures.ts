// Pictures on a phone's cards, after each sync (roadmap 6.4, part 5; the rules are in
// lib/sync/pictures.ts): sends the ones the server doesn't have, fetches the ones this phone
// doesn't have, and once a day removes the account's pictures no card uses. A fetched picture is
// checked like any picture Recap opens (its header, its size, and that its MD5 is its name)
// before it goes in the media folder. The website keeps no picture files (pictures.web.ts).
import { Directory, File, Paths } from 'expo-file-system';

import { keptPictureRefs } from '@/db/cards';
import { getRawSetting, setRawSetting } from '@/db/settings';
import { newId } from '@/lib/id';
import { readImageSize } from '@/lib/imageSize';
import { checkPicture, PICTURE_FOLDER, pictureName } from '@/lib/pictures';
import { SYNC_PICTURES_KEY } from '@/lib/settings';
import type { PictureStore } from '@/lib/sync/http';
import {
  cleanDue,
  MAX_SYNCED_PICTURE_BYTES,
  planPictures,
  readPictureState,
  unusedOnServer,
  type PictureState,
} from '@/lib/sync/pictures';

const save = (state: PictureState) => setRawSetting(SYNC_PICTURES_KEY, state);

function filesHere(): Set<string> {
  const dir = new Directory(Paths.document, PICTURE_FOLDER);
  if (!dir.exists) return new Set();
  return new Set(dir.list().flatMap((entry) => (entry instanceof File ? [entry.name] : [])));
}

/** Keeps a fetched picture if it's what its name says and safe to open; false if not. */
function keepFetched(name: string, bytes: Uint8Array): boolean {
  if (bytes.length > MAX_SYNCED_PICTURE_BYTES) return false;
  if (checkPicture(readImageSize(bytes), bytes.length) !== 'ok') return false;
  const temp = new File(Paths.cache, `${newId()}-${name}`);
  try {
    temp.create();
    temp.write(bytes);
    if (temp.md5 !== name.slice(0, 32)) return false;
    const dir = new Directory(Paths.document, PICTURE_FOLDER);
    dir.create({ idempotent: true, intermediates: true });
    const stored = new File(dir, name);
    if (!stored.exists) temp.copySync(stored);
    return true;
  } finally {
    if (temp.exists) temp.delete();
  }
}

/** Sends and fetches this sync's share of pictures. Errors (offline, paused…) end it quietly. */
export async function syncPictures(store: PictureStore, now = Date.now()): Promise<void> {
  const state = readPictureState(getRawSetting(SYNC_PICTURES_KEY));
  const used = new Set(keptPictureRefs(now).flatMap((ref) => pictureName(ref) ?? []));
  const plan = planPictures(used, filesHere(), state, now);

  for (const name of plan.upload) {
    const file = new File(Paths.document, PICTURE_FOLDER, name);
    if (!file.exists) continue;
    if ((file.size ?? 0) > MAX_SYNCED_PICTURE_BYTES) {
      state.skipped.push(name); // stays on this phone (user decision 2026-11-04)
      continue;
    }
    const result = await store.upload(name, await file.bytes());
    (result === 'refused' ? state.skipped : state.sent).push(name);
    save(state);
  }

  for (const name of plan.download) {
    const bytes = await store.download(name);
    if (bytes && keepFetched(name, bytes)) {
      state.sent.push(name);
      delete state.missing[name];
    } else {
      state.missing[name] = now; // not there yet, or not right: try again tomorrow
    }
    save(state);
  }

  if (cleanDue(state, now)) {
    const unused = unusedOnServer(await store.list(), used, now);
    if (unused.length > 0) await store.remove(unused.slice(0, 1000));
    const gone = new Set(unused);
    state.sent = state.sent.filter((name) => !gone.has(name));
    state.cleanedAt = now;
    save(state);
  }
}
