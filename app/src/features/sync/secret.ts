// The secrets a sign-in starts with (expo-crypto, which also works on the website).
import * as Crypto from 'expo-crypto';

import { base64url, toBase64url } from '@/lib/sync/account';

/** A browser sign-in's secret, and its SHA-256 for the Worker (base64url, PKCE style). */
export async function browserSecret(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(Crypto.getRandomBytes(32));
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: toBase64url(challenge) };
}

/** A nonce for Apple's sheet: Apple gets its SHA-256 (hex), the Worker the nonce itself. */
export async function appleNonce(): Promise<{ nonce: string; hashed: string }> {
  const nonce = base64url(Crypto.getRandomBytes(16));
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  return { nonce, hashed };
}
