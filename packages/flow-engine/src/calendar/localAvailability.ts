// Pure availability engine for the built-in calendar. No I/O, no Prisma —
// the flow-engine package stays free of server-side dependencies. The host
// app (apps/web/.../flowEngineService.ts) fetches existing meetings and
// blackouts, then passes them in here.
//
// The algorithm walks the open→close window in (duration + buffer)
// increments and rejects any candidate slot that:
//   - falls before now + leadTimeMinutes
//   - extends past close
//   - overlaps an existing CONFIRMED/PENDING Meeting
//   - overlaps a CalendarBlackout
//
// Returns up to MAX_SLOTS slots as ISO UTC strings, the same shape the
// existing cal.com path emits, so the meeting flow can render either
// uniformly.

export interface DaySchedule {
  open: string;  // "HH:mm"
  close: string; // "HH:mm"
}

export interface ComputeSlotsParams {
  /** The local calendar date the caller asked about. */
  requestedDateLocal: { year: number; month: number; day: number };
  timezone: string;
  durationMinutes: number;
  bufferMinutes: number;
  leadTimeMinutes: number;
  businessSchedule: Record<string, DaySchedule> | null;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  closedDates: string[];
  existingMeetings: Array<{ scheduledAt: Date; durationMinutes: number | null }>;
  blackouts: Array<{ startAt: Date; endAt: Date }>;
  now: Date;
}

export interface AvailableSlot {
  start: string; // ISO UTC
  end: string;   // ISO UTC
}

const MAX_SLOTS = 6;

export function computeAvailableSlots(params: ComputeSlotsParams): AvailableSlot[] {
  const {
    requestedDateLocal,
    timezone,
    durationMinutes,
    bufferMinutes,
    leadTimeMinutes,
    businessSchedule,
    businessHoursStart,
    businessHoursEnd,
    businessDays,
    closedDates,
    existingMeetings,
    blackouts,
    now,
  } = params;

  const ymd = formatYMD(requestedDateLocal);
  if (closedDates.includes(ymd)) return [];

  // Resolve open/close strings for the requested weekday. Per-day schedule
  // wins; flat fields are the legacy fallback.
  const dow = weekdayFor(requestedDateLocal, timezone);
  let openHM: string | null = null;
  let closeHM: string | null = null;

  if (businessSchedule && Object.keys(businessSchedule).length > 0) {
    const sched = businessSchedule[String(dow)];
    if (!sched) return [];
    openHM = sched.open;
    closeHM = sched.close;
  } else {
    if (businessDays.length > 0 && !businessDays.includes(dow)) return [];
    if (!businessHoursStart || !businessHoursEnd) return [];
    openHM = businessHoursStart;
    closeHM = businessHoursEnd;
  }

  const [oh, om] = openHM.split(':').map(Number);
  const [ch, cm] = closeHM.split(':').map(Number);

  const dayStart = zonedDateToUtc(
    requestedDateLocal.year,
    requestedDateLocal.month,
    requestedDateLocal.day,
    oh,
    om,
    timezone,
  );
  const dayEnd = zonedDateToUtc(
    requestedDateLocal.year,
    requestedDateLocal.month,
    requestedDateLocal.day,
    ch,
    cm,
    timezone,
  );

  const stepMs = (durationMinutes + bufferMinutes) * 60_000;
  const durationMs = durationMinutes * 60_000;
  const earliest = new Date(now.getTime() + leadTimeMinutes * 60_000);

  const slots: AvailableSlot[] = [];

  for (
    let cursor = dayStart.getTime();
    cursor + durationMs <= dayEnd.getTime() && slots.length < MAX_SLOTS;
    cursor += stepMs
  ) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor + durationMs);

    if (slotStart < earliest) continue;
    if (overlapsAnyMeeting(slotStart, slotEnd, existingMeetings, durationMinutes)) continue;
    if (overlapsAnyBlackout(slotStart, slotEnd, blackouts)) continue;

    slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
  }

  return slots;
}

function overlapsAnyMeeting(
  slotStart: Date,
  slotEnd: Date,
  meetings: Array<{ scheduledAt: Date; durationMinutes: number | null }>,
  defaultDurationMinutes: number,
): boolean {
  for (const m of meetings) {
    const mStart = m.scheduledAt.getTime();
    const mEnd = mStart + (m.durationMinutes ?? defaultDurationMinutes) * 60_000;
    if (slotStart.getTime() < mEnd && slotEnd.getTime() > mStart) return true;
  }
  return false;
}

function overlapsAnyBlackout(
  slotStart: Date,
  slotEnd: Date,
  blackouts: Array<{ startAt: Date; endAt: Date }>,
): boolean {
  for (const b of blackouts) {
    if (slotStart.getTime() < b.endAt.getTime() && slotEnd.getTime() > b.startAt.getTime()) {
      return true;
    }
  }
  return false;
}

function formatYMD(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function weekdayFor(
  date: { year: number; month: number; day: number },
  timezone: string,
): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  // Build a Date that represents noon UTC on the requested date — using
  // noon avoids tipping into an adjacent local day under any reasonable TZ.
  const asUtc = new Date(Date.UTC(date.year, date.month - 1, date.day, 12, 0));
  const wd = fmt.formatToParts(asUtc).find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

// Build a UTC Date representing wall-clock (year-month-day hour:minute) in
// `timezone`. The trick: assume the components are UTC, sample what that
// instant looks like rendered in `timezone`, take the difference as the
// offset, and apply it inversely. DST-correct because the offset is sampled
// at the requested wall-clock instant.
export function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(asIfUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // `Intl` returns hour 24 for midnight on some Node versions; normalize.
  const renderedHour = get('hour') === 24 ? 0 : get('hour');
  const tzWallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), renderedHour, get('minute'), get('second'));
  const offsetMs = tzWallAsUtc - asIfUtc;
  return new Date(asIfUtc - offsetMs);
}
