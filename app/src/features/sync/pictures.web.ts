// The website keeps no picture files (lib/platform.ts can.pictures), so it neither sends nor
// fetches pictures; its cards show without them, as before, and keep them for the phones.
import type { PictureStore } from '@/lib/sync/http';

export async function syncPictures(_store: PictureStore, _now = Date.now()): Promise<void> {}
