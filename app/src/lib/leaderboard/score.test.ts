import { dayStartOffset } from '../day';

import {
  NOT_JOINED_GAP_MS,
  parseSent,
  SEND_GAP_MS,
  shouldSend,
  streakUntil,
  weekOf,
  weekStart,
  type BoardScore,
} from './score';

const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime();
const score = (change: Partial<BoardScore> = {}): BoardScore => ({
  streak: 3,
  streakUntil: dayStartOffset(NOW, 2),
  week: weekOf(NOW),
  weekCards: 40,
  ...change,
});

describe('the leaderboard week', () => {
  it('starts Monday 00:00 UTC, as on the board', () => {
    expect(weekOf(Date.UTC(2026, 10, 4, 12))).toBe('2026-11-02'); // a Wednesday
    expect(weekOf(Date.UTC(2026, 10, 2))).toBe('2026-11-02');
    expect(weekOf(Date.UTC(2026, 10, 1, 23, 59))).toBe('2026-10-26'); // Sunday night
    expect(weekStart(Date.UTC(2026, 10, 4, 12))).toBe(Date.UTC(2026, 10, 2));
  });
});

describe('streakUntil', () => {
  it("lasts to the end of tomorrow once today's goal is met, else to the end of today", () => {
    expect(streakUntil(4, true, NOW)).toBe(dayStartOffset(NOW, 2));
    expect(streakUntil(3, false, NOW)).toBe(dayStartOffset(NOW, 1));
    expect(streakUntil(0, false, NOW)).toBe(0);
  });
});

describe('shouldSend', () => {
  const sent = { joined: true, at: NOW, score: score() };

  it('sends the first time, and never the same score twice', () => {
    expect(shouldSend(null, score(), NOW)).toBe(true);
    expect(shouldSend({ joined: true, at: NOW }, score(), NOW)).toBe(true);
    expect(shouldSend(sent, score(), NOW + 2 * SEND_GAP_MS, true)).toBe(false);
  });

  it('sends a new streak or week right away, more cards at most hourly', () => {
    expect(shouldSend(sent, score({ streak: 4 }), NOW + 1000)).toBe(true);
    expect(shouldSend(sent, score({ week: '2026-11-09', weekCards: 0 }), NOW + 1000)).toBe(true);
    expect(shouldSend(sent, score({ weekCards: 41 }), NOW + 1000)).toBe(false);
    expect(shouldSend(sent, score({ weekCards: 41 }), NOW + SEND_GAP_MS)).toBe(true);
    // Opening the Leaderboard sends what's new.
    expect(shouldSend(sent, score({ weekCards: 41 }), NOW + 1000, true)).toBe(true);
  });

  it('asks again a day after the account was not on the board', () => {
    const notJoined = { joined: false, at: NOW };
    expect(shouldSend(notJoined, score(), NOW + 1000)).toBe(false);
    expect(shouldSend(notJoined, score(), NOW + NOT_JOINED_GAP_MS)).toBe(true);
    expect(shouldSend(notJoined, score(), NOW + 1000, true)).toBe(true);
  });
});

describe('parseSent', () => {
  it('reads what was saved, and nothing else', () => {
    const sent = { joined: true, at: NOW, score: score() };
    expect(parseSent(JSON.parse(JSON.stringify(sent)))).toEqual(sent);
    expect(parseSent({ joined: false, at: NOW })).toEqual({ joined: false, at: NOW });
    expect(parseSent({ joined: true, at: NOW, score: { streak: '3' } })).toEqual({
      joined: true,
      at: NOW,
    });
    expect(parseSent(null)).toBeNull();
    expect(parseSent({ joined: 'yes', at: NOW })).toBeNull();
  });
});
