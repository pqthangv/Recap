// The developer's page for leaderboard names (user, 2026-11-05), like the Render server's /admin
// for reported AI cards: plain HTML forms, no JavaScript, behind the browser's login box (user
// "admin", password = the ADMIN_TOKEN secret: `npx wrangler secret put ADMIN_TOKEN`). Without that
// secret, or with one shorter than 32 characters, the page doesn't exist.
//   GET  /admin        reported names, newest report first, and the names hidden for good
//   POST /admin/hide   id or username (a form): hides the names for good, "Anonymous" to everyone
//                      (also after a rename, or leaving and joining again)
//   POST /admin/show   id: shows them again and forgets their reports
// Posts must come from this page (the Origin header): the browser sends the saved login with a
// form on any site. Not under /v1: no sign-in token, nothing counts toward the daily limits.
import { REPORTS_TO_HIDE, type AdminName } from './board';
import { sameText } from './hash';
import { cleanUsername } from './names';
import type { Deps } from './signin';

/** ADMIN_TOKEN is optional (not in wrangler.jsonc's required secrets), so Env doesn't list it. */
type AdminEnv = Env & { ADMIN_TOKEN?: string };

export const MIN_TOKEN_LENGTH = 32;
const MAX_FORM_BYTES = 1000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REALM = 'Basic realm="Recap admin", charset="UTF-8"';

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};

const notFound = () => Response.json({ error: 'not_found' }, { status: 404 });

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
/** "5 Nov 2026, 13:20 UTC" */
function when(ms: number): string {
  const d = new Date(ms);
  const time = d.toISOString().slice(11, 16);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${time} UTC`;
}

/** The browser's login box: user "admin" and the token, compared in constant time. */
function loggedIn(request: Request, token: string): boolean {
  const match = /^Basic ([A-Za-z0-9+/=]+)$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) return false;
  let text: string;
  try {
    text = new TextDecoder().decode(Uint8Array.from(atob(match[1]!), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  const colon = text.indexOf(':');
  if (colon < 0) return false;
  const user = sameText(text.slice(0, colon), 'admin');
  const password = sameText(text.slice(colon + 1), token);
  return user && password;
}

function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...HEADERS, ...extra } });
}

const STATUS = ['Shown', 'Hidden after reports', 'Hidden for good'];

function item(n: AdminName): string {
  const id = escape(n.id);
  const reports =
    n.reports > 0
      ? `${n.reports} report${n.reports === 1 ? '' : 's'} · last ${when(n.lastReport)}`
      : 'no reports';
  const button = (action: 'hide' | 'show', label: string) =>
    `<form method="post" action="/admin/${action}"><input type="hidden" name="id" value="${id}">` +
    `<button type="submit">${label}</button></form>`;
  const buttons = [
    n.hidden !== 2 ? button('hide', 'Hide for good') : '',
    n.hidden > 0 ? button('show', 'Show again') : button('show', 'Dismiss reports'),
  ].join('');
  return `
<article class="name${n.hidden === 2 ? ' done' : ''}">
  <p class="meta"><span class="tag">${STATUS[n.hidden] ?? 'Hidden'}</span> ${reports}</p>
  <p class="display">${escape(n.displayName)}</p>
  <p class="meta">@${escape(n.username)}${n.anonymous ? ' · Anonymous on the board' : ''} · id ${id}</p>
  <div class="actions">${buttons}</div>
</article>`;
}

const NOTICES: Record<string, (username: string) => string> = {
  hidden: (u) => `@${u} is hidden for good: everyone sees "Anonymous".`,
  shown: (u) => `@${u} is shown again, and its reports are gone.`,
  missing: (u) => `Nobody on the board is called @${u}.`,
};

function listPage(names: AdminName[], members: number, notice: string): string {
  const open = names.filter((n) => n.reports > 0 && n.hidden !== 2).length;
  const title = open ? `(${open}) Recap names` : 'Recap names';
  const summary = `${open ? `${open} to look at` : 'Nothing new'} · ${members} on the board`;
  const items = names.length
    ? names.map(item).join('')
    : '<p class="empty">Nothing to look at. Names people report in the app show up here.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root { --ink: #1A1530; --muted: #5E5873; --accent: #5A31D6; --line: #E6E3EF; --tint: #EEEAFD; }
  body { margin: 0; background: #fff; color: var(--ink);
    font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 30px; margin: 0 0 4px; }
  p { margin: 4px 0; }
  .meta { color: var(--muted); font-size: 15px; overflow-wrap: anywhere; }
  .name { border: 1px solid var(--line); border-radius: 14px; padding: 16px 20px; margin: 16px 0; }
  .done { opacity: .6; }
  .tag { background: var(--tint); color: var(--accent); border-radius: 999px; padding: 2px 10px;
    font-weight: 600; }
  .display { font-size: 20px; font-weight: 600; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
  button { min-height: 44px; padding: 0 18px; border-radius: 10px; border: 1px solid var(--accent);
    background: #fff; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; }
  .find { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 20px 0 8px; }
  .find label { width: 100%; font-weight: 600; }
  input { min-height: 44px; flex: 1; min-width: 200px; padding: 0 14px; border-radius: 10px;
    border: 1px solid var(--line); font: inherit; }
  .notice, .empty { background: var(--tint); border-radius: 14px; padding: 16px 20px; margin: 16px 0; }
</style>
</head>
<body>
<main>
<h1>Leaderboard names</h1>
<p class="meta">${summary}. "Hide for good" shows the person as Anonymous to everyone, also after
  they change their name or leave and join again (until they delete their account). A name
  reported by ${REPORTS_TO_HIDE} people is hidden on its own until it's changed.</p>
${notice ? `<p class="notice">${escape(notice)}</p>` : ''}
<form class="find" method="post" action="/admin/hide">
  <label for="username">Hide any name for good</label>
  <input id="username" name="username" placeholder="@username" required maxlength="21"
    autocomplete="off" autocapitalize="none" spellcheck="false">
  <button type="submit">Hide</button>
</form>
${items}
</main>
</body>
</html>
`;
}

