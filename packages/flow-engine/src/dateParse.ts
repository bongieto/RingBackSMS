// Date-only parsing and TZ-aware Y/M/D helpers. Pure functions — no I/O.
//
// Used by:
//  - callbackIntent.ts (re-exports addDaysYmd / ymdInTz here)
//  - foodTruckLocationService.ts (parseDateOnly to extract a target
//    date from "where are you tomorrow / this Friday / Apr 30").
//
// We intentionally keep this deterministic. LLM understanding of fuzzy
// phrases ("this weekend", holiday names) is out of scope.

export interface Ymd {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

/** Returns the current Y/M/D in `timezone`. */
export function ymdInTz(now: Date, timezone: string): Ymd {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Adds `delta` days (can be negative) to a Y/M/D, normalizing month/year overflow. */
export function addDaysYmd(ymd: Ymd, delta: number): Ymd {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0=Sun..6=Sat for a given Y/M/D (using UTC math, since the date is already TZ-anchored). */
export function dayOfWeekYmd(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

/** Format a Ymd as "Fri, Apr 30" using tenant TZ for the weekday calculation. */
export function formatPrettyDate(ymd: Ymd, timezone: string): string {
  // Build a Date at noon UTC on the given Y/M/D so weekday formatting in any
  // sensible timezone resolves to the same calendar date.
  const noonUtc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
    .format(noonUtc)
    .replace(/,/g, '');
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAY_GROUP = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const MONTH_GROUP = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

export interface ParsedDate {
  ymd: Ymd;
  /** Human-readable label, e.g. "Today", "Tomorrow", "Fri Apr 30". */
  label: string;
}

/**
 * Pull a target date out of `text`, anchored in `timezone`. Returns null
 * for phrases we can't pin to a specific calendar date.
 *
 * Accepts:
 *  - "today" / "tonight"
 *  - "tomorrow" / "tmrw"
 *  - "this <weekday>"  → next occurrence in current week (today included)
 *  - "next <weekday>"  → +7 days from this <weekday>
 *  - "<weekday>" alone → today if today matches, else next occurrence
 *  - "<month> <day>"   → that day this year (or next year if past)
 *  - "<m>/<d>" or "<m>-<d>"
 *  - "the Nth" / "the N" → day N this month (or next month if past)
 */
export function parseDateOnly(
  text: string,
  timezone: string,
  now: Date = new Date(),
): ParsedDate | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const today = ymdInTz(now, timezone);

  if (/\btoday\b|\btonight\b/.test(t)) {
    return { ymd: today, label: 'today' };
  }
  if (/\btomorrow\b|\btmrw\b/.test(t)) {
    return { ymd: addDaysYmd(today, 1), label: 'tomorrow' };
  }

  // "this <weekday>" / "next <weekday>" / bare "<weekday>"
  const wkRe = new RegExp(`\\b(this|next)?\\s*(${WEEKDAY_GROUP})\\b`);
  const wkMatch = t.match(wkRe);
  if (wkMatch) {
    const qualifier = wkMatch[1] ?? null;
    const targetDow = WEEKDAYS[wkMatch[2]];
    const todayDow = dayOfWeekYmd(today);
    let delta = (targetDow - todayDow + 7) % 7;
    if (qualifier === 'next') {
      delta += 7;
    }
    // Bare "<weekday>" or "this <weekday>": delta=0 means today, otherwise
    // next occurrence in this week.
    const ymd = addDaysYmd(today, delta);
    return { ymd, label: formatPrettyDate(ymd, timezone) };
  }

  // "<month> <day>" — "april 30", "apr 30", "april 30th"
  const monthDayRe = new RegExp(`\\b(${MONTH_GROUP})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`);
  const monthDayMatch = t.match(monthDayRe);
  if (monthDayMatch) {
    const month = MONTHS[monthDayMatch[1]];
    const day = Number(monthDayMatch[2]);
    if (day >= 1 && day <= 31) {
      const candidate = rollForwardYear({ year: today.year, month, day }, today);
      return { ymd: candidate, label: formatPrettyDate(candidate, timezone) };
    }
  }

  // "<m>/<d>" or "<m>-<d>" — strict 2-digit-or-less numeric date.
  // Avoid matching prices ($1.50), times (3:30), random numbers (1234).
  const numericRe = /(?:^|[^\d])(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:[^\d]|$)/;
  const numericMatch = t.match(numericRe);
  if (numericMatch) {
    const month = Number(numericMatch[1]);
    const day = Number(numericMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = rollForwardYear({ year: today.year, month, day }, today);
      return { ymd: candidate, label: formatPrettyDate(candidate, timezone) };
    }
  }

  // "the 30th", "the 3rd", "the 21" — day N of this month (rolls forward if past).
  const ordinalRe = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)?\b/;
  const ordinalMatch = t.match(ordinalRe);
  if (ordinalMatch) {
    const day = Number(ordinalMatch[1]);
    if (day >= 1 && day <= 31) {
      let candidate: Ymd = { year: today.year, month: today.month, day };
      if (isBefore(candidate, today)) {
        // Roll to next month.
        const next = addDaysYmd({ ...today, day: 1 }, 32);
        candidate = { year: next.year, month: next.month, day };
      }
      return { ymd: candidate, label: formatPrettyDate(candidate, timezone) };
    }
  }

  return null;
}

function rollForwardYear(target: Ymd, today: Ymd): Ymd {
  if (isBefore(target, today)) {
    return { ...target, year: target.year + 1 };
  }
  return target;
}

function isBefore(a: Ymd, b: Ymd): boolean {
  if (a.year !== b.year) return a.year < b.year;
  if (a.month !== b.month) return a.month < b.month;
  return a.day < b.day;
}

/** "YYYY-MM-DD" formatter useful for Prisma @db.Date binds. */
export function ymdToIso(ymd: Ymd): string {
  return `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
}

export interface DateRange {
  from: Ymd;
  to: Ymd;
  /** Human label, e.g. "next week", "this weekend". */
  label: string;
}

/**
 * Pull a date *range* out of `text`. Returns null for phrases that can't
 * be resolved to a span. Used by the food-truck location handler to
 * answer "where will you be next week / this weekend?".
 *
 * Week convention: Sunday-start (todayDow 0=Sun..6=Sat). "this week" is
 * today through the upcoming Saturday — past days don't matter to a
 * customer asking now. "next week" is the full Sunday..Saturday after.
 */
export function parseDateRange(
  text: string,
  timezone: string,
  now: Date = new Date(),
): DateRange | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const today = ymdInTz(now, timezone);
  const dow = dayOfWeekYmd(today);

  if (/\bnext\s+weekend\b/.test(t)) {
    // The Saturday/Sunday after the upcoming weekend.
    // If today is Sat → next Sat is +7. If Sun → next Sat is +6.
    // Else (Mon..Fri) → next Sat is (6 - dow) + 7.
    const daysToNextSat = dow === 6 ? 7 : dow === 0 ? 6 : 6 - dow + 7;
    const sat = addDaysYmd(today, daysToNextSat);
    return { from: sat, to: addDaysYmd(sat, 1), label: 'next weekend' };
  }

  if (/\bthis\s+weekend\b/.test(t) || /\bweekend\b/.test(t)) {
    // Upcoming Sat + Sun. If today is Sat or Sun, those are it.
    if (dow === 6) return { from: today, to: addDaysYmd(today, 1), label: 'this weekend' };
    if (dow === 0) return { from: today, to: today, label: 'this weekend' };
    const sat = addDaysYmd(today, 6 - dow);
    return { from: sat, to: addDaysYmd(sat, 1), label: 'this weekend' };
  }

  if (/\bnext\s+week\b/.test(t)) {
    // Next Sunday through the following Saturday.
    const daysToNextSun = dow === 0 ? 7 : 7 - dow;
    const from = addDaysYmd(today, daysToNextSun);
    return { from, to: addDaysYmd(from, 6), label: 'next week' };
  }

  if (/\bthis\s+week\b/.test(t) || /\brest\s+of\s+(the|this)\s+week\b/.test(t)) {
    // Today through this Saturday.
    const daysToSat = 6 - dow;
    return { from: today, to: addDaysYmd(today, daysToSat), label: 'this week' };
  }

  return null;
}
