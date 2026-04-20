/**
 * Pre-flow-engine message handlers.
 *
 * These intercept specific message classes BEFORE the LLM flow engine
 * runs, returning a canned reply. We do this for three reasons:
 *
 *  1. **Legal compliance (A2P 10DLC).** STOP/HELP/START must produce
 *     specific operator-compliant responses — the LLM can't be trusted
 *     to hit the exact copy carriers require, and a drift here means a
 *     carrier can drop the sender. Must also fire in the bot-tester
 *     (testMode) path, which is why this lives in processInboundSms
 *     rather than in the Twilio webhook only.
 *
 *  2. **Safety.** Severe-allergy questions must never get speculative
 *     language ("should be peanut-free"). Force a deterministic refusal
 *     that directs the caller to the tenant's phone.
 *
 *  3. **Integrity.** "Pause orders" from an unauthenticated SMS caller
 *     shouldn't silently accept and then quietly keep taking orders.
 *     Until there's a real owner-auth + pause-state feature, refuse
 *     honestly.
 *
 * Each handler returns `null` if it doesn't apply, or
 * `{ reply, flowType, sideEffects }` for a short-circuit response.
 */

import { FlowType, SideEffect } from '@ringback/shared-types';
import { prisma } from '../db';
import { suppressCaller, isCallerSuppressed } from './consentService';
import { logger } from '../logger';

export interface PreHandlerResult {
  reply: string;
  flowType: FlowType;
  sideEffects: SideEffect[];
  /** When true, processInboundSms should treat this as terminal: write
   *  the conversation, don't persist a draft, and return. */
  terminal?: boolean;
}

export interface PreHandlerContext {
  tenantId: string;
  tenantName: string;
  tenantPhoneNumber: string | null;
  callerPhone: string;
}

// ── STOP / HELP / START (A2P 10DLC compliance) ────────────────────────────

const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|quit|end|opt\s*out)\s*[.!]?\s*$/i;
const HELP_RE = /^\s*(help|info)\s*[.!?]?\s*$/i;
const START_RE = /^\s*(start|unstop|subscribe|yes\s+resubscribe|resume)\s*[.!]?\s*$/i;

export async function handleComplianceKeyword(
  message: string,
  ctx: PreHandlerContext,
): Promise<PreHandlerResult | null> {
  const trimmed = message.trim();

  // STOP → suppress caller + send single confirmation. Carriers require
  // EXACTLY one confirmation and then silence until START.
  if (STOP_RE.test(trimmed)) {
    await suppressCaller(ctx.tenantId, ctx.callerPhone, 'opt_out').catch((err) =>
      logger.warn('Failed to suppress caller on STOP', { err, tenantId: ctx.tenantId }),
    );
    return {
      reply: `You have been unsubscribed from ${ctx.tenantName}. You will not receive any more messages. Reply START to resume.`,
      flowType: FlowType.FALLBACK,
      sideEffects: [],
      terminal: true,
    };
  }

  // START → unsuppress, confirm. Required by operator spec to pair with
  // STOP.
  if (START_RE.test(trimmed)) {
    // Best-effort unsuppress. suppressCaller uses an upsert — the inverse
    // is a delete.
    await prisma.smsSuppression
      .deleteMany({
        where: { tenantId: ctx.tenantId, callerPhone: ctx.callerPhone },
      })
      .catch(() => {});
    await prisma.contact
      .updateMany({
        where: { tenantId: ctx.tenantId, phone: ctx.callerPhone },
        data: { suppressed: false },
      })
      .catch(() => {});
    return {
      reply: `You are re-subscribed to ${ctx.tenantName}. Reply STOP to opt out. Msg & data rates may apply.`,
      flowType: FlowType.FALLBACK,
      sideEffects: [],
      terminal: true,
    };
  }

  // HELP → carrier-compliant info reply with business name + support
  // contact + STOP instructions.
  if (HELP_RE.test(trimmed)) {
    const contactLine = ctx.tenantPhoneNumber
      ? ` Contact: ${ctx.tenantPhoneNumber}.`
      : '';
    return {
      reply: `${ctx.tenantName}: reply STOP to unsubscribe or START to resume.${contactLine} Msg & data rates may apply.`,
      flowType: FlowType.FALLBACK,
      sideEffects: [],
      terminal: true,
    };
  }

  return null;
}