/** Answers /admin and /admin/…. */
export async function admin(request: Request, env: Env, deps: Deps): Promise<Response> {
  const token = (env as AdminEnv).ADMIN_TOKEN ?? '';
  if (token.length < MIN_TOKEN_LENGTH) return notFound();
  if (!loggedIn(request, token)) {
    return html(
      '<!doctype html><meta charset="utf-8"><title>Recap admin</title>' +
        '<p>Log in with user admin and your ADMIN_TOKEN.</p>',
      401,
      { 'WWW-Authenticate': REALM },
    );
  }
  const url = new URL(request.url);
  const board = deps.board;

  if (url.pathname === '/admin' && request.method === 'GET') {
    const done = Object.keys(NOTICES).find((key) => url.searchParams.has(key));
    const notice = done ? NOTICES[done]!(url.searchParams.get(done) ?? '') : '';
    const { names, members } = await board.adminNames();
    return html(listPage(names, members, notice));
  }

  const action = /^\/admin\/(hide|show)$/.exec(url.pathname)?.[1];
  if (!action || request.method !== 'POST') return notFound();
  // A form on another site would carry the saved login too.
  if (request.headers.get('Origin') !== url.origin) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const size = Number(request.headers.get('Content-Length') ?? NaN);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FORM_BYTES) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const form = await request.formData().catch(() => null);
  const id = form?.get('id');
  const typed = form?.get('username');
  const username = typeof typed === 'string' ? cleanUsername(typed.replace(/^\s*@/, '')) : '';
  let who: { id: string } | { username: string } | null = null;
  if (typeof id === 'string' && ID.test(id)) who = { id };
  else if (action === 'hide' && username) who = { username };
  if (!who) return Response.json({ error: 'bad_request' }, { status: 400 });

  const changed = await board.adminSetHidden(who, action === 'hide');
  const [key, name] = changed
    ? [action === 'hide' ? 'hidden' : 'shown', changed]
    : ['missing', 'username' in who ? who.username : who.id];
  const back = `/admin?${new URLSearchParams({ [key]: name }).toString()}`;
  return new Response(null, { status: 303, headers: { ...HEADERS, Location: back } });
}
