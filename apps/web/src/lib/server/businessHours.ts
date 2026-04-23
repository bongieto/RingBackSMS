interface DaySchedule {
  open: string;
  close: string;
}

export interface BusinessHoursConfig {
  businessHoursStart?: string;
  businessHoursEnd?: string;
  businessDays?: number[];
  businessSchedule?: Record<string, DaySchedule> | null;
  closedDates?: string[];
  timezone?: string;
}

/**
 * Check whether the current moment falls within the tenant's configured
 * business hours (time-of-day range) AND business days.
 *
 * Returns `true` (open) when no hours are configured.
 */
export function isWithinBusinessHours(config: BusinessHoursConfig): boolean {
  const { businessHoursStart, businessHoursEnd, businessDays, businessSchedule, closedDates, timezone } = config;

  const tz = timezone ?? 'America/Chicago';
  const now = new Date();

  // Get current local time components in the tenant's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';

  // Check closed dates first
  if (closedDates && closedDates.length > 0) {
    const todayStr = `${year}-${month}-${day}`;
    if (closedDates.includes(todayStr)) {
      return false;
    }
  }

  // Map weekday string to JS day number (0=Sun ... 6=Sat)
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? 0;

  // If per-day schedule exists, use it (overrides flat fields)
  if (businessSchedule && Object.keys(businessSchedule).length > 0) {
    const dayKey = String(dayOfWeek);
    const dayConfig = businessSchedule[dayKey];
    if (!dayConfig) {
      return false; // day not in schedule = closed
    }
    return isTimeInRange(hour, minute, dayConfig.open, dayConfig.close);
  }

  // Fallback to flat fields (backward compat)
  if (!businessHoursStart || !businessHoursEnd) {
    return true; // no hours configured = always open
  }

  // Check business days (if configured)
  if (businessDays && businessDays.length > 0 && !businessDays.includes(dayOfWeek)) {
    return false;
  }

  return isTimeInRange(hour, minute, businessHoursStart, businessHoursEnd);
}

/**
 * Return a human-readable string describing the tenant's business hours.
 * Example: "Mon-Fri 9:00 AM - 5:00 PM"
 */
export function getBusinessHoursDisplay(config: BusinessHoursConfig): string {
  const { businessHoursStart, businessHoursEnd, businessDays, businessSchedule } = config;

  // Per-day schedule display
  if (businessSchedule && Object.keys(businessSchedule).length > 0) {
    // Group days with the same hours
    const hourGroups: Record<string, number[]> = {};
    const scheduledDays = new Set<number>();
    for (const [dayKey, sched] of Object.entries(businessSchedule)) {
      const key = `${sched.open}-${sched.close}`;
      if (!hourGroups[key]) hourGroups[key] = [];
      const dayNum = Number(dayKey);
      hourGroups[key].push(dayNum);
      scheduledDays.add(dayNum);
    }

    const parts: string[] = [];
    for (const [hoursKey, days] of Object.entries(hourGroups)) {
      const [open, close] = hoursKey.split('-');
      const daysLabel = formatDaysLabel(days);
      parts.push(`${daysLabel} ${formatTime(open)} - ${formatTime(close)}`);
    }

    // Explicitly surface closed days so customers don't have to infer
    // them from omission. R6 flagged "Sun 11-7:30, Tue-Sat 11-8:30"
    // as misleading because Mon was silently missing.
    const closedDays: number[] = [];
    for (let d = 0; d < 7; d++) if (!scheduledDays.has(d)) closedDays.push(d);
    if (closedDays.length > 0 && closedDays.length < 7) {
      parts.push(`${formatDaysLabel(closedDays)}: Closed`);
    }

    return parts.join(', ');
  }

  // Flat fields fallback
  if (!businessHoursStart || !businessHoursEnd) {
    return 'Always open';
  }

  const daysLabel = formatDaysLabel(businessDays);
  const startLabel = formatTime(businessHoursStart);
  const endLabel = formatTime(businessHoursEnd);

  return `${daysLabel} ${startLabel} - ${endLabel}`;
}

// ── Internal helpers ───────────────────────────────────────��─────────────────

