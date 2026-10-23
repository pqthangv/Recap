// "A new version is out" on Home. The newest store version comes from a tiny file on Recap's
// website (app/public/version.json, changed by hand once a release is live in the store), read
// at most once a day when online. Nothing about the phone is sent: it's a plain file download.

export const VERSION_URL = 'https://recapflashcards.com/version.json';
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export type StorePlatform = 'android' | 'ios';

const VERSION = /^\d{1,6}(\.\d{1,6}){0,3}$/;

function parts(version: string): number[] | null {
  return VERSION.test(version) ? version.split('.').map(Number) : null;
}

/** Whether `latest` comes after `installed` ("1.0.10" after "1.0.9"). False if either isn't a
 *  version. */
export function isNewer(latest: string, installed: string): boolean {
  const a = parts(latest);
  const b = parts(installed);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** The newest version for this platform from version.json's text ({"android": "1.0.7"}), or
 *  null when it isn't there (an iPhone before App Store builds have this) or the file is wrong. */
export function readVersionFile(text: string, platform: StorePlatform): string | null {
  try {
    const data: unknown = JSON.parse(text);
    const value =
      data && typeof data === 'object' ? (data as Record<string, unknown>)[platform] : null;
    return typeof value === 'string' && VERSION.test(value) ? value : null;
  } catch {
    return null; // e.g. the site's page instead of the file
  }
}

/** Once a day; also when the phone's clock went back since the last check. */
export function dueForCheck(lastCheckedAt: unknown, now: number): boolean {
  if (typeof lastCheckedAt !== 'number' || !Number.isFinite(lastCheckedAt)) return true;
  return now - lastCheckedAt >= CHECK_EVERY_MS || lastCheckedAt > now;
}

/** The version to tell the user about, or null: only a newer one than installed, and not the
 *  one they hid. */
export function noticeVersion(
  latest: unknown,
  installed: string | null,
  hidden: unknown,
): string | null {
  if (typeof latest !== 'string' || !installed || latest === hidden) return null;
  return isNewer(latest, installed) ? latest : null;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Reads version.json. Null when offline, slow (10 s), or the file has nothing for `platform`. */
export async function fetchLatestVersion(
  platform: StorePlatform,
  doFetch: Fetch = fetch,
  timeoutMs = 10_000,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(VERSION_URL, { signal: controller.signal });
    return response.ok ? readVersionFile(await response.text(), platform) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
