// Checks a deployed sync Worker against real R2 (the tests use Miniflare's local copy of R2): files
// can't be overwritten, the head is only replaced if unchanged, listing and removing work. Then it
// signs in to the store-review account, which checks Neon and schema.sql too. Run:
//   npm run smoke -- https://sync.recapflashcards.com
// It signs a 5-minute token itself, so it needs the Worker's TOKEN_SECRET, and for signing in its
// REVIEW_CODE, each from the environment or .dev.vars. It uses one fixed test account and removes
// its test file (that account's small head file stays).
import { readFileSync } from 'node:fs';

import { SignJWT } from 'jose';

const base = process.argv[2]?.replace(/\/$/, '');
if (!base) {
  console.error('Usage: npm run smoke -- <the Worker URL>');
  process.exit(1);
}

/** A value from the environment, or from .dev.vars; undefined if neither has it. */
function devVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    if (line)
      return line
        .slice(name.length + 1)
        .trim()
        .replace(/^"(.*)"$/, '$1');
  } catch {
    // No .dev.vars: fall through.
  }
  return undefined;
}

function tokenSecret() {
  const secret = devVar('TOKEN_SECRET');
  if (secret) return secret;
  console.error('Set TOKEN_SECRET (the same one as the Worker), or put it in .dev.vars.');
  process.exit(1);
}

const ACCOUNT = '00000000-0000-4000-8000-00000000c0de';
const SMOKE_DEVICE = '00000000-0000-4000-8000-00000000d0de';
const token = await new SignJWT({})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(ACCOUNT)
  .setIssuer('recap')
  .setAudience('recap-sync')
  .setIssuedAt()
  .setExpirationTime('5m')
  .sign(new TextEncoder().encode(tokenSecret()));
const call = (path, init = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });

let failed = false;
function check(what, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
}

check('/health answers', (await fetch(`${base}/health`)).status === 200);

const name = `changes/${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}.json`;
const put = (text) => call(`/v1/files/${name}`, { method: 'PUT', body: text });
check('creates a new file', (await put('{"smoke":1}')).status === 201);
check("won't overwrite it (R2 If-None-Match: *)", (await put('{"smoke":2}')).status === 409);
const read = await call(`/v1/files/${name}`);
check('reads it back unchanged', read.status === 200 && (await read.text()) === '{"smoke":1}');

const listing = await (await call('/v1/files')).json();
check('lists it', listing.names.includes(name));
const seen = listing.head?.base ?? null;
const swap = () =>
  call(`/v1/head?base=${seen ?? 'none'}`, {
    method: 'PUT',
    body: JSON.stringify({ base: (seen ?? 0) + 1, months: {}, prev: null }),
  });
check(
  `replaces the head it saw (${seen === null ? 'none yet' : `base ${seen}`})`,
  (await swap()).status === 200,
);
check("won't replace a head that changed (R2 If-Match)", (await swap()).status === 409);

const removed = await call('/v1/files/remove', {
  method: 'POST',
  body: JSON.stringify({ names: [name] }),
});
check(
  'removes the file',
  removed.status === 200 && (await call(`/v1/files/${name}`)).status === 404,
);

// Signing in is the one thing that reaches Neon: the review account (never emailed) shows the
// accounts tables are there.
const reviewCode = devVar('REVIEW_CODE');
if (!reviewCode) {
  console.log('skip signing in (set REVIEW_CODE, or put it in .dev.vars)');
} else {
  const email = devVar('REVIEW_EMAIL') ?? 'review@recapflashcards.com';
  const signIn = await fetch(`${base}/v1/auth/email/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code: reviewCode, device: SMOKE_DEVICE }),
  });
  const signedIn = signIn.status === 200 ? await signIn.json() : null;
  check(`signs in to the review account (Neon) [${signIn.status}]`, signedIn?.provider === 'email');
  if (signedIn) {
    const renewed = await fetch(`${base}/v1/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${signedIn.token}` },
    });
    check('its token works', renewed.status === 200);
  }
}

process.exit(failed ? 1 : 0);
