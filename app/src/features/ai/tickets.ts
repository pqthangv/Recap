// Proof for "Create with AI" that requests come from the real Recap on a real phone (roadmap
// 6.0): Play Integrity tickets on Android (lib/integrity.ts), App Attest on iPhones
// (lib/appAttest.ts). The website sends none.
import * as AppIntegrity from '@expo/app-integrity';
import { getAndroidId } from 'expo-application';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Platform } from 'react-native';

import { getRawSetting, setRawSetting } from '@/db/settings';
import { attestServer, createAppAttest, parseAttestState } from '@/lib/appAttest';
import { createTickets, NO_TICKETS, type TicketSource } from '@/lib/integrity';
import { APP_ATTEST_KEY } from '@/lib/settings';

/** Recap's Google Cloud project (the Play developer account's, not the Gemini key's), linked in
 *  Play Console › Protected with Play › Play Integrity API. Not a secret: it only says whose
 *  project the tickets belong to. */
const CLOUD_PROJECT_NUMBER = '333284966532';

/** The proofs for requests to the AI server at `baseUrl` (an iPhone registers its key there). */
export function ticketsFor(baseUrl: string): TicketSource {
  if (Platform.OS === 'android') {
    return createTickets({
      projectNumber: CLOUD_PROJECT_NUMBER,
      androidId: getAndroidId,
      sha256: (text) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text),
      prepare: AppIntegrity.prepareIntegrityTokenProviderAsync,
      request: AppIntegrity.requestIntegrityCheckAsync,
      // Emulators, phones without Google Play, sideloaded builds: no ticket, and that's fine.
      onError: (e) => console.warn('No Play Integrity ticket:', e),
    });
  }
  if (Platform.OS === 'ios') {
    return createAppAttest({
      // False on the simulator: no proof there, and that's fine.
      supported: AppIntegrity.isSupported,
      generateKey: AppIntegrity.generateKeyAsync,
      attestKey: AppIntegrity.attestKeyAsync,
      generateAssertion: AppIntegrity.generateAssertionAsync,
      server: attestServer({ baseUrl }),
      load: () => parseAttestState(getRawSetting(APP_ATTEST_KEY)),
      save: (state) => setRawSetting(APP_ATTEST_KEY, state),
      onError: (e) => console.warn('No App Attest proof:', e),
    });
  }
  return NO_TICKETS;
}
