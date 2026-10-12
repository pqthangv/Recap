// The app's AI client and the hand-off from "Create with AI" to "Review cards".
import { create } from 'zustand';

import { getDeviceId } from '@/db/device';
import { createAiClient, type GeneratedCard } from '@/lib/ai';
import type { AiSource } from '@/lib/aiReview';

/**
 * Recap's server. Development builds use the computer running `uvicorn` (10.0.2.2 is the host
 * machine as seen from the Android emulator). Set EXPO_PUBLIC_API_URL to override, e.g. for a
 * release build pointing at the deployed server.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://10.0.2.2:8000' : 'https://recap-api-ictj.onrender.com');

export const ai = createAiClient({ baseUrl: API_URL, deviceId: () => getDeviceId() });

/** Cards waiting for review. Kept until they're saved or replaced, so nothing is lost by
 *  leaving the review screen (making them used up AI quota). */
export const useAiDraft = create<{ cards: GeneratedCard[] | null; source: AiSource }>(() => ({
  cards: null,
  source: { kind: 'text' },
}));