function isTimeInRange(hour: number, minute: number, start: string, end: string): boolean {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  // Two special cases the previous straight `current >= start && current < end`
  // got wrong:
  //   1. Close at midnight stored as "24:00" or "00:00". Both mean "end of
  //      the day" but the arithmetic turned "00:00" into endMinutes=0, so
  //      at 11 PM we compared 1380 < 0 and reported closed — for shops that
  //      close exactly at midnight, we were always closed.
  //   2. Overnight hours like open 22:00, close 02:00. The naive comparison
  //      required start < end, so a shop open from 10 PM to 2 AM would be
  //      reported closed at every hour.
  // Both shapes normalize to "treat end as a time on the following day":
  // if end <= start we add 24h, and wrap `currentMinutes` forward too
  // if we're in the early-morning window (current < start).
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
    if (currentMinutes < startMinutes) {
      return currentMinutes + 24 * 60 < endMinutes;
    }
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDaysLabel(days?: number[]): string {
  if (!days || days.length === 0 || days.length === 7) {
    return 'Every day';
  }

  const sorted = [...days].sort((a, b) => a - b);

  // Detect contiguous ranges
  const ranges: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      i++;
      end = sorted[i];
    }
    if (end - start >= 2) {
      ranges.push(`${DAY_NAMES[start]}-${DAY_NAMES[end]}`);
    } else if (end !== start) {
      ranges.push(DAY_NAMES[start], DAY_NAMES[end]);
    } else {
      ranges.push(DAY_NAMES[start]);
    }
    i++;
  }

  return ranges.join(', ');
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

/**
 * Return today's hours (in the tenant's timezone) as a single compact
 * string like "11:00 AM - 9:00 PM", or "Closed" if we're not open today.
 * This is narrower than getBusinessHoursDisplay (which returns the whole
 * week) — the AI agent was paraphrasing the weekly display and picking
 * the wrong close time. Feeding just today's hours removes ambiguity.
 */
/**
 * Minutes remaining until today's closing time. Returns null when closed
 * or when no hours are configured (24/7 / always open).
 */
export function getMinutesUntilClose(
  config: BusinessHoursConfig,
  now: Date = new Date(),
): number | null {
  const tz = config.timezone ?? 'America/Chicago';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = weekdayMap[weekdayStr] ?? 0;

  let closeHH: string | undefined;
  if (config.businessSchedule && Object.keys(config.businessSchedule).length > 0) {
    closeHH = config.businessSchedule[String(dow)]?.close;
  } else if (config.businessHoursEnd) {
    closeHH = config.businessHoursEnd;
  }
  if (!closeHH) return null;

  const [ch, cm] = closeHH.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(ch) || Number.isNaN(cm)) return null;

  // Handle close-after-midnight (e.g. open until 1:00 AM the next day).
  let minutesNow = hour * 60 + minute;
  let minutesClose = ch * 60 + cm;
  if (minutesClose <= 0) minutesClose += 24 * 60;
  if (minutesClose < minutesNow - 60) minutesClose += 24 * 60;

  const delta = minutesClose - minutesNow;
  return delta > 0 ? delta : 0;
}

/**
 * Pretty version of today's closing time — "9:00 PM" — for the SMS agent
 * prompt. Returns null when closed today / no hours configured.
 */
export function getClosesAtDisplay(
  config: BusinessHoursConfig,
  now: Date = new Date(),
): string | null {
  const tz = config.timezone ?? 'America/Chicago';
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const weekdayStr = fmt.formatToParts(now).find((p) => p.type === 'weekday')?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = weekdayMap[weekdayStr] ?? 0;
  let closeHH: string | undefined;
  if (config.businessSchedule && Object.keys(config.businessSchedule).length > 0) {
    closeHH = config.businessSchedule[String(dow)]?.close;
  } else if (config.businessHoursEnd) {
    closeHH = config.businessHoursEnd;
  }
  if (!closeHH) return null;
  return formatTime(closeHH);
}

