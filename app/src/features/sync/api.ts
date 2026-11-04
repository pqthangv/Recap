// The app's sign-in client for the sync Worker (sync/, roadmap 6.1).
import { getDeviceId } from '@/db/device';
import { createAccountClient } from '@/lib/sync/account';

/** The deployed Worker. Every build uses it: Google and Apple only send people back there. */
export const PRODUCTION_SYNC_URL = 'https://sync.recapflashcards.com';

/**
 * EXPO_PUBLIC_SYNC_URL points at another Worker (app/.env), e.g. `npm run dev` in /sync, which the
 * Android emulator reaches at http://10.0.2.2:8787 (email codes only there).
 */
export const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL ?? PRODUCTION_SYNC_URL;

export const accountClient = createAccountClient({
  baseUrl: SYNC_URL,
  deviceId: () => getDeviceId(),
});
