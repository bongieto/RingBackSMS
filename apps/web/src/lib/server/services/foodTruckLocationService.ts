import { prisma } from '../db';
import {
  parseDateOnly,
  parseDateRange,
  ymdInTz,
  formatPrettyDate,
  ymdToIso,
  type Ymd,
} from '@ringback/flow-engine';

/**
 * Match SMS bodies asking "where are you?" / "where will you be tomorrow?".
 * Anchored so it doesn't fire on phrases like "where's my order".
 *
 * Two layers of acceptance:
 *  1. Bare keyword forms (where / location / address / find you).
 *  2. "where (is the truck|are you|s the truck|you)" + optional trailing
 *     date phrase (today, tomorrow, this Friday, april 30, the 3rd).
 */
const TRAILING_QUALIFIERS = /(\s+(today|tonight|right\s+now|now|located|parked|currently|set\s*up|at))*/.source;
const WEEKDAY = String.raw`(sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)`;
const MONTH = String.raw`(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)`;
const DATE_PHRASE = String.raw`(today|tonight|tomorrow|tmrw|(this|next)\s+(week|weekend|${WEEKDAY})|${WEEKDAY}|${MONTH}\s+\d{1,2}(st|nd|rd|th)?|\d{1,2}\s*[\/-]\s*\d{1,2}|the\s+\d{1,2}(st|nd|rd|th)?|weekend)`;

export function matchesLocationKeyword(msg: string): boolean {
  const lower = msg.toLowerCase().trim().replace(/[!.]+$/, '');
  if (/^(where|location|address)\??$/.test(lower)) return true;
  if (new RegExp(`^where\\s+are\\s+(you|y'?all|u)${TRAILING_QUALIFIERS}\\??$`).test(lower)) return true;
  if (new RegExp(`^where\\s*('?s|s)?\\s+(the\\s+truck|y'?all|you)${TRAILING_QUALIFIERS}\\??$`).test(lower)) return true;
  if (/^(find|locate)\s+you\??$/.test(lower)) return true;
  if (new RegExp(`^where\\s+is\\s+the\\s+truck${TRAILING_QUALIFIERS}\\??$`).test(lower)) return true;
  // Trailing date phrase covering single dates and ranges:
  // "where will you be tomorrow", "where are you on april 30",
  // "where is the truck next week", "where will you be this weekend".
  if (new RegExp(`^(where|when|will\\s+you\\s+be)\\b.*\\b(on\\s+)?${DATE_PHRASE}\\??$`).test(lower)) return true;
  // "what(?:'s)? your schedule" / "what days are you out" — generic schedule asks.
  if (/^what(?:'s|s|\s+is)?\s+your\s+(schedule|locations?|stops?)\b/.test(lower)) return true;
  return false;
}

/**
 * Return one or more stops for the parsed (or default-today) target date.
 *
 * Returns null in two cases that the caller should treat as fall-through:
 *  - target is today AND no stops are scheduled (let FALLBACK use the
 *    tenant's businessAddress instead).
 *  - we couldn't connect to the database (don't block the flow engine).
 *
 * Returns a non-null reply for non-today queries with no stops, since
 * the customer asked specifically about a different day and needs a
 * concrete answer ("we don't have a stop scheduled for ...").
 */
export async function buildLocationReply(
  tenantId: string,
  inboundMessage: string,
  now: Date,
  timezone: string,
): Promise<string | null> {
  const today = ymdInTz(now, timezone);

  // Range queries first (next week, this weekend, etc.) — they take
  // precedence so "where is the truck next week" doesn't get parsed
  // as a single weekday.
  const range = parseDateRange(inboundMessage, timezone, now);
  if (range) {
    const stops = await prisma.foodTruckStop.findMany({
      where: {
        tenantId,
        isActive: true,
        stopDate: {
          gte: new Date(ymdToIso(range.from) + 'T00:00:00Z'),
          lte: new Date(ymdToIso(range.to) + 'T00:00:00Z'),
        },
      },
      orderBy: [{ stopDate: 'asc' }, { openTime: 'asc' }],
    });
    if (stops.length === 0) {
      return `We don't have any stops scheduled for ${range.label}. Reply WHERE for today's spot.`;
    }
    const lines: string[] = [`📍 Schedule for ${range.label}:`];
    for (const stop of stops) {
      const dateLabel = formatPrettyDate(
        {
          year: stop.stopDate.getUTCFullYear(),
          month: stop.stopDate.getUTCMonth() + 1,
          day: stop.stopDate.getUTCDate(),
        },
        timezone,
      );
      const where = stop.locationName ? `${stop.locationName} (${stop.address})` : stop.address;
      lines.push(`${dateLabel}: ${where}, ${stop.openTime}–${stop.closeTime}`);
    }
    return lines.join('\n');
  }

  // Single-date lookup.
  const parsed = parseDateOnly(inboundMessage, timezone, now);
  const target: Ymd = parsed?.ymd ?? today;
  const isToday = target.year === today.year && target.month === today.month && target.day === today.day;

  const stops = await prisma.foodTruckStop.findMany({
    where: {
      tenantId,
      isActive: true,
      stopDate: new Date(ymdToIso(target) + 'T00:00:00Z'),
    },
    orderBy: { openTime: 'asc' },
  });

  if (stops.length === 0) {
    if (isToday) return null; // let the FALLBACK / businessAddress path handle it
    const label = parsed?.label ?? formatPrettyDate(target, timezone);
    return `We don't have a stop scheduled for ${label}. Reply WHERE for today's spot.`;
  }

  const dateLabel = isToday ? 'today' : (parsed?.label ?? formatPrettyDate(target, timezone));
  const lines: string[] = [];
  for (const stop of stops) {
    const header = stop.locationName
      ? `📍 ${stop.locationName}`
      : `📍 ${dateLabel}`;
    lines.push(header);
    lines.push(stop.address);
    lines.push(`Open ${stop.openTime}–${stop.closeTime}`);
    if (stop.note?.trim()) lines.push(stop.note.trim());
    lines.push(''); // blank separator between multiple stops
  }
  // Drop the trailing blank.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}