export function getTodayHoursDisplay(
  config: BusinessHoursConfig,
  now: Date = new Date(),
): string {
  const tz = config.timezone ?? 'America/Chicago';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = weekdayMap[get('weekday')] ?? 0;
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;

  // Closed for a specific calendar date
  if (config.closedDates?.includes(ymd)) return 'Closed today';

  const { businessSchedule, businessHoursStart, businessHoursEnd, businessDays } = config;

  // Per-day schedule wins when present
  if (businessSchedule && Object.keys(businessSchedule).length > 0) {
    const today = businessSchedule[String(dow)];
    if (!today) return 'Closed today';
    return `${formatTime(today.open)} - ${formatTime(today.close)}`;
  }

  // Flat-fields fallback
  if (!businessHoursStart || !businessHoursEnd) return 'Always open';
  if (businessDays && businessDays.length > 0 && !businessDays.includes(dow)) {
    return 'Closed today';
  }
  return `${formatTime(businessHoursStart)} - ${formatTime(businessHoursEnd)}`;
}

/**
 * Raw "HH:mm" open + close for TODAY in the tenant's timezone (plus the
 * tenant-local wall-clock hour/minute). Used by deterministic validators
 * that need concrete numeric bounds, not the human-readable pretty strings
 * returned by getTodayHoursDisplay / getClosesAtDisplay.
 *
 * Returns `{ open: null, close: null }` when the tenant is closed today
 * (closedDates hit, weekday not in businessDays, no schedule for this day).
 */
export function getTodayHoursRaw(
  config: BusinessHoursConfig,
  now: Date = new Date(),
): { open: string | null; close: string | null; nowHour: number; nowMinute: number } {
  const tz = config.timezone ?? 'America/Chicago';
  const parts = localDateParts(now, tz);
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;

  if (config.closedDates?.includes(ymd)) {
    return { open: null, close: null, nowHour: parts.hour, nowMinute: parts.minute };
  }

  const { businessSchedule, businessHoursStart, businessHoursEnd, businessDays } = config;
  if (businessSchedule && Object.keys(businessSchedule).length > 0) {
    const today = businessSchedule[String(parts.dayOfWeek)];
    if (!today) return { open: null, close: null, nowHour: parts.hour, nowMinute: parts.minute };
    return { open: today.open, close: today.close, nowHour: parts.hour, nowMinute: parts.minute };
  }

  if (!businessHoursStart || !businessHoursEnd) {
    return { open: null, close: null, nowHour: parts.hour, nowMinute: parts.minute };
  }
  if (businessDays && businessDays.length > 0 && !businessDays.includes(parts.dayOfWeek)) {
    return { open: null, close: null, nowHour: parts.hour, nowMinute: parts.minute };
  }
  return {
    open: businessHoursStart,
    close: businessHoursEnd,
    nowHour: parts.hour,
    nowMinute: parts.minute,
  };
}

/**
 * Return a human-readable description of the tenant's next open slot
 * starting from `now` (in the tenant's timezone). Walks forward up to 7
 * days honoring closedDates, businessSchedule and businessDays. Returns
 * strings like "Sun 11:00 AM" or "tomorrow 11:00 AM" or null if no hours
 * are configured.
 */
