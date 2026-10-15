// The app's AI client and the hand-off from "Create with AI" to "Review cards".
import { Platform } from 'react-native';
import { create } from 'zustand';

import { getDeviceId } from '@/db/device';
import { createAiClient, type GeneratedCard } from '@/lib/ai';
import type { AiSource } from '@/lib/aiReview';
import type { SideLanguages } from '@/lib/language';

/** The deployed server (Render). Release builds use it. */
export const PRODUCTION_API_URL = 'https://recap-api-ictj.onrender.com';

/**
 * Development builds use the computer running `uvicorn`: the Android emulator reaches it at
 * 10.0.2.2, the iOS simulator at localhost. EXPO_PUBLIC_API_URL overrides both (app/.env).
 */
const LOCAL_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? LOCAL_API_URL : PRODUCTION_API_URL);

export const ai = createAiClient({ baseUrl: API_URL, deviceId: () => getDeviceId() });

/** Cards waiting for review. Kept until they're saved or replaced, so nothing is lost by
 *  leaving the review screen (making them used up AI quota). `languages`: what each side was
 *  written in, for the deck they're saved to. */
export const useAiDraft = create<{
  cards: GeneratedCard[] | null;
  source: AiSource;
  languages: SideLanguages;
}>(() => ({
  cards: null,
  source: { kind: 'text' },
  languages: { front: null, back: null },
}));
