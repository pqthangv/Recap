// The developer's page for leaderboard names (src/admin.ts): the login, the list of reported
// names, and hiding or showing them, each test on a board of its own.
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { Profile, View } from '../src/board';
import { handle } from '../src/index';
import type { Deps } from '../src/signin';
import { makeToken } from './helpers';

const ORIGIN = 'https://sync.test';
const TOKEN = 'admin-token-only-for-the-local-tests-0123456789';

function worker(token: string | null = TOKEN) {
  const testEnv = { ...env, ADMIN_TOKEN: token ?? undefined } as Env;
  const deps: Deps = {
    accounts: {} as Deps['accounts'],
    keys: {} as Deps['keys'],
    board: env.BOARD.getByName(crypto.randomUUID()),
    // Report emails go nowhere.
    fetch: async () => Response.json({ id: 'sent' }),
  };
  const send = (path: string, init: RequestInit = {}) =>
    handle(new Request(`${ORIGIN}${path}`, init), testEnv, deps);

  /** One person on the board. */
  async function person(displayName: string, username: string) {
    const auth = { Authorization: `Bearer ${await makeToken(crypto.randomUUID())}` };
    const call = (path: string, method = 'GET', body?: unknown) => {
      const text = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { ...auth };
      if (text) headers['Content-Length'] = String(new TextEncoder().encode(text).length);
      return send(`/v1/${path}`, { method, body: text, headers });
    };
    const join = async (name = displayName, user = username) =>
      (await (
        await call('board/me', 'PUT', { displayName: name, username: user })
      ).json()) as Profile;
    const profile = await join();
    const view = async () => (await (await call('board')).json()) as View;
    const report = (id: string) => call('board/report', 'POST', { id });
    return { profile, call, join, view, report };
  }

  const login = (user = 'admin', password = TOKEN) => ({
    Authorization: `Basic ${btoa(`${user}:${password}`)}`,
  });
  const page = async (query = '') => {
    const response = await send(`/admin${query}`, { headers: login() });
    return { status: response.status, text: await response.text() };
  };
  /** A form on the page, sent as a browser does. */
  const post = (
    action: 'hide' | 'show' | 'words/block' | 'words/unblock',
    fields: Record<string, string>,
    origin = ORIGIN,
  ) => {
    const body = new URLSearchParams(fields).toString();
    return send(`/admin/${action}`, {
      method: 'POST',
      body,
      headers: {
        ...login(),
        Origin: origin,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(body.length),
      },
    });
  };
  return { send, person, login, page, post, board: deps.board };
}

/** The name as the other person sees it on the board. */
const shownName = async (viewer: { view: () => Promise<View> }, id: string) =>
  (await viewer.view()).rows.find((r) => r.id === id)?.displayName;

