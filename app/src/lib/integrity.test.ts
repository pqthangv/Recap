import { createHash } from 'crypto';

import { createTickets, NO_TICKETS, type TicketOptions } from './integrity';

const ANDROID_ID = 'dd96dec43fb81c97';
const PHONE = createHash('sha256').update(`recap-phone:${ANDROID_ID}`).digest('hex');

function setup(changes: Partial<TicketOptions> = {}) {
  const options = {
    projectNumber: '333284966532',
    androidId: jest.fn(() => ANDROID_ID),
    sha256: jest.fn(async (text: string) => createHash('sha256').update(text).digest('hex')),
    prepare: jest.fn(() => Promise.resolve()),
    request: jest.fn((hash: string) => Promise.resolve(`ticket-for-${hash.slice(0, 6)}`)),
    onError: jest.fn(),
    ...changes,
  };
  return { options, tickets: createTickets(options) };
}

function coded(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('Play Integrity tickets', () => {
  it('sends a hash of the Android ID, never the ID, and asks Google Play for that phone', async () => {
    const { options, tickets } = setup();
    expect(await tickets.ticket()).toEqual({
      phoneId: PHONE,
      token: `ticket-for-${PHONE.slice(0, 6)}`,
    });
    expect(PHONE).toMatch(/^[0-9a-f]{64}$/);
    expect(PHONE).not.toContain(ANDROID_ID);
    expect(options.prepare).toHaveBeenCalledWith('333284966532');
    expect(options.request).toHaveBeenCalledWith(PHONE); // the ticket is made for this phone
    expect(await tickets.phoneId()).toBe(PHONE);
  });

  it('gets ready once, and every request gets a fresh ticket', async () => {
    const { options, tickets } = setup();
    tickets.warmUp();
    await tickets.ticket();
    await tickets.ticket();
    expect(options.prepare).toHaveBeenCalledTimes(1);
    expect(options.request).toHaveBeenCalledTimes(2);
    expect(options.androidId).toHaveBeenCalledTimes(1);
  });

  it('makes a new ticket maker once when the old one expired', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(coded('ERR_APP_INTEGRITY_PROVIDER_INVALID'))
      .mockResolvedValue('fresh');
    const { options, tickets } = setup({ request });
    expect(await tickets.ticket()).toEqual({ phoneId: PHONE, token: 'fresh' });
    expect(options.prepare).toHaveBeenCalledTimes(2);
  });

  it('goes on without a ticket when Google Play is missing, and tries again next time', async () => {
    const prepare = jest
      .fn()
      .mockRejectedValueOnce(coded('ERR_APP_INTEGRITY_PLAY_STORE_NOT_FOUND'))
      .mockResolvedValue(undefined);
    const { options, tickets } = setup({ prepare });
    expect(await tickets.ticket()).toBeNull();
    expect(options.onError).toHaveBeenCalledTimes(1);
    expect(await tickets.ticket()).not.toBeNull();
  });

  it('goes on without a ticket when one is refused', async () => {
    const request = jest.fn().mockRejectedValue(coded('ERR_APP_INTEGRITY_TOO_MANY_REQUESTS'));
    const { options, tickets } = setup({ request });
    expect(await tickets.ticket()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1); // only an expired ticket maker is worth a retry
    expect(options.prepare).toHaveBeenCalledTimes(1);
  });

  it('never waits long for Google Play', async () => {
    jest.useFakeTimers();
    try {
      const { tickets } = setup({ request: () => new Promise<string>(() => undefined) });
      const ticket = tickets.ticket();
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await ticket).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('has no phone id without an Android ID or a usable hash', async () => {
    expect(await setup({ androidId: () => '' }).tickets.ticket()).toBeNull();
    const broken = setup({ sha256: async () => 'not hex' });
    expect(await broken.tickets.phoneId()).toBeNull();
    expect(await broken.tickets.ticket()).toBeNull();
    expect(broken.options.request).not.toHaveBeenCalled();
  });

  it('is off without a project number', async () => {
    const { options, tickets } = setup({ projectNumber: '' });
    expect(tickets).toBe(NO_TICKETS);
    tickets.warmUp();
    expect(await tickets.ticket()).toBeNull();
    expect(await tickets.phoneId()).toBeNull();
    expect(options.prepare).not.toHaveBeenCalled();
  });
});