/**
 * When a caller is suppressed, honor their opt-out strictly — do not
 * reply, do not run the flow engine, do not persist a turn. This is the
 * safety net for the bot-tester / any non-webhook caller; the Twilio
 * webhook already enforces suppression at its own layer.
 */
export async function checkSuppression(
  ctx: PreHandlerContext,
): Promise<PreHandlerResult | null> {
  const suppressed = await isCallerSuppressed(ctx.tenantId, ctx.callerPhone).catch(
    () => false,
  );
  if (!suppressed) return null;
  logger.info('Suppressed caller SMS dropped at pre-handler', {
    tenantId: ctx.tenantId,
    callerPhone: ctx.callerPhone,
  });
  return {
    reply: '',
    flowType: FlowType.FALLBACK,
    sideEffects: [],
    terminal: true,
  };
}

// ── Allergy safety ────────────────────────────────────────────────────────

/**
 * Keywords that signal an allergy / severe-safety question. Trip on ANY
 * of these + a restrictive qualifier ("free", "no", "without", "safe",
 * "severe", "reaction", "anaphyla*").
 */
const ALLERGY_TRIGGERS =
  /\b(peanut|tree\s*nut|\bnut\b|nuts|almond|cashew|pistachio|walnut|pecan|gluten|wheat|dairy|milk|lactose|soy|shellfish|shrimp|crab|lobster|fish|egg|sesame|allergy|allergic|allergen|anaphyla\w*)\b/i;
const ALLERGY_QUALIFIERS =
  /\b(free|without|no |severe|react|reaction|safe|intoleran\w*|cross\s*contam\w*)\b/i;

