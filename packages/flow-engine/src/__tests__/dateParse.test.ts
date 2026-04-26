import {
  ymdInTz,
  addDaysYmd,
  dayOfWeekYmd,
  parseDateOnly,
  parseDateRange,
  ymdToIso,
} from '../dateParse';

const TZ_CHI = 'America/Chicago';
const TZ_LA = 'America/Los_Angeles';

// Anchor: Saturday 2026-04-25 14:00 Chicago. We pick a Saturday so weekday
// math is exercised across the full week. Also a date past US DST start.
const SAT_APR_25_2PM_CHI_AS_UTC = new Date('2026-04-25T19:00:00Z');

// Anchor: Wed 2026-04-22 23:00 Chicago = 2026-04-23 04:00 UTC. Testing the
// classic TZ-bug case where UTC has already rolled to next day.
const WED_LATE_NIGHT_CHI_AS_UTC = new Date('2026-04-23T04:00:00Z');

describe('ymdInTz', () => {
  it('returns local date when UTC has already rolled forward', () => {
    expect(ymdInTz(WED_LATE_NIGHT_CHI_AS_UTC, TZ_CHI)).toEqual({
      year: 2026,
      month: 4,
      day: 22,
    });
  });

  it('respects the target timezone', () => {
    // 2pm Chicago = noon LA on the same day.
    expect(ymdInTz(SAT_APR_25_2PM_CHI_AS_UTC, TZ_LA)).toEqual({
      year: 2026,
      month: 4,
      day: 25,
    });
  });
});

describe('addDaysYmd', () => {
  it('rolls forward across month and year', () => {
    expect(addDaysYmd({ year: 2026, month: 12, day: 30 }, 5)).toEqual({
      year: 2027,
      month: 1,
      day: 4,
    });
  });
  it('handles negative deltas', () => {
    expect(addDaysYmd({ year: 2026, month: 3, day: 2 }, -3)).toEqual({
      year: 2026,
      month: 2,
      day: 27,
    });
  });
});

describe('dayOfWeekYmd', () => {
  it('returns 6 for Saturday Apr 25 2026', () => {
    expect(dayOfWeekYmd({ year: 2026, month: 4, day: 25 })).toBe(6);
  });
  it('returns 0 for Sunday Apr 26 2026', () => {
    expect(dayOfWeekYmd({ year: 2026, month: 4, day: 26 })).toBe(0);
  });
});

describe('ymdToIso', () => {
  it('zero-pads month and day', () => {
    expect(ymdToIso({ year: 2026, month: 4, day: 5 })).toBe('2026-04-05');
  });
});

describe('parseDateOnly', () => {
  // Saturday Apr 25 2026, 2pm Chicago.
  const now = SAT_APR_25_2PM_CHI_AS_UTC;
  const today = { year: 2026, month: 4, day: 25 };

  it('returns null for unparseable text', () => {
    expect(parseDateOnly('hello there', TZ_CHI, now)).toBeNull();
    expect(parseDateOnly('', TZ_CHI, now)).toBeNull();
  });

  it.each([
    ['today', today],
    ['where are you today', today],
    ['tonight', today],
    ['where will the truck be today?', today],
  ])('parses %s as today', (text, expected) => {
    expect(parseDateOnly(text, TZ_CHI, now)?.ymd).toEqual(expected);
  });

  it.each([
    ['tomorrow', { year: 2026, month: 4, day: 26 }],
    ['where are you tomorrow', { year: 2026, month: 4, day: 26 }],
    ['tmrw', { year: 2026, month: 4, day: 26 }],
  ])('parses %s as tomorrow', (text, expected) => {
    expect(parseDateOnly(text, TZ_CHI, now)?.ymd).toEqual(expected);
  });

  it('parses bare weekday matching today as today', () => {
    expect(parseDateOnly('saturday', TZ_CHI, now)?.ymd).toEqual(today);
  });

  it('parses "this <weekday>" as the next occurrence in the same week', () => {
    // From Saturday Apr 25, "this Monday" = Mon Apr 27 (delta = 2).
    expect(parseDateOnly('this monday', TZ_CHI, now)?.ymd).toEqual({
      year: 2026, month: 4, day: 27,
    });
    // "this Friday" from Saturday → next Friday (delta = 6).
    expect(parseDateOnly('this friday', TZ_CHI, now)?.ymd).toEqual({
      year: 2026, month: 5, day: 1,
    });
  });

  it('parses "next <weekday>" as +7 from "this <weekday>"', () => {
    expect(parseDateOnly('next monday', TZ_CHI, now)?.ymd).toEqual({
      year: 2026, month: 5, day: 4,
    });
    expect(parseDateOnly('next saturday', TZ_CHI, now)?.ymd).toEqual({
      year: 2026, month: 5, day: 2,
    });
  });

  it.each([
    ['april 30', { year: 2026, month: 4, day: 30 }],
    ['apr 30', { year: 2026, month: 4, day: 30 }],
    ['April 30th', { year: 2026, month: 4, day: 30 }],
    ['may 15', { year: 2026, month: 5, day: 15 }],
    ['where will you be on april 30', { year: 2026, month: 4, day: 30 }],
  ])('parses month-day phrase: %s', (text, expected) => {
    expect(parseDateOnly(text, TZ_CHI, now)?.ymd).toEqual(expected);
  });

  it('rolls month-day to next year when already past', () => {
    // From Sat Apr 25 2026, "march 5" should be 2027-03-05.
    expect(parseDateOnly('march 5', TZ_CHI, now)?.ymd).toEqual({
      year: 2027, month: 3, day: 5,
    });
  });

  it.each([
    ['4/30', { year: 2026, month: 4, day: 30 }],
    ['4-30', { year: 2026, month: 4, day: 30 }],
    ['where are you 5/1', { year: 2026, month: 5, day: 1 }],
    ['12/25', { year: 2026, month: 12, day: 25 }],
  ])('parses numeric date: %s', (text, expected) => {
    expect(parseDateOnly(text, TZ_CHI, now)?.ymd).toEqual(expected);
  });

  it('parses "the <ordinal>" within current month', () => {
    expect(parseDateOnly('the 30th', TZ_CHI, now)?.ymd).toEqual({
      year: 2026, month: 4, day: 30,
    });
  });

  it('rolls "the <ordinal>" forward when already past in this month', () => {
    // From Apr 25, "the 3rd" should be May 3.
    expect(parseDateOnly('the 3rd', TZ_CHI, now)?.ymd).toEqual({
      year: 2026, month: 5, day: 3,
    });
  });

  it('rejects times and prices that look like m/d', () => {
    // 3:30 should not parse as a date.
    expect(parseDateOnly('see you at 3:30', TZ_CHI, now)).toBeNull();
    // $1.50 should not parse as a date — period-separated, not slash.
    expect(parseDateOnly('that costs $1.50', TZ_CHI, now)).toBeNull();
  });

  it('handles late-night TZ correctly', () => {
    // Wed Apr 22 23:00 Chicago: "today" should be Apr 22 even though UTC
    // is already Apr 23.
    expect(parseDateOnly('today', TZ_CHI, WED_LATE_NIGHT_CHI_AS_UTC)?.ymd)
      .toEqual({ year: 2026, month: 4, day: 22 });
    expect(parseDateOnly('tomorrow', TZ_CHI, WED_LATE_NIGHT_CHI_AS_UTC)?.ymd)
      .toEqual({ year: 2026, month: 4, day: 23 });
  });
});

