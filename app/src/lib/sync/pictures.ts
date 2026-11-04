// Which pictures a sync sends and fetches (roadmap 6.4, part 5). Pictures are named by their MD5
// (features/pictures/files.ts), so a name is the same on every device and each is sent once. After
// each sync the phone sends the pictures its cards use that it hasn't sent yet, fetches the ones its
// cards use that it doesn't have, and once a day removes from the account the ones no card uses.
// Pictures over 2 MB stay on the phone that has them (user decision 2026-11-04).

/** A picture name the sync server takes: the file's MD5 and its extension. */
export const SYNCED_PICTURE = /^[0-9a-f]{32}\.[a-z0-9]{1,5}$/;
export const MAX_SYNCED_PICTURE_BYTES = 2 * 1024 * 1024;
/** At most this many each way per sync; the rest go next time (and 500 a day, server-side). */
export const PICTURES_PER_SYNC = 50;
const DAY = 24 * 60 * 60 * 1000;
/** A picture no card uses is removed once it's this old, so one whose card hasn't arrived yet stays. */
export const UNUSED_AFTER_MS = DAY;
/** How often the account's pictures are listed to remove unused ones (a listing counts as a write). */
export const CLEAN_EVERY_MS = DAY;
/** A picture the server didn't have, or that failed the checks, is asked for again after this. */
export const RETRY_AFTER_MS = DAY;

/** What this device knows about its pictures on the server (a device-only setting). */
export type PictureState = {
  /** On the server: sent from here, or fetched from there. */
  sent: string[];
  /** Not sent and won't be: over 2 MB, or refused by the server's checks. */
  skipped: string[];
  /** Asked for and not received (name → when), tried again after a day. */
  missing: Record<string, number>;
  /** When unused pictures were last removed from the account. */
  cleanedAt: number | null;
};

export const noPictureState = (): PictureState => ({
  sent: [],
  skipped: [],
  missing: {},
  cleanedAt: null,
});

export function readPictureState(saved: unknown): PictureState {
  const s = (saved ?? {}) as Partial<PictureState>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    sent: strings(s.sent),
    skipped: strings(s.skipped),
    missing: s.missing && typeof s.missing === 'object' ? { ...s.missing } : {},
    cleanedAt: typeof s.cleanedAt === 'number' ? s.cleanedAt : null,
  };
}

/**
 * `used`: the pictures this device's cards use (deleted ones still in Recently deleted too);
 * `here`: the files in its media folder.
 */
export function planPictures(
  used: Iterable<string>,
  here: ReadonlySet<string>,
  state: PictureState,
  now: number,
  limit = PICTURES_PER_SYNC,
): { upload: string[]; download: string[] } {
  const sent = new Set(state.sent);
  const skipped = new Set(state.skipped);
  const upload: string[] = [];
  const download: string[] = [];
  for (const name of new Set(used)) {
    if (!SYNCED_PICTURE.test(name)) continue;
    if (here.has(name)) {
      if (!sent.has(name) && !skipped.has(name) && upload.length < limit) upload.push(name);
    } else {
      const tried = state.missing[name];
      const due = tried === undefined || now - tried >= RETRY_AFTER_MS;
      if (due && download.length < limit) download.push(name);
    }
  }
  return { upload, download };
}

/** The account's pictures no card uses any more, old enough to remove. */
export function unusedOnServer(
  listed: readonly { name: string; uploaded: number }[],
  used: ReadonlySet<string>,
  now: number,
): string[] {
  return listed
    .filter((p) => !used.has(p.name) && now - p.uploaded >= UNUSED_AFTER_MS)
    .map((p) => p.name);
}

export const cleanDue = (state: PictureState, now: number) =>
  state.cleanedAt === null || now - state.cleanedAt >= CLEAN_EVERY_MS;
