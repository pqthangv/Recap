// Deleting an account (roadmap 6.1, part 4): POST /v1/account/delete with the account's token.
// A Google or email account needs nothing more (the app asked "Delete?" first). An Apple account
// also needs a fresh Apple sign-in with the same Apple ID, so the Worker can end Recap's Sign in
// with Apple, which Apple requires (user decision 2026-11-04: nothing is kept for it):
//   {"code", "verifier"}                     from a browser tab started with purpose=delete, or
//   {"idToken", "nonce", "authorizationCode"} from Apple's sheet on an iPhone.
// Then the account is closed (its tokens stop working on every device), its files in R2 are
// deleted, so is its leaderboard row (src/board.ts), and its row in Neon. The cards on the devices
// stay. Deleting again is harmless.
import { removeAccountFiles } from './files';
import { today } from './limits';
import { appleNativePerson, appleSheetRefreshToken, revokeApple } from './providers';
import { openHandoff, smallBody, type Deps } from './signin';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);

type AppleProof = { clientId: string; refreshToken: string };

/** The fresh Apple sign-in in the request, for the account's Apple ID; or why there isn't one. */
async function appleProof(
  request: Request,
  env: Env,
  deps: Deps,
  subject: string,
): Promise<AppleProof | Response> {
  const body = await smallBody(request);
  if (typeof body?.code === 'string' && typeof body.verifier === 'string') {
    const handoff = await openHandoff(env, body.code, body.verifier);
    if (!handoff || handoff.k !== 'delete' || handoff.p !== 'apple' || !handoff.r) {
      return fail('bad_code', 400);
    }
    if (handoff.s !== subject) return fail('other_apple_account', 403);
    return { clientId: env.APPLE_SERVICES_ID, refreshToken: handoff.r };
  }
  const { idToken, nonce, authorizationCode } = body ?? {};
  if (
    typeof idToken === 'string' &&
    typeof nonce === 'string' &&
    typeof authorizationCode === 'string'
  ) {
    let person;
    try {
      person = await appleNativePerson(env, deps.keys, idToken, nonce);
    } catch {
      return fail('bad_token', 401);
    }
    if (person.subject !== subject) return fail('other_apple_account', 403);
    try {
      const refreshToken = await appleSheetRefreshToken(env, deps.fetch, authorizationCode);
      return { clientId: env.APPLE_BUNDLE_ID, refreshToken };
    } catch (error) {
      console.log('deleting: Apple refused the code:', String(error));
      return fail('apple_failed', 502);
    }
  }
  return fail('apple_sign_in_needed', 400);
}

export async function deleteAccount(
  request: Request,
  env: Env,
  deps: Deps,
  account: string,
): Promise<Response> {
  const who = await deps.accounts.find(account);
  if (who?.provider === 'apple') {
    const proof = await appleProof(request, env, deps, who.subject);
    if (proof instanceof Response) return proof;
    try {
      await revokeApple(env, deps.fetch, proof.clientId, proof.refreshToken);
    } catch (error) {
      // Nothing is deleted yet, so trying again later starts over cleanly.
      console.log('deleting: revoking with Apple failed:', String(error));
      return fail('apple_failed', 502);
    }
  }
  await env.COUNTERS.getByName(account).close();
  const freed = await removeAccountFiles(env.FILES, account);
  await env.COUNTERS.getByName('all').release(today(), freed);
  // Also forgets that Recap hid the name for good (nothing about the account is left).
  await deps.board.leave(account, true);
  if (who) await deps.accounts.remove(account);
  return json({ ok: true });
}
