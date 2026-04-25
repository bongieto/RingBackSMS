import { parseDateExpression } from '../../flows/meetingFlow';

const TZ = 'America/Chicago';

// 2026-04-24 8:14 PM Chicago = 2026-04-25 01:14 UTC. The earlier parser
// implementation broke at this boundary on UTC servers (Vercel) because it
// built dates with `new Date(y, m, d)` in server-local time, which shifted
// the resolved day for callers in CDT after ~7 PM.
const FRI_APR_24_8PM_CHICAGO_AS_UTC = new Date('2026-04-25T01:14:00Z');

describe('parseDateExpression', () => {
  it('resolves "tomorrow" to the next calendar day in tenant TZ', () => {
    const result = parseDateExpression('tomorrow', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result).not.toBeNull();
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 4, day: 25 });
    expect(result!.label).toBe('Saturday, April 25');
  });

  it('resolves "today" to today in tenant TZ even when the server clock has rolled over', () => {
    // Server clock is already April 25 UTC, but in Chicago it's still April 24.
    const result = parseDateExpression('today', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 4, day: 24 });
    expect(result!.label).toBe('Friday, April 24');
  });

  it('accepts "tomorrow at 10 am" with trailing time text', () => {
    const result = parseDateExpression('Tomorrow at 10 am', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result).not.toBeNull();
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 4, day: 25 });
  });

  it('accepts "Friday at 2pm" with trailing time text', () => {
    // Friday April 24 → "Friday" said on Friday means next Friday (May 1).
    const result = parseDateExpression('Friday at 2pm', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result).not.toBeNull();
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 5, day: 1 });
  });

  it('accepts "next Monday"', () => {
    const result = parseDateExpression('next Monday', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result).not.toBeNull();
    // Friday → next Monday is April 27 (3 days), but "next" forces +7 = May 4.
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 5, day: 4 });
  });

  it('accepts "Monday" (without "next") as the upcoming Monday', () => {
    const result = parseDateExpression('Monday', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 4, day: 27 });
  });

  it('accepts MM/DD format', () => {
    const result = parseDateExpression('5/15', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 5, day: 15 });
  });

  it('accepts MM/DD/YYYY format with 2-digit year', () => {
    const result = parseDateExpression('5/15/27', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result!.requestedDateLocal).toEqual({ year: 2027, month: 5, day: 15 });
  });

  it('returns null for unparseable input', () => {
    expect(parseDateExpression('soon', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC)).toBeNull();
    expect(parseDateExpression('', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC)).toBeNull();
  });

  it.each([
    ['May 1', { year: 2026, month: 5, day: 1 }],
    ['May 1st', { year: 2026, month: 5, day: 1 }],
    ['May the 5th', { year: 2026, month: 5, day: 5 }],
    ['January 15', { year: 2026, month: 1, day: 15 }], // Jan 15 has passed → next year
    ['Jan 15', { year: 2026, month: 1, day: 15 }],
    ['next May 3', { year: 2026, month: 5, day: 3 }],
    ['Sept 22', { year: 2026, month: 9, day: 22 }],
    ['december 31st', { year: 2026, month: 12, day: 31 }],
  ])('parses worded month "%s" → %j', (input, expected) => {
    const r = parseDateExpression(input, TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(r).not.toBeNull();
    // January passed (today is April 24), so next year:
    if (input.toLowerCase().includes('jan')) {
      expect(r!.requestedDateLocal).toEqual({ ...expected, year: 2027 });
    } else {
      expect(r!.requestedDateLocal).toEqual(expected);
    }
  });

  it.each([
    'When is the earliest available',
    'earliest',
    'soonest',
    'asap',
    'first available',
    'next available',
    'anytime',
    'any time',
  ])('flags findEarliest for "%s"', (input) => {
    const result = parseDateExpression(input, TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC);
    expect(result).not.toBeNull();
    expect(result!.findEarliest).toBe(true);
    expect(result!.label).toBe('the earliest available time');
    // Anchor date is today — handler walks forward from there.
    expect(result!.requestedDateLocal).toEqual({ year: 2026, month: 4, day: 24 });
  });

  it('produces startUtc/endUtc that bracket the local day in tenant TZ', () => {
    const result = parseDateExpression('tomorrow', TZ, FRI_APR_24_8PM_CHICAGO_AS_UTC)!;
    // Saturday April 25, 00:00 Chicago = April 25 05:00 UTC (CDT, UTC-5).
    expect(result.startUtc.toISOString()).toBe('2026-04-25T05:00:00.000Z');
    // Saturday April 25, 23:59 Chicago = April 26 04:59 UTC.
    expect(result.endUtc.toISOString()).toBe('2026-04-26T04:59:00.000Z');
  });
});