export function handleAllergyIntent(
  message: string,
  ctx: PreHandlerContext,
): PreHandlerResult | null {
  if (!ALLERGY_TRIGGERS.test(message) || !ALLERGY_QUALIFIERS.test(message)) {
    return null;
  }

  // Skip if the message also looks like an order line (e.g. "1 lumpia,
  // no peanuts") — the agent needs to handle the item, and the modifier
  // path will surface the ask. Rough heuristic: contains a digit + a
  // menu-like token.
  if (/\b\d+\s*[xX]?\s*(#|lumpia|rice|fries|siomai|pcs)/.test(message)) {
    return null;
  }

  const phoneLine = ctx.tenantPhoneNumber
    ? `Please call us at ${ctx.tenantPhoneNumber}`
    : 'Please call us directly';
  return {
    reply: `For allergies we can't confirm safety over text — ingredients and cross-contact can vary. ${phoneLine} and staff will review with you before ordering. Thanks for letting us know!`,
    flowType: FlowType.FALLBACK,
    sideEffects: [],
    terminal: true,
  };
}

// ── Operational commands from SMS (pause / resume / etc) ──────────────────

const PAUSE_RE =
  /\b(pause|stop|halt)\s+(orders?|the\s+kitchen|taking\s+orders?|new\s+orders?)\b|\b(kitchen\s+is\s+backed\s+up)\b|\borders?\s+paused?\b/i;
const RESUME_OPS_RE =
  /\b(resume|unpause|restart)\s+(orders?|taking\s+orders?)\b/i;

export function handleOpsCommand(
  message: string,
  _ctx: PreHandlerContext,
): PreHandlerResult | null {
  if (PAUSE_RE.test(message) || RESUME_OPS_RE.test(message)) {
    return {
      // Honest refusal — we can't verify owner identity from an inbound
      // SMS, and we don't have a real "pause" state wired to the order
      // flow. Better to say so than pretend and keep taking orders.
      reply:
        "I can't change kitchen status from SMS — pause/resume is managed in the owner dashboard. If this is urgent, call the owner directly.",
      flowType: FlowType.FALLBACK,
      sideEffects: [],
      terminal: true,
    };
  }
  return null;
}

// ── "I'm here" arrival validation ─────────────────────────────────────────

const ARRIVAL_RE =
  /^\s*(i'?m\s+here|im\s+here|arrived|i\s+arrived|outside|i'?m\s+outside|pulling\s+up|here\s+for\s+(my\s+)?(pickup|order))\b[.!?]?\s*$/i;

export async function handleArrivalIntent(
  message: string,
  ctx: PreHandlerContext,
): Promise<PreHandlerResult | null> {
  if (!ARRIVAL_RE.test(message)) return null;

  // Find the caller's most recent not-completed order.
  const order = await prisma.order
    .findFirst({
      where: {
        tenantId: ctx.tenantId,
        callerPhone: ctx.callerPhone,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        orderNumber: true,
        status: true,
        pickupTime: true,
        estimatedReadyTime: true,
      },
    })
    .catch(() => null);

  if (!order) {
    return {
      reply:
        "I don't see an active order for this number. If you just placed one, give us a minute — otherwise reply with what you'd like to order.",
      flowType: FlowType.FALLBACK,
      sideEffects: [],
      terminal: true,
    };
  }

  const now = Date.now();
  let readyAt = order.estimatedReadyTime?.getTime() ?? null;

  // Order.estimatedReadyTime is set at order placement as "now + prep",
  // so for a "tomorrow at noon" scheduled order placed earlier today
  // it's already in the past or near-now — NOT the true pickup time.
  // If the pickupTime string references a future day, push readyAt out
  // to a reasonable approximation so the customer gets honest wait
  // wording ("about a day to go") instead of "1 hour to go".
  const pickupStr = (order.pickupTime ?? '').toLowerCase();
  const isTomorrow = /\btomorrow\b/.test(pickupStr);
  const isDayOfWeek =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(pickupStr);
  if ((isTomorrow || isDayOfWeek) && (readyAt == null || readyAt - now < 6 * 60 * 60 * 1000)) {
    // Nudge to "at least a day away" — downstream humanWait bucketing
    // will surface this as "about a day to go".
    readyAt = now + 24 * 60 * 60 * 1000;
  }

  // READY → confirmed: hand it over.
  if (order.status === 'READY') {
    return {
      reply: `Thanks! Order #${order.orderNumber} is ready — come to the pickup window and we'll hand it over.`,
      flowType: FlowType.FALLBACK,
      // Notify staff so they know the customer is on-site.
      sideEffects: [
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: `Customer arrived for ${order.orderNumber}`,
            message: `Customer at ${ctx.callerPhone} is on-site for pickup of ${order.orderNumber}.`,
            channel: 'sms',
          },
        },
      ],
      terminal: true,
    };
  }

  // Customer arrived early. Compute how early in minutes if we have an
  // estimated ready time.
  const minutesEarly =
    readyAt != null ? Math.max(0, Math.round((readyAt - now) / 60000)) : null;

  if (minutesEarly != null && minutesEarly > 2) {
    // Humanize the wait. Days > hours > minutes. Round 6 caught us
    // saying "about 1 hour to go" for a 24h-away pickup — the raw
    // hour bucket was overflowing without a day bucket above it.
    let humanWait: string;
    if (minutesEarly >= 60 * 18) {
      const days = Math.round(minutesEarly / (60 * 24));
      humanWait = days <= 1 ? 'about a day' : `${days} days`;
    } else if (minutesEarly >= 60) {
      const hours = Math.round(minutesEarly / 60);
      humanWait = `${hours} hour${hours === 1 ? '' : 's'}`;
    } else {
      humanWait = `${minutesEarly} min`;
    }
    const pickupLabel = order.pickupTime ? ` (scheduled ${order.pickupTime})` : '';
    const prefix = humanWait.startsWith('about') ? humanWait : `about ${humanWait}`;
    return {
      reply: `Thanks! Order #${order.orderNumber} isn't quite ready yet${pickupLabel} — ${prefix} to go. We'll text you as soon as it's up.`,
      flowType: FlowType.FALLBACK,
      sideEffects: [
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: `Early arrival: ${order.orderNumber}`,
            message: `Customer at ${ctx.callerPhone} arrived ~${humanWait} early for ${order.orderNumber}.`,
            channel: 'sms',
          },
        },
      ],
      terminal: true,
    };
  }

  // Within ~2 minutes of ready — acknowledge and notify.
  return {
    reply: `Thanks — we'll have order #${order.orderNumber} out to you any minute.`,
    flowType: FlowType.FALLBACK,
    sideEffects: [
      {
        type: 'NOTIFY_OWNER',
        payload: {
          subject: `Customer arrived for ${order.orderNumber}`,
          message: `Customer at ${ctx.callerPhone} is on-site for pickup of ${order.orderNumber}.`,
          channel: 'sms',
        },
      },
    ],
    terminal: true,
  };
}

