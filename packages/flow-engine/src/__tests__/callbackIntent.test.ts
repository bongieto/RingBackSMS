import { detectCallbackIntent, parseCallbackTime } from '../callbackIntent';

const TZ = 'America/Chicago';

// 2026-04-24 8:14 PM Chicago = 2026-04-25 01:14 UTC.
const FRI_APR_24_8PM_CHICAGO_AS_UTC = new Date('2026-04-25T01:14:00Z');
// 2026-04-24 10:00 AM Chicago = 2026-04-24 15:00 UTC — caller can still
// say "3pm" and have it land later today.
const FRI_APR_24_10AM_CHICAGO_AS_UTC = new Date('2026-04-24T15:00:00Z');

describe('detectCallbackIntent', () => {
  it.each([
    'call me back at 3pm',
    'Can you call me back?',
    'ring me back tonight',
    'give me a call later',
    'gimme a call tomorrow',
    'callback at 5',
  ])('matches "%s"', (text) => {
    expect(detectCallbackIntent(text)).toBe(true);
  });

  it.each([
    'I want to book a meeting',
    'do you do new installs',
    'how much for a haircut',
    'can you call my doctor',
  ])('does not match "%s"', (text) => {
    expect(detectCallbackIntent(text)).toBe(false);
  });
});

describe('parseCallbackTime', () => {
  it('parses "call me back at 3pm" today when 3pm is still ahead', () => {
    const r = parseCallbackTime('call me back at 3pm', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    expect(r!.approximate).toBe(false);
    // 3pm Chicago = 20:00 UTC same day
    expect(r!.whenUtc.toISOString()).toBe('2026-04-24T20:00:00.000Z');
  });

  it('rolls "3pm" to tomorrow when 3pm has already passed', () => {
    // 8:14pm Chicago — 3pm has passed, should land at 3pm tomorrow.
    const r = parseCallbackTime('call me back at 3pm', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    // April 25 3pm Chicago = April 25 20:00 UTC
    expect(r!.whenUtc.toISOString()).toBe('2026-04-25T20:00:00.000Z');
  });

  it('honors explicit "tomorrow" + time even if today\'s slot is still ahead', () => {
    const r = parseCallbackTime('call me back tomorrow at 9am', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    // April 25 9am Chicago = April 25 14:00 UTC
    expect(r!.whenUtc.toISOString()).toBe('2026-04-25T14:00:00.000Z');
  });

  it('parses "in 30 minutes"', () => {
    const r = parseCallbackTime('ring me back in 30 minutes', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    expect(r!.approximate).toBe(false);
    expect(r!.whenUtc.getTime()).toBe(FRI_APR_24_10AM_CHICAGO_AS_UTC.getTime() + 30 * 60_000);
  });

  it('parses "in an hour"', () => {
    const r = parseCallbackTime('call me in an hour', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    expect(r!.whenUtc.getTime()).toBe(FRI_APR_24_10AM_CHICAGO_AS_UTC.getTime() + 60 * 60_000);
  });

  it('parses "tonight" as approximate 7pm', () => {
    const r = parseCallbackTime('call me back tonight', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    expect(r!.approximate).toBe(true);
    // 7pm Chicago = 00:00 UTC next day
    expect(r!.whenUtc.toISOString()).toBe('2026-04-25T00:00:00.000Z');
  });

  it('returns null when the time is unparseable', () => {
    const r = parseCallbackTime('call me back', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).toBeNull();
  });

  it('rejects naked "3" (ambiguous, no meridiem)', () => {
    const r = parseCallbackTime('call me back at 3', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).toBeNull();
  });

  it('accepts 24h "at 15:00"', () => {
    const r = parseCallbackTime('call me back at 15:00', TZ, FRI_APR_24_10AM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    expect(r!.whenUtc.toISOString()).toBe('2026-04-24T20:00:00.000Z');
  });
});