describe('parseDateRange', () => {
  // Anchor 1: Saturday Apr 25 2026, 2pm Chicago.
  const SAT = SAT_APR_25_2PM_CHI_AS_UTC;
  // Anchor 2: Wednesday Apr 22 2026 (mid-week, dow=3).
  const WED = new Date('2026-04-22T19:00:00Z');
  // Anchor 3: Sunday Apr 26 2026 (start of week, dow=0).
  const SUN = new Date('2026-04-26T19:00:00Z');

  it('returns null for unparseable text', () => {
    expect(parseDateRange('hello there', TZ_CHI, SAT)).toBeNull();
    expect(parseDateRange('tomorrow', TZ_CHI, SAT)).toBeNull(); // single-date, not a range
  });

  it('parses "next week" as Sunday-Saturday after this week', () => {
    // From Saturday Apr 25, next Sunday = Apr 26, next Saturday = May 2.
    expect(parseDateRange('where is the truck next week', TZ_CHI, SAT)).toEqual({
      from: { year: 2026, month: 4, day: 26 },
      to: { year: 2026, month: 5, day: 2 },
      label: 'next week',
    });
  });

  it('parses "next week" from a Sunday as the following Sun-Sat', () => {
    // From Sunday Apr 26, next Sun = May 3, next Sat = May 9.
    expect(parseDateRange('next week', TZ_CHI, SUN)).toEqual({
      from: { year: 2026, month: 5, day: 3 },
      to: { year: 2026, month: 5, day: 9 },
      label: 'next week',
    });
  });

  it('parses "this week" as today through this Saturday', () => {
    // From Wed Apr 22, this Saturday = Apr 25.
    expect(parseDateRange('what about this week', TZ_CHI, WED)).toEqual({
      from: { year: 2026, month: 4, day: 22 },
      to: { year: 2026, month: 4, day: 25 },
      label: 'this week',
    });
    // From Saturday Apr 25, this week = just today.
    expect(parseDateRange('this week', TZ_CHI, SAT)).toEqual({
      from: { year: 2026, month: 4, day: 25 },
      to: { year: 2026, month: 4, day: 25 },
      label: 'this week',
    });
  });

  it('parses "this weekend" as upcoming Sat+Sun', () => {
    // From Wed Apr 22, this weekend = Sat Apr 25 + Sun Apr 26.
    expect(parseDateRange('where will you be this weekend', TZ_CHI, WED)).toEqual({
      from: { year: 2026, month: 4, day: 25 },
      to: { year: 2026, month: 4, day: 26 },
      label: 'this weekend',
    });
    // From Saturday Apr 25, this weekend = today + Sun.
    expect(parseDateRange('this weekend', TZ_CHI, SAT)).toEqual({
      from: { year: 2026, month: 4, day: 25 },
      to: { year: 2026, month: 4, day: 26 },
      label: 'this weekend',
    });
  });

  it('parses "next weekend" as the weekend after this one', () => {
    // From Wed Apr 22, this weekend is Sat Apr 25 + Sun Apr 26.
    // Next weekend = Sat May 2 + Sun May 3.
    expect(parseDateRange('next weekend', TZ_CHI, WED)).toEqual({
      from: { year: 2026, month: 5, day: 2 },
      to: { year: 2026, month: 5, day: 3 },
      label: 'next weekend',
    });
    // From Saturday Apr 25, next weekend = +7 days.
    expect(parseDateRange('next weekend', TZ_CHI, SAT)).toEqual({
      from: { year: 2026, month: 5, day: 2 },
      to: { year: 2026, month: 5, day: 3 },
      label: 'next weekend',
    });
  });

  it('treats bare "weekend" as this weekend', () => {
    expect(parseDateRange('any plans for the weekend', TZ_CHI, WED)?.label).toBe('this weekend');
  });
});
