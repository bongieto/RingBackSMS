import { computeAvailableSlots, zonedDateToUtc } from '../../calendar/localAvailability';

const TZ = 'America/Chicago';

// Friday April 24, 2026, 8:00 AM Central
const FRI_APR_24_8AM = zonedDateToUtc(2026, 4, 24, 8, 0, TZ);

const BASE = {
  requestedDateLocal: { year: 2026, month: 4, day: 24 }, // Friday
  timezone: TZ,
  durationMinutes: 30,
  bufferMinutes: 15,
  leadTimeMinutes: 60,
  businessSchedule: null,
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessDays: [1, 2, 3, 4, 5], // Mon-Fri
  closedDates: [],
  existingMeetings: [],
  blackouts: [],
  now: FRI_APR_24_8AM,
};

describe('computeAvailableSlots', () => {
  it('returns empty when the requested date is in closedDates', () => {
    const result = computeAvailableSlots({
      ...BASE,
      closedDates: ['2026-04-24'],
    });
    expect(result).toEqual([]);
  });

  it('returns empty when the requested weekday is not a business day', () => {
    // Sunday April 26, 2026
    const result = computeAvailableSlots({
      ...BASE,
      requestedDateLocal: { year: 2026, month: 4, day: 26 },
    });
    expect(result).toEqual([]);
  });

  it('returns empty when per-day schedule omits the requested weekday', () => {
    const result = computeAvailableSlots({
      ...BASE,
      businessSchedule: { '1': { open: '09:00', close: '17:00' } }, // Mon only
    });
    expect(result).toEqual([]);
  });

  it('honors per-day schedule over flat fields', () => {
    const result = computeAvailableSlots({
      ...BASE,
      businessSchedule: { '5': { open: '13:00', close: '15:00' } }, // Fri 1-3pm
    });
    // 1pm-3pm with 30min slots + 15min buffer = slots at 13:00, 13:45, 14:30
    // 14:30 + 30 = 15:00 (fits exactly).
    expect(result).toHaveLength(3);
    expect(formatLocal(result[0].start)).toBe('13:00');
    expect(formatLocal(result[1].start)).toBe('13:45');
    expect(formatLocal(result[2].start)).toBe('14:30');
  });

  it('filters slots before now + leadTime', () => {
    // It's 8:00 AM. Lead time 60 min → earliest slot is 9:00 AM.
    const result = computeAvailableSlots(BASE);
    // First slot is 9:00 AM (matches lead time exactly), not before.
    expect(formatLocal(result[0].start)).toBe('09:00');
  });

  it('skips slots earlier than lead time even when business is already open', () => {
    // Now is 11:30 AM Friday. Lead time 60 min → earliest acceptable slot
    // is 12:30 PM. Slots tick on a 45-min cadence (30 dur + 15 buf) from
    // 09:00, so the first slot ≥ 12:30 is 12:45.
    const now = zonedDateToUtc(2026, 4, 24, 11, 30, TZ);
    const result = computeAvailableSlots({ ...BASE, now });
    expect(formatLocal(result[0].start)).toBe('12:45');
  });

  it('excludes slots that overlap an existing meeting', () => {
    // Block 10:00-10:30
    const result = computeAvailableSlots({
      ...BASE,
      existingMeetings: [
        { scheduledAt: zonedDateToUtc(2026, 4, 24, 10, 0, TZ), durationMinutes: 30 },
      ],
    });
    const startsLocal = result.map((s) => formatLocal(s.start));
    expect(startsLocal).not.toContain('10:00');
    // The 9:45 candidate ends at 10:15 → overlap with 10:00-10:30 → excluded too.
    expect(startsLocal).not.toContain('09:45');
    // 09:00 ends at 09:30 → no overlap → included.
    expect(startsLocal).toContain('09:00');
  });

  it('excludes slots that overlap a blackout window', () => {
    const result = computeAvailableSlots({
      ...BASE,
      blackouts: [
        {
          startAt: zonedDateToUtc(2026, 4, 24, 12, 0, TZ),
          endAt: zonedDateToUtc(2026, 4, 24, 14, 0, TZ),
        },
      ],
    });
    const startsLocal = result.map((s) => formatLocal(s.start));
    // Slots inside [12:00, 14:00) must be absent.
    for (const s of startsLocal) {
      const minutes = parseHM(s);
      expect(minutes < 12 * 60 || minutes >= 14 * 60).toBe(true);
    }
  });

  it('does not return a slot that would extend past close', () => {
    // 9-17 with 30min duration → last valid start is 16:30 (ends 17:00).
    const result = computeAvailableSlots(BASE);
    const lastStart = formatLocal(result[result.length - 1].start);
    expect(parseHM(lastStart) + 30).toBeLessThanOrEqual(17 * 60);
  });

  it('caps the result at MAX_SLOTS=6', () => {
    const result = computeAvailableSlots(BASE);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('treats a meeting with null durationMinutes as default duration', () => {
    // Existing meeting at 10:00 with null duration → assume 30min (default).
    const result = computeAvailableSlots({
      ...BASE,
      existingMeetings: [
        { scheduledAt: zonedDateToUtc(2026, 4, 24, 10, 0, TZ), durationMinutes: null },
      ],
    });
    const startsLocal = result.map((s) => formatLocal(s.start));
    expect(startsLocal).not.toContain('10:00');
  });
});

describe('zonedDateToUtc', () => {
  it('returns a UTC instant whose local time matches the requested wall-clock', () => {
    const utc = zonedDateToUtc(2026, 4, 24, 9, 0, TZ);
    const local = formatLocal(utc.toISOString());
    expect(local).toBe('09:00');
  });

  it('handles DST transition correctly', () => {
    // March 8, 2026, 9 AM in Chicago — already in CDT
    const cdt = zonedDateToUtc(2026, 3, 8, 9, 0, TZ);
    expect(formatLocal(cdt.toISOString())).toBe('09:00');
    // Feb 1, 2026, 9 AM in Chicago — CST
    const cst = zonedDateToUtc(2026, 2, 1, 9, 0, TZ);
    expect(formatLocal(cst.toISOString())).toBe('09:00');
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