export function getNextOpenDisplay(
  config: BusinessHoursConfig,
  now: Date = new Date(),
): string | null {
  const tz = config.timezone ?? 'America/Chicago';

  const {
    businessHoursStart,
    businessHoursEnd,
    businessDays,
    businessSchedule,
    closedDates,
  } = config;

  const hasPerDay = !!(businessSchedule && Object.keys(businessSchedule).length > 0);
  const hasFlat = !!(businessHoursStart && businessHoursEnd);
  if (!hasPerDay && !hasFlat) return null;

  const todayParts = localDateParts(now, tz);
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let offset = 0; offset < 8; offset++) {
    // Compute the candidate calendar date (YYYY-MM-DD) in the tenant's tz.
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = localDateParts(candidate, tz);
    const ymd = `${parts.year}-${parts.month}-${parts.day}`;

    // Skip closed dates.
    if (closedDates?.includes(ymd)) continue;

    // Determine the open time string for this weekday, or skip.
    let openTime: string | null = null;
    if (hasPerDay) {
      const daySched = businessSchedule![String(parts.dayOfWeek)];
      if (daySched) openTime = daySched.open;
    } else if (hasFlat) {
      if (
        !businessDays ||
        businessDays.length === 0 ||
        businessDays.includes(parts.dayOfWeek)
      ) {
        openTime = businessHoursStart!;
      }
    }
    if (!openTime) continue;

    // If this is today, skip when we're already past close.
    if (offset === 0) {
      const close =
        hasPerDay
          ? businessSchedule![String(parts.dayOfWeek)]?.close
          : businessHoursEnd;
      if (!close) continue;
      if (isTimeInRange(todayParts.hour, todayParts.minute, openTime, close)) {
        // We're already open right now — caller shouldn't normally ask in
        // this case, but return today's open time for completeness.
        return `today ${formatTime(openTime)}`;
      }
      const nowMinutes = todayParts.hour * 60 + todayParts.minute;
      const [ch, cm] = close.split(':').map(Number);
      const closeMinutes = ch * 60 + cm;
      if (nowMinutes >= closeMinutes) continue;
      const [oh, om] = openTime.split(':').map(Number);
      const openMinutes = oh * 60 + om;
      if (nowMinutes < openMinutes) {
        // Before today's open
        return `today ${formatTime(openTime)}`;
      }
      continue;
    }

    // Future day
    const label = offset === 1 ? 'tomorrow' : DAY_LABELS[parts.dayOfWeek];
    return `${label} ${formatTime(openTime)}`;
  }

  return null;
}

function localDateParts(
  date: Date,
  tz: string,
): { year: string; month: string; day: string; hour: number; minute: number; dayOfWeek: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: Number(get('hour') || '0'),
    minute: Number(get('minute') || '0'),
    dayOfWeek: weekdayMap[get('weekday')] ?? 0,
  };
}

// ── Greeting template substitution ───────────────────────────────────────────

/**
 * Placeholders that operators can drop into voice + SMS greeting copy. Keeps
 * a SINGLE greeting string correct across every "we're closed" scenario —
 * tonight, a regular day off, a holiday in closedDates, etc. — without
 * making operators maintain a matrix of greetings.
 *
 * Supported placeholders (case-insensitive, with or without surrounding
 * whitespace):
 *   {business_name}   — tenant.name
 *   {next_open}       — getNextOpenDisplay() result
 *   {today_hours}     — getTodayHoursDisplay() result
 *   {closes_at}       — getClosesAtDisplay() result
 *
 * Any placeholder whose value resolves to null/empty is rendered as an
 * empty string and the surrounding punctuation is left as-is. That's the
 * right default for optional placeholders (e.g. {closes_at} is null after
 * close time — the sentence still makes sense without it).
 */
export interface GreetingTemplateVars {
  business_name?: string | null;
  next_open?: string | null;
  today_hours?: string | null;
  closes_at?: string | null;
}

export function renderGreetingTemplate(
  template: string | null | undefined,
  vars: GreetingTemplateVars,
): string {
  if (!template) return '';
  // Match both `{key}` and `{ key }`. Case-insensitive on the key name so
  // operators can write `{Next_Open}` without getting a literal.
  return template.replace(/\{\s*([a-z_]+)\s*\}/gi, (match, rawKey: string) => {
    const key = rawKey.toLowerCase() as keyof GreetingTemplateVars;
    const value = vars[key];
    if (value == null || value === '') return '';
    return String(value);
  });
}

/**
 * Build the full var bag for a tenant's current moment. Centralizes the
 * getNextOpenDisplay / getTodayHoursDisplay / getClosesAtDisplay calls so
 * callers (voice webhook, SMS after-hours reply) don't duplicate the
 * wiring.
 */
export function buildGreetingVars(
  businessName: string,
  config: BusinessHoursConfig,
  now: Date = new Date(),
): GreetingTemplateVars {
  return {
    business_name: businessName,
    next_open: getNextOpenDisplay(config, now),
    today_hours: getTodayHoursDisplay(config, now),
    closes_at: getClosesAtDisplay(config, now),
  };
}
