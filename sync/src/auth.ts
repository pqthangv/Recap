// Who is asking: every request carries a sign-in token (signing in makes them, src/signin.ts),
// checked here with the Worker's secret alone, so a normal sync never wakes the Neon database.
import { jwtVerify, SignJWT } from 'jose';

export const TOKEN_ISSUER = 'recap';
export const TOKEN_AUDIENCE = 'recap-sync';
/** A token works this long. The app asks for a new one once its token is a week old. */
export const TOKEN_DAYS = 90;

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The secret as an HMAC key; refuses one that's missing or too short. */
export function secretKey(secret: string): Uint8Array {
  if (!secret || secret.length < 32) throw new Error('TOKEN_SECRET is missing or too short');
  return new TextEncoder().encode(secret);
}

/** A new sign-in token for the account. */
export async function makeToken(account: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(account)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_DAYS}d`)
    .sign(secretKey(secret));
}

/** The account in the request's token; null without a token, or with a bad or expired one. */
export async function accountOf(request: Request, secret: string): Promise<string | null> {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return null;
  const key = secretKey(secret);
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      requiredClaims: ['sub', 'exp'],
    });
    return payload.sub && ACCOUNT_ID.test(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}
