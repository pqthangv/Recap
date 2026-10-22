// Play Integrity tickets for "Create with AI" (roadmap 6.0, lib/integrity.ts). Android only for
// now: iPhones (App Attest) come later and send none, like the website.
import * as AppIntegrity from '@expo/app-integrity';
import { getAndroidId } from 'expo-application';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Platform } from 'react-native';

import { createTickets, NO_TICKETS } from '@/lib/integrity';

/** Recap's Google Cloud project, linked in Play Console › Protected with Play › Play Integrity
 *  API. Not a secret: it only says whose project the tickets belong to. */
const CLOUD_PROJECT_NUMBER = '110760305467';

export const tickets =
  Platform.OS === 'android'
    ? createTickets({
        projectNumber: CLOUD_PROJECT_NUMBER,
        androidId: getAndroidId,
        sha256: (text) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text),
        prepare: AppIntegrity.prepareIntegrityTokenProviderAsync,
        request: AppIntegrity.requestIntegrityCheckAsync,
        // Emulators, phones without Google Play, sideloaded builds: no ticket, and that's fine.
        onError: (e) => console.warn('No Play Integrity ticket:', e),
      })
    : NO_TICKETS;
