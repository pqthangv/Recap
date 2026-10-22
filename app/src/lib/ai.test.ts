import { AiError, createAiClient, errorFromResponse, tidyOcrText } from './ai';
import { setLanguage } from './i18n';

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
      math: true, // this app draws LaTeX
    });
  });

  it("sends each side's language, and nothing for Auto", async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { cards: [], remaining: 49 }));
    await client(fetch).generate({
      text: 'food',
      mode: 'topic',
      maxCards: 5,
      frontLanguage: 'de',
      backLanguage: 'vi',
    });
    await client(fetch).generate({
      text: 'food',
      mode: 'topic',
      maxCards: 5,
      frontLanguage: null,
      backLanguage: 'vi',
    });
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[0]).toMatchObject({ front_language: 'de', back_language: 'vi' });
    expect(bodies[1]).not.toHaveProperty('front_language');
    expect(bodies[1]).toMatchObject({ back_language: 'vi' });
  });

  it('asks for the quota with the device id', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { remaining: 12, limit: 50 }));
    expect(await client(fetch).quota()).toEqual({ remaining: 12, limit: 50 });
    expect(fetch.mock.calls[0][0]).toBe(`http://server/v1/quota?device_id=${DEVICE}`);
  });

  describe('with Play Integrity tickets', () => {
    const PHONE = 'ab'.repeat(32);
    const tickets = {
      warmUp: jest.fn(),
      phoneId: jest.fn(() => Promise.resolve(PHONE)),
      ticket: jest.fn(() => Promise.resolve({ phoneId: PHONE, token: 'ticket-1' })),
    };
    const withTickets = (fetch: jest.Mock) =>
      createAiClient({ baseUrl: 'http://server', deviceId: () => DEVICE, tickets, fetch });

    it('sends a fresh ticket with each request for cards', async () => {
      const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { cards: [], remaining: 40 }));
      await withTickets(fetch).generate({ text: 'notes', mode: 'text', maxCards: 5 });
      await withTickets(fetch).generate({ text: 'notes', mode: 'text', maxCards: 5 });
      expect(tickets.ticket).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
        device_id: DEVICE,
        phone_id: PHONE,
        integrity_token: 'ticket-1',
      });
    });

    it('sends neither when there is no ticket', async () => {
      tickets.ticket.mockResolvedValueOnce(null as never);
      const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { cards: [], remaining: 40 }));
      await withTickets(fetch).generate({ text: 'notes', mode: 'text', maxCards: 5 });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body).not.toHaveProperty('phone_id');
      expect(body).not.toHaveProperty('integrity_token');
    });

    it("asks for the phone's count, which needs no ticket", async () => {
      const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { remaining: 20, limit: 50 }));
      const ticketsBefore = tickets.ticket.mock.calls.length;
      await withTickets(fetch).quota();
      expect(fetch.mock.calls[0][0]).toBe(
        `http://server/v1/quota?device_id=${DEVICE}&phone_id=${PHONE}`,
      );
      expect(tickets.ticket.mock.calls.length).toBe(ticketsBefore); // Google isn't asked
    });

    it('gets Google Play ready while waking the server', async () => {
      const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
      await withTickets(fetch).warmUp();
      expect(tickets.warmUp).toHaveBeenCalled();
    });
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
    const failed = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(120_000); // async: the request starts after the ticket
    await failed;
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

  it('reports a card with the device id and reason', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(201, { ok: true }));
    const back = 'b'.repeat(5_000); // edited past the server's limit: cut to fit
    await expect(client(fetch).report({ front: 'Q', back }, 'offensive')).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://server/v1/report');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      device_id: DEVICE,
      front: 'Q',
      back: 'b'.repeat(4_000),
      reason: 'offensive',
    });
  });

  it('explains too many reports', async () => {
    const message = "You've sent a lot of reports today. Thanks! More tomorrow.";
    const fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(429, { error: 'too_many_reports', message }));
    await expect(client(fetch).report({ front: 'Q', back: 'A' }, 'wrong')).rejects.toMatchObject({
      kind: 'quota',
      message,
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
    expect(
      errorFromResponse(429, { error: 'rate_limited', message: 'Wait a minute.' }),
    ).toMatchObject({ kind: 'busy', message: 'Wait a minute.' });
    expect(
      errorFromResponse(429, { error: 'ip_quota_exceeded', message: 'More tomorrow!' }).kind,
    ).toBe('quota');
  });

  it("says plainly when the AI refuses the text, in the app's language", () => {
    const body = {
      error: 'blocked',
      message: "Recap can't make cards from that. Try different text.",
      remaining: 50,
    };
    expect(errorFromResponse(422, body)).toMatchObject({
      kind: 'input',
      message: "Recap can't make cards from that. Try different text.",
      remaining: 50,
    });
    setLanguage('vi');
    try {
      expect(errorFromResponse(422, body).message).toBe(
        'Recap không thể tạo thẻ từ nội dung này. Hãy thử nội dung khác.',
      );
    } finally {
      setLanguage('en');
    }
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
