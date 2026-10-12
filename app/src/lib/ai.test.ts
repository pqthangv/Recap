import { AiError, createAiClient, errorFromResponse, tidyOcrText } from './ai';

const DEVICE = '6f1c2b9e-3d4a-4e5f-8a7b-1c2d3e4f5a6b';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function client(fetch: jest.Mock) {
  return createAiClient({ baseUrl: 'http://server/', deviceId: () => DEVICE, fetch });
}

describe('AI client', () => {
  it('sends the device id and text, and returns the cards', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { cards: [{ front: 'Q', back: 'A' }], remaining: 49 }));
    const result = await client(fetch).generate({ text: 'notes', mode: 'text', maxCards: 5 });
    expect(result).toEqual({ cards: [{ front: 'Q', back: 'A' }], remaining: 49 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://server/v1/generate');
    expect(JSON.parse(init.body)).toEqual({
      device_id: DEVICE,
      text: 'notes',
      mode: 'text',
      max_cards: 5,
    });
  });

  it('asks for the quota with the device id', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { remaining: 12, limit: 50 }));
    expect(await client(fetch).quota()).toEqual({ remaining: 12, limit: 50 });
    expect(fetch.mock.calls[0][0]).toBe(`http://server/v1/quota?device_id=${DEVICE}`);
  });

  it('explains being offline', async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(client(fetch).quota()).rejects.toMatchObject({ kind: 'offline' });
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    const fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const pending = client(fetch as jest.Mock).generate({ text: 'x', mode: 'text', maxCards: 1 });
    jest.advanceTimersByTime(120_000);
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    jest.useRealTimers();
  });

  it('passes on friendly server errors', async () => {
    const fetch = jest.fn().mockResolvedValue(
      jsonResponse(429, {
        error: 'quota_exceeded',
        message: "You've made 50 AI cards today. More tomorrow!",
        remaining: 0,
      }),
    );
    const error = await client(fetch)
      .generate({ text: 'x', mode: 'text', maxCards: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({
      kind: 'quota',
      remaining: 0,
      message: "You've made 50 AI cards today. More tomorrow!",
    });
  });

  it('warm-up never throws', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('down'));
    await expect(client(fetch).warmUp()).resolves.toBeUndefined();
  });
});

describe('tidyOcrText', () => {
  it('collapses spaces and blank lines but keeps line breaks', () => {
    expect(tidyOcrText('  Mitochondria   make ATP \n\n\n\nRibosomes\tmake proteins  \n')).toBe(
      'Mitochondria make ATP\n\nRibosomes make proteins',
    );
    expect(tidyOcrText(' \n \n ')).toBe('');
  });
});

describe('errorFromResponse', () => {
  it('maps codes to kinds and hides unexpected details', () => {
    expect(
      errorFromResponse(503, { error: 'ai_busy', message: 'AI is busy, try again later.' }),
    ).toMatchObject({ kind: 'busy', message: 'AI is busy, try again later.' });
    expect(
      errorFromResponse(422, { error: 'pdf_no_text', message: 'Take a photo instead.' }).kind,
    ).toBe('input');
    expect(errorFromResponse(500, { detail: 'Traceback…' })).toMatchObject({
      kind: 'server',
      message: 'Something went wrong on our side. Please try again later.',
    });
    expect(errorFromResponse(502, null).kind).toBe('server');
  });
});

describe('PDF upload', () => {
  it('sends the device id and the file as multipart form data', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { text: 'Notes', pages: 1, truncated: false }));
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    expect(await client(fetch).extractPdf(file, 'notes.pdf')).toEqual({
      text: 'Notes',
      pages: 1,
      truncated: false,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://server/v1/extract-pdf');
    const form = init.body as FormData;
    expect(form.get('device_id')).toBe(DEVICE);
    expect(form.get('file')).toBeTruthy();
  });
});
