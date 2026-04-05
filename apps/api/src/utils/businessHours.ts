export interface BusinessHoursConfig {
  businessHoursStart?: string;
  businessHoursEnd?: string;
  businessDays?: number[];
  timezone?: string;
}

/**
 * Check whether the current moment falls within the tenant's configured
 * business hours (time-of-day range) AND business days.
 *
 * Returns `true` (open) when no hours are configured.
 */
export function isWithinBusinessHours(config: BusinessHoursConfig): boolean {
  const { businessHoursStart, businessHoursEnd, businessDays, timezone } = config;

  // If no hours configured, treat as always open
  if (!businessHoursStart || !businessHoursEnd) {
    return true;
  }

  const tz = timezone ?? 'America/Chicago';
  const now = new Date();

  // Get current local time components in the tenant's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';

  // Map weekday string to JS day number (0=Sun ... 6=Sat)
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? 0;

  // Check business days (if configured)
  if (businessDays && businessDays.length > 0 && !businessDays.includes(dayOfWeek)) {
    return false;
  }

  // Parse start/end times
  const [startH, startM] = businessHoursStart.split(':').map(Number);
  const [endH, endM] = businessHoursEnd.split(':').map(Number);

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Return a human-readable string describing the tenant's business hours.
 * Example: "Mon-Fri 9:00 AM - 5:00 PM"
 */
export function getBusinessHoursDisplay(config: BusinessHoursConfig): string {
  const { businessHoursStart, businessHoursEnd, businessDays } = config;

  if (!businessHoursStart || !businessHoursEnd) {
    return 'Always open';
  }

  const daysLabel = formatDaysLabel(businessDays);
  const startLabel = formatTime(businessHoursStart);
  const endLabel = formatTime(businessHoursEnd);

  return `${daysLabel} ${startLabel} - ${endLabel}`;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

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
