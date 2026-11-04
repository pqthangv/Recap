// Links Recap is opened with. A browser sign-in ends at recapcards://signed-in?…, which
// expo-web-browser already hands to the sign-in (src/features/sync/browser.ts), so the router stays
// where it is. If Recap wasn't running any more (Android can close it while the tab is open), it
// opens Sync my cards, where the person can try again.
const SIGNED_IN = /^(?:recapcards:\/\/|\/)?signed-in(?:[/?#]|$)/;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (SIGNED_IN.test(path)) return initial ? '/account' : null;
  } catch {
    // Fall through: open the link as it is.
  }
  return path;
}
