// Who is asking: every request carries a sign-in token (signing in makes them, roadmap 6.1), checked
// here with the Worker's secret alone, so a normal sync never wakes the Neon database.
import { jwtVerify } from 'jose';

export const TOKEN_ISSUER = 'recap';
export const TOKEN_AUDIENCE = 'recap-sync';

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The account in the request's token; null without a token, or with a bad or expired one. */
export async function accountOf(request: Request, secret: string): Promise<string | null> {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return null;
  if (!secret || secret.length < 32) throw new Error('TOKEN_SECRET is missing or too short');
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
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
