/**
 * Validate a customer-supplied pickup phrase against today's business hours.
 *
 * The order agent stores `draft.pickupTime` as the raw customer phrase
 * ("6pm", "tonight", "tomorrow at noon") and never resolves it to a Date.
 * That's fine for the kitchen ticket, but it means "midnight" at 8 PM
 * on a 9 PM-close day would sail through the confirm gate unchallenged.
 *
 * This module narrows that gap without overreaching. It only refuses a
 * phrase when we're CONFIDENT it's outside hours — an explicit clock
 * time (e.g. "11:30 pm", "midnight") on today. Anything that mentions a
 * future day or a relative offset we can't pin down is let through; the
 * existing "future day" regex in orderAgent handles scheduled orders.
 *
 * Kept deterministic and pure so it unit-tests easily and has no
 * dependency on businessHours.ts (which lives in apps/web and also has
 * a stale apps/api copy). Callers pass in the time bounds directly.
 */

export interface PickupValidationInput {
  /** Raw pickup phrase the customer sent, or the LLM's canonicalization. */
  phrase: string;
  /** Tenant's local hour+minute RIGHT NOW, 0-23 and 0-59. */
  nowHour: number;
  nowMinute: number;
  /** Today's open time as "HH:mm" (24-hour). Null = closed today. */
  todayOpen: string | null;
  /** Today's close time as "HH:mm" (24-hour). Null = closed today. */
  todayClose: string | null;
  /**
   * Operator-configured "last orders" grace window. Customers can't
   * request pickup in the final N minutes of service so the kitchen
   * isn't racing the clock. Industry default 15 min.
   */
  lastOrdersGraceMinutes?: number;
}

export type PickupValidationResult =
  | { ok: true; resolvedMinutes?: number }
  | { ok: false; reason: PickupRejectReason };

export type PickupRejectReason =
  | 'closed_today'
  | 'after_close'
  | 'before_open'
  | 'inside_last_orders_grace';

/**
 * Today-anchored validation. Return shapes documented above.
 *
 * False positives would bite harder than false negatives — a spurious
 * refusal makes a legitimate customer retype their order — so the
 * default for any phrase we can't confidently resolve is `ok: true`.
 */
export function validatePickupPhrase(
  input: PickupValidationInput,
): PickupValidationResult {
  const grace = input.lastOrdersGraceMinutes ?? 15;
  const phraseLower = input.phrase.trim().toLowerCase();
  if (!phraseLower) return { ok: true };

  // Mentions a future day explicitly? We don't attempt to resolve
  // across day boundaries — "tomorrow at 6pm" is handled elsewhere.
  if (/\btomorrow\b|\bnext\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat|sun)(?:day)?\b/.test(phraseLower)) {
    return { ok: true };
  }

  // "asap" / "now" — depends on whether we're open at this moment
  // and whether we're inside the last-orders grace window.
  if (/^(asap|now|right now|immediately|whenever|any ?time|as soon as possible|soon)\b/.test(phraseLower)) {
    if (!input.todayOpen || !input.todayClose) {
      return { ok: false, reason: 'closed_today' };
    }
    const closeMinutes = parseHHmm(input.todayClose);
    if (closeMinutes == null) return { ok: true };
    const nowMinutes = input.nowHour * 60 + input.nowMinute;
    if (nowMinutes >= closeMinutes) return { ok: false, reason: 'after_close' };
    if (closeMinutes - nowMinutes <= grace) {
      return { ok: false, reason: 'inside_last_orders_grace' };
    }
    return { ok: true };
  }

  // Otherwise we need an explicit clock time to validate. Try in order:
  //   1. "HH:mm" (24-hour)
  //   2. "H am/pm" / "H:MM am/pm"
  //   3. "noon" / "midnight"
  const resolved = resolveClockPhrase(phraseLower);
  if (resolved == null) {
    // No concrete time we can pin down. Let the LLM / operator adjudicate.
    return { ok: true };
  }

  // No hours configured today = can't accept
  if (!input.todayOpen || !input.todayClose) {
    return { ok: false, reason: 'closed_today' };
  }

  const openMinutes = parseHHmm(input.todayOpen);
  const closeMinutes = parseHHmm(input.todayClose);
  if (openMinutes == null || closeMinutes == null) return { ok: true };

  // Handle overnight close (close <= open means next-day close).
  const normalizedClose =
    closeMinutes <= openMinutes ? closeMinutes + 24 * 60 : closeMinutes;
  // When close is past midnight, a phrase like "1am" refers to after-close
  // time-of-day on the *next* calendar moment but still within today's
  // operating window. Normalize resolved too when appropriate.
  const normalizedResolved =
    resolved < openMinutes && normalizedClose > 24 * 60
      ? resolved + 24 * 60
      : resolved;

  if (normalizedResolved < openMinutes) {
    return { ok: false, reason: 'before_open' };
  }
  if (normalizedResolved >= normalizedClose) {
    return { ok: false, reason: 'after_close' };
  }
  if (normalizedClose - normalizedResolved <= grace) {
    return { ok: false, reason: 'inside_last_orders_grace' };
  }
  return { ok: true, resolvedMinutes: normalizedResolved };
}

/**
 * Pull a concrete "minutes since midnight" out of a phrase, or return null
 * if we can't. Only matches phrases that read as today's time — "6pm",
 * "18:30", "noon", "midnight", "at 7:15 pm". Intentionally does NOT
 * match relative phrases ("in 30 minutes") — the caller already treated
 * those as ambiguous.
 */
function resolveClockPhrase(phraseLower: string): number | null {
  if (/\bnoon\b/.test(phraseLower)) return 12 * 60;
  // "midnight" is conventionally end-of-day for a pickup context.
  // We represent it as 24*60 so range checks treat it as >= close
  // for any normal close-time.
  if (/\bmidnight\b/.test(phraseLower)) return 24 * 60;

  // 12-hour clock with am/pm marker.
  const ampm = phraseLower.match(
    /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/,
  );
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const isPm = /p/.test(ampm[3]);
    if (h === 12) h = 0; // 12am = 0, 12pm = 12 (add 12 below if pm)
    if (isPm) h += 12;
    return h * 60 + m;
  }

  // 24-hour "HH:mm". Reject "1:30" with no am/pm to avoid interpreting
  // chit-chat — only match zero-padded or explicitly 24-h bounded forms.
  const h24 = phraseLower.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (h24) {
    return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
  }

  return null;
}

function parseHHmm(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  if (h < 0 || h > 24 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}
