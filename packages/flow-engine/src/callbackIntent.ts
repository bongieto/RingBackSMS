// "Call me back at 3 PM" detector + parser. Pure functions — no LLM,
// no I/O. The caller-side wiring lives in flowEngineService.ts.
//
// Why a deterministic short-circuit instead of LLM dispatch: callback
// intents are highly templated phrasings ("call me back at 3", "ring
// me tonight", "give me a call in an hour"). Regex catches them
// cheaper, faster, and without the LLM occasionally re-routing them
// into MEETING (where they don't belong — the caller didn't ask for
// an appointment, they asked for a phone call).

import { zonedDateToUtc } from './calendar/localAvailability';
import { ymdInTz, addDaysYmd } from './dateParse';

export interface CallbackParse {
  /** When the caller wants to be rung back, in UTC. */
  whenUtc: Date;
  /** Pre-formatted human label for the SMS confirmation. */
  label: string;
  /** True when we resorted to a default-time guess (e.g. "tonight" → 7pm). */
  approximate: boolean;
}

/** Phrases that signal "ring me back" — anchored, lowercased match. */
const CALLBACK_TRIGGERS = [
  /\bcall\s+me\s+back\b/,
  /\bcall\s+back\b/,
  /\bring\s+me\s+back\b/,
  /\bgive\s+me\s+a\s+call\b/,
  /\bgimme\s+a\s+call\b/,
  /\bcallback\b/,
  /\bring\s+me\s+up\b/,
  /\bcall\s+me\s+(later|tonight|tomorrow|this\s+(afternoon|morning|evening))\b/,
];

export function detectCallbackIntent(text: string): boolean {
  if (!text || text.length < 3) return false;
  const t = text.toLowerCase();
  return CALLBACK_TRIGGERS.some((re) => re.test(t));
}

/** Hour (0–23) right now in tenant TZ. */
function hourInTz(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);
    return Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  } catch {
    return now.getUTCHours();
  }
}

function formatLabel(when: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(when)
    .replace(/,/g, '');
}

/**
 * Try to extract a callback time from `text`. Returns null if the text
 * looks like a callback request but we can't pin a time — caller can
 * fall through to the LLM/flow engine and ask the customer to clarify.
 *
 * Anchored in tenant TZ so "3pm" resolves correctly across DST.
 */
export function parseCallbackTime(
  text: string,
  timezone: string,
  now: Date = new Date(),
): CallbackParse | null {
  const t = text.toLowerCase();
  const today = ymdInTz(now, timezone);
  const nowHour = hourInTz(now, timezone);

  // ── "in N minutes/hours" ───────────────────────────────────────────
  const inDelta = t.match(/\bin\s+(an?|\d+)\s+(minute|min|hour|hr)s?\b/);
  if (inDelta) {
    const nRaw = inDelta[1];
    const n = nRaw === 'a' || nRaw === 'an' ? 1 : Number(nRaw);
    const unit = inDelta[2].startsWith('hour') || inDelta[2].startsWith('hr') ? 60 : 1;
    if (Number.isFinite(n) && n > 0 && n <= 24 * 60) {
      const whenUtc = new Date(now.getTime() + n * unit * 60 * 1000);
      return { whenUtc, label: formatLabel(whenUtc, timezone), approximate: false };
    }
  }

  // ── Day anchor ─────────────────────────────────────────────────────
  let dayYmd = today;
  let saidTomorrow = false;
  if (/\btomorrow\b|\btmrw\b/.test(t)) {
    dayYmd = addDaysYmd(today, 1);
    saidTomorrow = true;
  }
  // "later today" / "this afternoon" / etc. all anchor on today — handled
  // below by the time parsing or the time-of-day default.

  // ── Explicit time: "3pm", "3:30 pm", "at 15:00" ────────────────────
  const explicit = t.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/);
  if (explicit) {
    let hour = Number(explicit[1]);
    const minute = explicit[2] ? Number(explicit[2]) : 0;
    const meridiem = explicit[3]?.replace(/\./g, '') ?? null;

    if (Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute < 60) {
      // Apply meridiem.
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      // Naked "3" is ambiguous — only accept when meridiem is present
      // OR the value is 13–23 (24h notation).
      const isUsableHour =
        meridiem !== null || (hour >= 13 && hour <= 23) || /\bat\s+\d{1,2}:\d{2}\b/.test(t);
      if (isUsableHour) {
        // If user said e.g. "call me at 3pm" and it's already 5pm,
        // assume they mean tomorrow — unless they explicitly said
        // "tomorrow," in which case they already meant tomorrow.
        let chosenDay = dayYmd;
        if (!saidTomorrow && hour < nowHour) {
          chosenDay = addDaysYmd(today, 1);
        }
        const whenUtc = zonedDateToUtc(
          chosenDay.year,
          chosenDay.month,
          chosenDay.day,
          hour,
          minute,
          timezone,
        );
        return {
          whenUtc,
          label: formatLabel(whenUtc, timezone),
          approximate: false,
        };
      }
    }
  }

  // ── Time-of-day defaults ───────────────────────────────────────────
  // Only used when the caller said "this afternoon"/"tonight"/etc.
  // without a specific clock time. Approximates to a sensible hour and
  // marks `approximate: true` so the SMS can phrase it accordingly.
  let defaultHour: number | null = null;
  if (/\b(this\s+)?morning\b/.test(t)) {
    defaultHour = 9;
  } else if (/\b(this\s+)?afternoon\b/.test(t)) {
    defaultHour = 14;
  } else if (/\b(this\s+)?evening\b|\btonight\b/.test(t)) {
    defaultHour = 19;
  } else if (/\blater\s+today\b|\blater\b/.test(t)) {
    defaultHour = 17;
  }

  if (defaultHour !== null) {
    let chosenDay = dayYmd;
    // "This afternoon" with current hour past 5pm → roll to tomorrow.
    if (!saidTomorrow && defaultHour <= nowHour) {
      chosenDay = addDaysYmd(today, 1);
    }
    const whenUtc = zonedDateToUtc(
      chosenDay.year,
      chosenDay.month,
      chosenDay.day,
      defaultHour,
      0,
      timezone,
    );
    return {
      whenUtc,
      label: formatLabel(whenUtc, timezone),
      approximate: true,
    };
  }

  return null;
}
