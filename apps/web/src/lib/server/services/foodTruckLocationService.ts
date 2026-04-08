import { prisma } from '../db';

/**
 * Match SMS bodies asking "where are you?" — anchored so it doesn't fire on
 * phrases like "where's my order".
 */
export function matchesLocationKeyword(msg: string): boolean {
  const lower = msg.toLowerCase().trim().replace(/[!.]+$/, '');
  if (/^(where|location|address)\??$/.test(lower)) return true;
  if (/^where\s+are\s+(you|y'?all|u)\??$/.test(lower)) return true;
  if (/^where\s*('?s|s)?\s+(the\s+truck|y'?all|you)\??$/.test(lower)) return true;
  if (/^(find|locate)\s+you\??$/.test(lower)) return true;
  if (/^where\s+is\s+the\s+truck\??$/.test(lower)) return true;
  return false;
}

/** Return 0..6 day-of-week in the tenant's timezone (0 = Sunday). */
function dayOfWeekInTz(now: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone });
  const short = formatter.format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? now.getDay();
}

export async function buildLocationReply(
  tenantId: string,
  now: Date,
  timezone: string
): Promise<string | null> {
  const dow = dayOfWeekInTz(now, timezone);
  const row = await prisma.foodTruckSchedule.findUnique({
    where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: dow } },
  });
  if (!row || !row.isActive) return null;

  const header = row.locationName ? `📍 ${row.locationName}` : '📍 Today';
  const lines = [header, row.address, `Open until ${row.closeTime}`];
  if (row.note?.trim()) lines.push(row.note.trim());
  return lines.join('\n');
}
