// Talking to Recap's server for AI cards. No API keys here: the server holds them.
// Errors come back as AiError with a friendly message to show as-is.
import { language, t, type StringKey } from './i18n';

export type GeneratedCard = { front: string; back: string };
export type AiMode = 'text' | 'topic';
export type Quota = { remaining: number; limit: number };
export type PdfText = { text: string; pages: number; truncated: boolean };
/** Why someone reports an AI card (server/app/reports.py). */
export type ReportReason = 'offensive' | 'wrong' | 'other';

/** OCR text, tidied: spaces collapsed, blank lines between blocks kept to one. */
export function tidyOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const MAX_INPUT_CHARS = 15_000;
export const MAX_TOPIC_CHARS = 200;
export const MAX_CARDS_PER_REQUEST = 30;
// The server's limits for a reported card; an edited card that's longer is cut to fit.
const MAX_REPORT_FRONT = 2_000;
const MAX_REPORT_BACK = 4_000;

export type AiErrorKind =
  | 'offline'
  | 'timeout'
  | 'quota'
  | 'busy'
  | 'input' // too long, empty, no usable text, bad PDF…
  | 'server';

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly remaining?: number,
    /** The underlying error (e.g. why fetch failed), for logs. */
    readonly reason?: unknown,
  ) {
    super(message);
  }
}

const KIND_BY_CODE: Record<string, AiErrorKind> = {
  quota_exceeded: 'quota',
  ip_quota_exceeded: 'quota',
  rate_limited: 'busy',
  ai_busy: 'busy',
  too_long: 'input',
  too_large: 'input',
  empty: 'input',
  no_cards: 'input',
  bad_pdf: 'input',
  pdf_locked: 'input',
  pdf_no_text: 'input',
  too_many_reports: 'quota',
  invalid_request: 'input',
};

// The server writes its messages in English. In another language the app shows its own text for
// the error instead (by code, or by kind for a code it doesn't know).
const MESSAGE_BY_CODE: Record<string, StringKey> = {
  quota_exceeded: 'aiError.quota',
  ip_quota_exceeded: 'aiError.networkQuota',
  rate_limited: 'aiError.rateLimited',
  ai_busy: 'aiError.busy',
  not_configured: 'aiError.notConfigured',
  too_long: 'aiError.tooLong',
  too_large: 'aiError.tooLarge',
  empty: 'aiError.empty',
  no_cards: 'aiError.noCards',
  bad_pdf: 'aiError.badPdf',
  pdf_locked: 'aiError.pdfLocked',
  pdf_no_text: 'aiError.pdfNoText',
  too_many_reports: 'aiError.tooManyReports',
};
const MESSAGE_BY_KIND: Record<AiErrorKind, StringKey> = {
  offline: 'aiError.offline',
  timeout: 'aiError.timeout',
  quota: 'aiError.quota',
  busy: 'aiError.busy',
  input: 'common.somethingWrong',
  server: 'aiError.server',
};

/** Turns an error response ({error, message}) into an AiError. */
export function errorFromResponse(status: number, body: unknown): AiError {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const code = typeof data.error === 'string' ? data.error : '';
  const remaining = typeof data.remaining === 'number' ? data.remaining : undefined;
  const kind =
    KIND_BY_CODE[code] ?? (status === 429 ? 'quota' : status === 503 ? 'busy' : 'server');
  const serverMessage = typeof data.message === 'string' && data.message ? data.message : null;
  const message =
    kind === 'server'
      ? t('aiError.server')
      : language() === 'en' && serverMessage
        ? serverMessage
        : t(MESSAGE_BY_CODE[code] ?? MESSAGE_BY_KIND[kind]);
  return new AiError(kind, message, remaining);
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type AiClientOptions = {
  baseUrl: string;
  deviceId: () => string;
  fetch?: Fetch;
};

/** A file to upload: a Blob, or expo-file-system's File (same reading methods, read from disk). */
export type UploadFile = Blob | { name: string; type: string; bytes(): Promise<Uint8Array> };

const TIMEOUTS = { health: 70_000, quota: 70_000, generate: 120_000, pdf: 90_000, report: 70_000 };

export function createAiClient({ baseUrl, deviceId, fetch: doFetch = fetch }: AiClientOptions) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { ...init, signal: controller.signal });
    } catch (e) {
      throw controller.signal.aborted
        ? new AiError('timeout', t('aiError.timeout'), undefined, e)
        : new AiError('offline', t('aiError.offline'), undefined, e);
    } finally {
      clearTimeout(timer);
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON (e.g. a proxy error page).
    }
    if (!response.ok) throw errorFromResponse(response.status, body);
    if (body === null) throw new AiError('server', t('aiError.server'));
    return body as T;
  }

  return {
    /** Wakes the server (the free host sleeps when idle). Errors are ignored. */
    warmUp(): Promise<void> {
      return request('/health', { method: 'GET' }, TIMEOUTS.health).then(
        () => undefined,
        () => undefined,
      );
    },

    quota(): Promise<Quota> {
      const id = encodeURIComponent(deviceId());
      return request(`/v1/quota?device_id=${id}`, { method: 'GET' }, TIMEOUTS.quota);
    },

    generate(input: {
      text: string;
      mode: AiMode;
      maxCards: number;
      language?: string;
    }): Promise<{ cards: GeneratedCard[]; remaining: number }> {
      return request(
        '/v1/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceId(),
            text: input.text,
            mode: input.mode,
            max_cards: input.maxCards,
            language: input.language,
          }),
        },
        TIMEOUTS.generate,
      );
    },

    /** Flags an AI-made card as offensive, wrong or harmful (Google Play requires this). */
    report(card: GeneratedCard, reason: ReportReason): Promise<void> {
      return request(
        '/v1/report',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceId(),
            front: card.front.slice(0, MAX_REPORT_FRONT),
            back: card.back.slice(0, MAX_REPORT_BACK),
            reason,
          }),
        },
        TIMEOUTS.report,
      ).then(() => undefined);
    },

    /** Uploads a PDF (multipart) and gets its text. */
    extractPdf(file: UploadFile, fileName: string): Promise<PdfText> {
      const form = new FormData();
      form.append('device_id', deviceId());
      // Expo's fetch (the app's global fetch since SDK 52) doesn't accept React Native's
      // { uri, name, type } file parts; it takes a Blob or a File from expo-file-system.
      form.append('file', file as Blob, fileName);
      return request('/v1/extract-pdf', { method: 'POST', body: form }, TIMEOUTS.pdf);
    },
  };
}

export type AiClient = ReturnType<typeof createAiClient>;