// ── Dedicated HOURS handler ───────────────────────────────────────────────

const HOURS_RE =
  /\b(what\s+(time|hours?)|when\s+(are\s+you|do\s+you)\s+(open|close|closed?)|are\s+you\s+open|still\s+open|open\s+now|your\s+hours?|business\s+hours?|what\s+(?:are|r)\s+(?:your\s+)?hours?)\b/i;

export function handleHoursIntent(
  message: string,
  ctx: PreHandlerContext & {
    openNow: boolean;
    todayHoursDisplay: string;
    nextOpenDisplay: string | null;
    weeklyHoursDisplay: string;
    closesAtDisplay: string | null;
  },
): PreHandlerResult | null {
  if (!HOURS_RE.test(message)) return null;

  // todayHoursDisplay is sometimes a redundant phrase like "Closed today"
  // — in that case drop the "Today:" prefix so we don't render "Today:
  // Closed today." (flagged as polish in R6).
  const todayIsClosed = /closed/i.test(ctx.todayHoursDisplay);
  const nowLine = ctx.openNow
    ? `We're open now — today ${ctx.todayHoursDisplay}${
        ctx.closesAtDisplay ? ` (close ${ctx.closesAtDisplay})` : ''
      }.`
    : todayIsClosed
      ? `We're closed today.${
          ctx.nextOpenDisplay ? ` Next open: ${ctx.nextOpenDisplay}.` : ''
        }`
      : `We're currently closed. Today: ${ctx.todayHoursDisplay}.${
          ctx.nextOpenDisplay ? ` Next open: ${ctx.nextOpenDisplay}.` : ''
        }`;

  return {
    reply: `${nowLine} Full week: ${ctx.weeklyHoursDisplay}.`.trim(),
    flowType: FlowType.FALLBACK,
    sideEffects: [],
    terminal: true,
  };
}

// ── Emoji / non-GSM-7 stripper (cost control) ─────────────────────────────

/**
 * Strip emoji + non-GSM-7 characters from outbound replies. Any one
 * such character bumps the whole SMS into UCS-2 encoding, halving the
 * 160-char free-segment size. Cheap to filter defensively — LLM-
 * generated replies regularly leak emoji despite prompt instructions.
 *
 * We intentionally DON'T touch em-dashes ("—") — they're used heavily
 * in existing templates and stripping them would require a bigger
 * template audit. This pass targets actual emoji ranges.
 */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '') // Misc Symbols and Pictographs
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
    .replace(/[\u{1F700}-\u{1F77F}]/gu, '') // Alchemical
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/\u{200D}/gu, '')               // Zero-width joiner
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation selectors
    .replace(/  +/g, ' ')
    .trim();
}
