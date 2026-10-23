import {
  CHECK_EVERY_MS,
  dueForCheck,
  fetchLatestVersion,
  isNewer,
  noticeVersion,
  readVersionFile,
  VERSION_URL,
} from './updates';

function textResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response;
}

describe('isNewer', () => {
  it('compares each part as a number', () => {
    expect(isNewer('1.0.8', '1.0.7')).toBe(true);
    expect(isNewer('1.0.10', '1.0.9')).toBe(true); // not as text
    expect(isNewer('1.1', '1.0.9')).toBe(true);
    expect(isNewer('2.0.0', '1.9.9')).toBe(true);
  });

  it('is false for the same or an older version', () => {
    expect(isNewer('1.0.7', '1.0.7')).toBe(false);
    expect(isNewer('1.0', '1.0.0')).toBe(false);
    expect(isNewer('1.0.6', '1.0.7')).toBe(false);
  });

  it('is false when either is not a version', () => {
    expect(isNewer('1.0.8-beta', '1.0.7')).toBe(false);
    expect(isNewer('', '1.0.7')).toBe(false);
    expect(isNewer('1.0.8', 'unknown')).toBe(false);
  });
});

describe('readVersionFile', () => {
  it("reads this platform's version", () => {
    const file = '{"android": "1.0.7", "ios": "1.0.5"}';
    expect(readVersionFile(file, 'android')).toBe('1.0.7');
    expect(readVersionFile(file, 'ios')).toBe('1.0.5');
  });

  it('has nothing for a platform the file leaves out', () => {
    expect(readVersionFile('{"android": "1.0.7"}', 'ios')).toBeNull();
  });

  it('ignores anything that is not the expected file', () => {
    expect(readVersionFile('<!DOCTYPE html><html>…</html>', 'android')).toBeNull();
    expect(readVersionFile('{"android": 107}', 'android')).toBeNull();
    expect(readVersionFile('{"android": "soon"}', 'android')).toBeNull();
    expect(readVersionFile('["1.0.7"]', 'android')).toBeNull();
    expect(readVersionFile('null', 'android')).toBeNull();
  });
});

describe('dueForCheck', () => {
  const now = 1_800_000_000_000;

  it('checks at most once a day', () => {
    expect(dueForCheck(undefined, now)).toBe(true); // never checked
    expect(dueForCheck(now - 60_000, now)).toBe(false);
    expect(dueForCheck(now - CHECK_EVERY_MS, now)).toBe(true);
  });

  it('checks again if the clock went back or the value is odd', () => {
    expect(dueForCheck(now + 60_000, now)).toBe(true);
    expect(dueForCheck('yesterday', now)).toBe(true);
  });
});

describe('noticeVersion', () => {
  it('shows a newer version until it is hidden', () => {
    expect(noticeVersion('1.0.8', '1.0.7', undefined)).toBe('1.0.8');
    expect(noticeVersion('1.0.8', '1.0.7', '1.0.8')).toBeNull();
    expect(noticeVersion('1.0.9', '1.0.7', '1.0.8')).toBe('1.0.9'); // hidden only that one
  });

  it('shows nothing when up to date or unsure', () => {
    expect(noticeVersion('1.0.7', '1.0.7', undefined)).toBeNull();
    expect(noticeVersion('1.0.6', '1.0.7', undefined)).toBeNull(); // the file is behind
    expect(noticeVersion(undefined, '1.0.7', undefined)).toBeNull(); // never checked
    expect(noticeVersion('1.0.8', null, undefined)).toBeNull();
  });
});

describe('fetchLatestVersion', () => {
  it('downloads the file from the website and nothing else', async () => {
    const fetch = jest.fn().mockResolvedValue(textResponse(200, '{"android": "1.0.8"}'));
    expect(await fetchLatestVersion('android', fetch)).toBe('1.0.8');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(VERSION_URL);
    expect(init).not.toHaveProperty('body');
    expect(init).not.toHaveProperty('headers'); // no ids
  });

  it('gives null when offline, on an error, or for the wrong file', async () => {
    expect(
      await fetchLatestVersion('android', jest.fn().mockRejectedValue(new TypeError('offline'))),
    ).toBeNull();
    expect(
      await fetchLatestVersion('android', jest.fn().mockResolvedValue(textResponse(404, ''))),
    ).toBeNull();
    expect(
      await fetchLatestVersion('android', jest.fn().mockResolvedValue(textResponse(200, '<html>'))),
    ).toBeNull();
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const fetch = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
      const pending = fetchLatestVersion('android', fetch as jest.Mock, 10_000);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await pending).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