describe('/admin', () => {
  it("doesn't exist without a long enough ADMIN_TOKEN", async () => {
    for (const token of [null, '', 'short-token']) {
      const response = await worker(token).send('/admin', { headers: { Authorization: 'x' } });
      expect(response.status).toBe(404);
    }
  });

  it('asks for the login, and takes only user admin with the token', async () => {
    const w = worker();
    const none = await w.send('/admin');
    expect(none.status).toBe(401);
    expect(none.headers.get('WWW-Authenticate')).toContain('Basic realm="Recap admin"');
    expect((await w.send('/admin', { headers: w.login('admin', 'wrong') })).status).toBe(401);
    expect((await w.send('/admin', { headers: w.login('root') })).status).toBe(401);
    const ok = await w.send('/admin', { headers: w.login() });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(ok.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(await ok.text()).toContain('Nothing to look at');
  });

  it('lists reported names, hides one for good and shows it again', async () => {
    const w = worker();
    const rude = await w.person("O'Rude Name", 'rude.name');
    const a = await w.person('Lan', 'lan');
    const b = await w.person('Binh', 'binh');
    await a.report(rude.profile.id);
    await b.report(rude.profile.id);

    let page = await w.page();
    expect(page.text).toContain('<title>(1) Recap names</title>');
    expect(page.text).toContain('O&#39;Rude Name');
    expect(page.text).toContain('@rude.name');
    expect(page.text).toContain('2 reports');
    expect(page.text).toContain('3 on the board');
    expect(page.text).not.toContain('@lan');

    // A form from another site is refused, and changes nothing.
    expect((await w.post('hide', { id: rude.profile.id }, 'https://evil.test')).status).toBe(403);
    expect(await shownName(a, rude.profile.id)).toBe("O'Rude Name");

    const hidden = await w.post('hide', { id: rude.profile.id });
    expect(hidden.status).toBe(303);
    expect(hidden.headers.get('Location')).toBe('/admin?hidden=rude.name');
    expect(await shownName(a, rude.profile.id)).toBeNull();
    expect((await w.page('?hidden=rude.name')).text).toContain('@rude.name is hidden for good');
    // For good: a new name stays hidden too.
    expect((await rude.join('Kind Name', 'kind.name')).hidden).toBe(true);
    expect(await shownName(b, rude.profile.id)).toBeNull();
    page = await w.page();
    expect(page.text).toContain('Hidden for good');
    expect(page.text).toContain('<title>Recap names</title>');

    const shown = await w.post('show', { id: rude.profile.id });
    expect(shown.headers.get('Location')).toBe('/admin?shown=kind.name');
    expect(await shownName(a, rude.profile.id)).toBe('Kind Name');
    // The reports are gone, so the list is empty again.
    expect((await w.page()).text).toContain('Nothing to look at');
  });

  it('keeps a name hidden for good after leaving and joining again, until Show again', async () => {
    const w = worker();
    const rude = await w.person('Rude Name', 'rude.name');
    const viewer = await w.person('Binh', 'binh');
    await w.post('hide', { id: rude.profile.id });
    expect((await rude.call('board/leave', 'POST')).status).toBe(200);

    const back = await rude.join('Kind Name', 'kind.name');
    expect(back).toMatchObject({ hidden: true, hiddenForGood: true });
    expect(back.id).not.toBe(rude.profile.id);
    expect(await shownName(viewer, back.id)).toBeNull();
    expect((await w.page()).text).toContain('@kind.name');

    await w.post('show', { id: back.id });
    expect(await shownName(viewer, back.id)).toBe('Kind Name');
    // Shown again for good: leaving and joining no longer brings the mark back.
    expect((await rude.call('board/leave', 'POST')).status).toBe(200);
    const fresh = await rude.join();
    expect(fresh.hidden).toBe(false);
    expect(fresh.hiddenForGood).toBeUndefined();
  });

  it('blocks a word after a preview: names with it are hidden and refused, until unblocked', async () => {
    const w = worker();
    const spam = await w.person('Lan Spam', 'lan.spam');
    const spammy = await w.person('Spammy', 'spammy');
    const viewer = await w.person('Binh', 'binh');
    await viewer.report(spam.profile.id);

    let page = await w.page('?check=Spam');
    expect(page.text).toContain('would hide 1 name on the board now');
    expect(page.text).toContain('@lan.spam');
    expect(page.text).not.toContain('@spammy');
    expect(page.text).toContain('Block "spam"');
    expect((await w.page('?check=x1')).text).toContain('A word is 2 to 30 letters');
    // Nothing changes until Block, and a form from another site can't.
    expect(await shownName(viewer, spam.profile.id)).toBe('Lan Spam');
    expect((await w.post('words/block', { word: 'spam' }, 'https://evil.test')).status).toBe(403);

    const blocked = await w.post('words/block', { word: ' Spam ' });
    expect(blocked.headers.get('Location')).toBe('/admin?blocked=spam');
    expect(await shownName(viewer, spam.profile.id)).toBeNull();
    expect(await shownName(viewer, spammy.profile.id)).toBe('Spammy');
    expect((await viewer.call('board/follow', 'POST', { username: 'lan.spam' })).status).toBe(404);
    expect((await spam.call('board/me').then((r) => r.json())) as Profile).toMatchObject({
      hidden: true,
    });
    page = await w.page('?blocked=spam');
    expect(page.text).toContain('&quot;spam&quot; is blocked'); // the notice, escaped
    expect(page.text).toContain('<strong>spam</strong>');
    // Reported, and hidden by the word: its tag says so.
    expect(page.text).toContain('<span class="tag">Hidden by "spam"</span> 1 report');
    expect(page.text).toContain('<span class="tag">"spam"</span>'); // Hidden by the filter
    expect(page.text).toContain('@lan.spam · id');

    // New names with it can't be saved; the app shows that under the field.
    const newcomer = await w.person('Okay', 'okay');
    const badName = await newcomer.call('board/me', 'PUT', {
      displayName: 'Spam King',
      username: 'okay',
    });
    expect(badName.status).toBe(400);
    expect(await badName.json()).toEqual({ error: 'display_name_not_allowed' });
    const badUser = await newcomer.call('board/me', 'PUT', {
      displayName: 'Okay',
      username: 'spam.king',
    });
    expect(await badUser.json()).toEqual({ error: 'username_not_allowed' });
    // Spelled other ways: capitals, digits for letters, accents added, joined with "_" or ".".
    for (const [displayName, username] of [
      ['SPAM', 'okay'],
      ['Sp4m Lord', 'okay'],
      ['Spám', 'okay'],
      ['Okay', 'the_spam'],
      ['Okay', 'spam.99'],
    ]) {
      const tried = await newcomer.call('board/me', 'PUT', { displayName, username });
      expect([displayName, username, tried.status]).toEqual([displayName, username, 400]);
    }
    // Not the word itself: fine.
    const fine = await newcomer.call('board/me', 'PUT', {
      displayName: 'Spammy Two',
      username: 'okay',
    });
    expect(fine.status).toBe(200);
    // Renaming into it is refused too, and the old name stays.
    const rename = await spammy.call('board/me', 'PUT', {
      displayName: 'Spam Fan',
      username: 'spammy',
    });
    expect(rename.status).toBe(400);
    expect(await shownName(viewer, spammy.profile.id)).toBe('Spammy');

    // Already on the list: the preview says so, with no Block button.
    page = await w.page('?check=spam');
    expect(page.text).toContain('already on your list');
    expect(page.text).not.toContain('Block "spam"');

    const unblocked = await w.post('words/unblock', { word: 'spam' });
    expect(unblocked.headers.get('Location')).toBe('/admin?unblocked=spam');
    expect(await shownName(viewer, spam.profile.id)).toBe('Lan Spam');
    expect((await w.page()).text).toContain('No words of your own yet');
  });

  it('lists names the built-in lists hide, and says when a word is built in already', async () => {
    const w = worker();
    const fan = await w.person('Liverpool Fan', 'liverpool.fan');
    // As if it had been saved before "support" was one of the staff words.
    await runInDurableObject(w.board, (_, state) => {
      state.storage.sql.exec(
        "update members set display_name = 'Liverpool Supporter' where id = ?",
        fan.profile.id,
      );
    });
    const page = await w.page();
    expect(page.text).toContain('<span class="tag">Built-in list</span>');
    expect(page.text).toContain('Liverpool Supporter');
    expect((await w.page('?check=fuck')).text).toContain('built-in lists already stop it');
  });

  it('hides any username typed in, with or without the @', async () => {
    const w = worker();
    const lan = await w.person('Lan Anh', 'lan.anh');
    const viewer = await w.person('Binh', 'binh');
    const hidden = await w.post('hide', { username: ' @Lan.Anh ' });
    expect(hidden.headers.get('Location')).toBe('/admin?hidden=lan.anh');
    expect(await shownName(viewer, lan.profile.id)).toBeNull();
    expect((await w.page()).text).toContain('@lan.anh');

    const missing = await w.post('hide', { username: 'nobody.here' });
    expect(missing.headers.get('Location')).toBe('/admin?missing=nobody.here');
    expect((await w.page('?missing=nobody.here')).text).toContain('Nobody on the board');
  });

  it('refuses forms it can’t read, and other paths', async () => {
    const w = worker();
    expect((await w.post('hide', {})).status).toBe(400);
    expect((await w.post('show', { username: 'lan' })).status).toBe(400);
    expect((await w.post('hide', { id: 'not-an-id' })).status).toBe(400);
    expect((await w.send('/admin/other', { headers: w.login() })).status).toBe(404);
    expect((await w.send('/admin/hide', { headers: w.login() })).status).toBe(404);
  });
});
