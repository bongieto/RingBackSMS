import { FlowInput, FlowOutput, FlowStep } from '../types';
import { FlowType, CallerState, MeetingDraft } from '@ringback/shared-types';
import { pushDecision } from '../decisions';
import { zonedDateToUtc } from '../calendar/localAvailability';

// ── Date parsing (MVP — keyword-based, no LLM) ────────────────────────────

/**
 * Resolve a naive natural-language date expression in the tenant's timezone
 * to a UTC day range. The earlier implementation was timezone-naive — it
 * built Dates with `new Date(y, m, d)` which uses the SERVER's local time,
 * not the tenant's. On UTC servers (Vercel) that produced labels off by a
 * day for callers in CST/CDT after ~7 PM local. Returns null when we can't
 * parse, so the caller can re-prompt.
 *
 * Tolerates trailing time text: "tomorrow at 10am", "Friday at 2 PM",
 * "4/15 morning" all match. We don't *consume* the time today — the slot
 * walker still offers every open slot — but the date itself parses cleanly.
 */
export function parseDateExpression(
  input: string,
  timezone: string,
  now: Date = new Date(),
): {
  startUtc: Date;
  endUtc: Date;
  label: string;
  requestedDateLocal: { year: number; month: number; day: number };
  findEarliest?: boolean;
} | null {
  const t = input.trim().toLowerCase();
  const today = todayInTz(now, timezone);
  let target: { year: number; month: number; day: number } | null = null;
  let findEarliest = false;

  // "earliest" / "soonest" / "asap" / "first available" — caller doesn't
  // care about a specific date, just the next open slot. Anchor at today
  // and let the handler walk forward up to meetingMaxDaysOut days.
  if (
    /\bearliest\b|\bsoonest\b|\basap\b|\b(first|next)\s+available\b|\bany ?time\b/.test(t)
  ) {
    target = today;
    findEarliest = true;
  } else if (/\btoday\b|\btdy\b/.test(t)) {
    target = today;
  } else if (/\btomorrow\b|\btmrw\b|\btommor?ow\b/.test(t)) {
    target = addDays(today, 1);
  } else {
    const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const match = t.match(/\b(next\s+)?(sun|mon|tue|wed|thu|fri|sat)/);
    if (match) {
      const wantedDay = weekdays.indexOf(match[2]);
      const currentDay = weekdayIndex(today, timezone);
      let delta = (wantedDay - currentDay + 7) % 7;
      if (delta === 0) delta = 7; // "monday" said on monday → next monday
      if (match[1] && delta < 7) delta += 7;
      target = addDays(today, delta);
    } else {
      // Worded month + day: "May 1", "May 1st", "January 15", "next Jan 15".
      // Try this BEFORE numeric MM/DD because callers say "May 1" much more
      // naturally than "5/1" — and a bare "1" wouldn't match the numeric
      // regex anyway (requires a separator).
      const monthWordMatch = t.match(
        /\b(?:next\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/,
      );
      if (monthWordMatch) {
        const monthIdx: Record<string, number> = {
          jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
          jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        };
        const mm = monthIdx[monthWordMatch[1].slice(0, 3)];
        const dd = Number(monthWordMatch[2]);
        if (mm && dd >= 1 && dd <= 31) {
          // If the resolved date has already passed this year, assume the
          // caller means next year. ("May 1" said in June → next May.)
          let yyyy = today.year;
          const currentMmDd = today.month * 100 + today.day;
          if (mm * 100 + dd < currentMmDd) yyyy += 1;
          target = { year: yyyy, month: mm, day: dd };
        }
      }
      // MM/DD or MM/DD/YYYY (or with dashes). US-format only.
      if (!target) {
        const numMatch = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
        if (numMatch) {
          const yyyy = numMatch[3]
            ? numMatch[3].length === 2
              ? 2000 + Number(numMatch[3])
              : Number(numMatch[3])
            : today.year;
          const mm = Number(numMatch[1]);
          const dd = Number(numMatch[2]);
          target = { year: yyyy, month: mm, day: dd };
        }
      }
    }
  }

  if (!target) return null;

  return {
    startUtc: zonedDateToUtc(target.year, target.month, target.day, 0, 0, timezone),
    endUtc: zonedDateToUtc(target.year, target.month, target.day, 23, 59, timezone),
    label: findEarliest ? 'the earliest available time' : formatDateLabel(target),
    requestedDateLocal: target,
    findEarliest,
  };
}

function todayInTz(now: Date, timezone: string): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    return {
      year: Number(parts.find((p) => p.type === 'year')?.value ?? '1970'),
      month: Number(parts.find((p) => p.type === 'month')?.value ?? '1'),
      day: Number(parts.find((p) => p.type === 'day')?.value ?? '1'),
    };
  } catch {
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
  }
}

function addDays(
  d: { year: number; month: number; day: number },
  n: number,
): { year: number; month: number; day: number } {
  // Use UTC math to dodge DST shenanigans, then read UTC components back.
  const utc = new Date(Date.UTC(d.year, d.month - 1, d.day));
  utc.setUTCDate(utc.getUTCDate() + n);
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function weekdayIndex(d: { year: number; month: number; day: number }, _timezone: string): number {
  // Calendar-date weekday is timezone-independent.
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

function formatDateLabel(d: { year: number; month: number; day: number }): string {
  // Anchor at noon UTC so the formatter doesn't tip into the previous day
  // for any reasonable timezone.
  const anchor = new Date(Date.UTC(d.year, d.month - 1, d.day, 12, 0));
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(anchor);
  } catch {
    return anchor.toDateString();
  }
}

function formatTimeLabel(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// ── Flow entry ────────────────────────────────────────────────────────────

export async function processMeetingFlow(input: FlowInput): Promise<FlowOutput> {
  const { tenantContext, inboundMessage, currentState } = input;
  const upperMsg = inboundMessage.trim().toUpperCase();

  pushDecision(input, {
    handler: 'processMeetingFlow',
    phase: 'FLOW',
    outcome: `step_${(currentState?.flowStep ?? 'greeting').toLowerCase()}`,
    evidence: { step: currentState?.flowStep ?? null },
    durationMs: 0,
  });
  const cfg = tenantContext.config as {
    calcomLink?: string | null;
    calcomApiKey?: string | null;
    calcomEventTypeId?: number | null;
    calcomEventTypeSlug?: string | null;
    meetingEnabled?: boolean;
    timezone: string;
  };
  const calcomLink = cfg.calcomLink ?? null;
  const isCalcom = Boolean(cfg.calcomApiKey && cfg.calcomEventTypeId);
  // Built-in calendar is the default. Activates when cal.com isn't
  // configured AND the operator hasn't explicitly disabled the native flow
  // (meetingEnabled defaults to true).
  const hasBuiltIn = !isCalcom && cfg.meetingEnabled !== false;
  const hasCalendar = isCalcom || hasBuiltIn;

  const step = (currentState?.flowStep as FlowStep) ?? 'MEETING_GREETING';

  const baseInitial = (): CallerState => ({
    tenantId: tenantContext.tenantId,
    callerPhone: input.callerPhone,
    conversationId: currentState?.conversationId ?? null,
    currentFlow: FlowType.MEETING,
    flowStep: 'MEETING_GREETING',
    orderDraft: null,
    meetingDraft: null,
    lastMessageAt: Date.now(),
    messageCount: (currentState?.messageCount ?? 0) + 1,
    dedupKey: null,
  });

  // Entry
  if (
    step === 'MEETING_GREETING' ||
    !currentState ||
    currentState.currentFlow !== FlowType.MEETING
  ) {
    // Tier 1: full integration (cal.com OR built-in) — kick off
    // conversational booking. Both paths share the same date-prompt step;
    // the side-effect emitted later branches on isCalcom.
    if (hasCalendar) {
      // If the opening message already contains a date hint
      // ("need a tune-up tomorrow", "AC out — asap", "book me Monday"),
      // skip the "what day works?" prompt and jump straight to fetching
      // slots. Saves the caller a turn and matches the fast pace of
      // service-business SMS conversations.
      const openerDate = parseDateExpression(
        inboundMessage,
        cfg.timezone ?? 'America/Chicago',
      );
      if (openerDate) {
        return {
          nextState: {
            ...baseInitial(),
            flowStep: 'MEETING_SLOT_PICK',
            meetingDraft: {},
          },
          smsReply: `Happy to help you book an appointment with ${tenantContext.tenantName}! Checking availability for ${openerDate.label}…`,
          sideEffects: [
            {
              type: isCalcom ? 'FETCH_CALCOM_SLOTS' : 'FETCH_LOCAL_SLOTS',
              payload: {
                startUtc: openerDate.startUtc.toISOString(),
                endUtc: openerDate.endUtc.toISOString(),
                dateLabel: openerDate.label,
                ...(openerDate.findEarliest && !isCalcom ? { findEarliest: true } : {}),
              },
            },
          ],
          flowType: FlowType.MEETING,
        };
      }
      return {
        nextState: {
          ...baseInitial(),
          flowStep: 'MEETING_DATE_PROMPT',
          meetingDraft: {},
        },
        smsReply: `Happy to help you book an appointment with ${tenantContext.tenantName}! What day works for you? (e.g. tomorrow, Friday, or 4/15)`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }
    // Tier 2: link fallback
    if (calcomLink) {
      return {
        nextState: { ...baseInitial(), flowStep: 'MEETING_CONFIRM' },
        smsReply: `We'd love to connect! Book a time that works for you: ${calcomLink}\n\nOr reply with your preferred date and time and we'll confirm.`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }
    // Tier 3: manual confirmation
    return {
      nextState: { ...baseInitial(), flowStep: 'MEETING_SCHEDULE' },
      smsReply: `We'd love to connect! Please reply with your preferred date, time, and a brief reason for the meeting.`,
      sideEffects: [],
      flowType: FlowType.MEETING,
    };
  }

  // ── MEETING_DATE_PROMPT → ask calendar provider for slots ─────────────
  if (step === 'MEETING_DATE_PROMPT' && hasCalendar) {
    const parsed = parseDateExpression(
      inboundMessage,
      cfg.timezone ?? 'America/Chicago',
    );
    if (!parsed) {
      // Off-flow question detector. Many callers, after we ask "what day
      // works?", reply with a question instead ("how much do you charge?",
      // "what services do you offer?"). Re-prompting "I didn't catch that"
      // feels robotic and dead-ends the conversation. Acknowledge that we
      // heard a question and steer back to the booking — the answer will
      // happen on the call. Heuristic is conservative: trailing "?" or
      // common interrogative openers.
      const looksLikeQuestion =
        /\?$/.test(inboundMessage.trim()) ||
        /^\s*(how|what|when|where|why|who|do you|does it|is it|are you|can you|can i|could you|would you|will you)\b/i.test(
          inboundMessage,
        );
      const reply = looksLikeQuestion
        ? `Good question — let's get a time on the books first and we'll cover the details on the call. What day works for you? You can say "tomorrow", a weekday like "Monday", a date like "5/15", or "asap".`
        : `Sorry, I didn't catch that. What day works for you? e.g. "tomorrow", "Friday", or "4/15".`;
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: reply,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }

    // We can't call cal.com directly from the flow engine. Emit a
    // FETCH_CALCOM_SLOTS side effect; flowEngineService handles it,
    // stores results on the state, and sends the resulting SMS.
    return {
      nextState: {
        ...currentState,
        flowStep: 'MEETING_SLOT_PICK',
        meetingDraft: { ...(currentState.meetingDraft ?? {}) },
        lastMessageAt: Date.now(),
      },
      // Placeholder; the side-effect handler will override the SMS once
      // it has the actual slots.
      smsReply: `Checking availability for ${parsed.label}…`,
      sideEffects: [
        {
          type: isCalcom ? 'FETCH_CALCOM_SLOTS' : 'FETCH_LOCAL_SLOTS',
          payload: {
            startUtc: parsed.startUtc.toISOString(),
            endUtc: parsed.endUtc.toISOString(),
            dateLabel: parsed.label,
            ...(parsed.findEarliest && !isCalcom ? { findEarliest: true } : {}),
          },
        },
      ],
      flowType: FlowType.MEETING,
    };
  }

  // ── MEETING_SLOT_PICK → customer picks a slot number ──────────────────
  if (step === 'MEETING_SLOT_PICK' && hasCalendar) {
    const draft: MeetingDraft = currentState.meetingDraft ?? {};
    const slots = draft.slots ?? [];
    if (slots.length === 0) {
      // No slots stored — fall back to re-asking for a date
      return {
        nextState: {
          ...currentState,
          flowStep: 'MEETING_DATE_PROMPT',
          lastMessageAt: Date.now(),
        },
        smsReply: `What day works for you?`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }

    const pickMatch = inboundMessage.trim().match(/(\d+)/);
    const pickIdx = pickMatch ? Number(pickMatch[1]) - 1 : -1;
    if (pickIdx < 0 || pickIdx >= slots.length) {
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: `Please reply with the number of the slot you'd like (1-${slots.length}).`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }

    const picked = slots[pickIdx];
    return {
      nextState: {
        ...currentState,
        flowStep: 'MEETING_COLLECT_NAME',
        meetingDraft: { ...draft, pickedSlotStart: picked.start },
        lastMessageAt: Date.now(),
      },
      smsReply: `Great — ${formatTimeLabel(
        picked.start,
        cfg.timezone ?? 'America/Chicago',
      )} it is. What's your name?`,
      sideEffects: [],
      flowType: FlowType.MEETING,
    };
  }

  // ── MEETING_COLLECT_NAME → collect name ───────────────────────────────
  if (step === 'MEETING_COLLECT_NAME' && hasCalendar) {
    const name = inboundMessage.trim();
    if (name.length < 2) {
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: `What's your name?`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }
    return {
      nextState: {
        ...currentState,
        flowStep: 'MEETING_COLLECT_EMAIL',
        meetingDraft: {
          ...(currentState.meetingDraft ?? {}),
          name,
        },
        lastMessageAt: Date.now(),
      },
      smsReply: `Thanks ${name}! What's your email address? We'll send the calendar invite there.`,
      sideEffects: [],
      flowType: FlowType.MEETING,
    };
  }

  // ── MEETING_COLLECT_EMAIL → collect email + book ──────────────────────
  if (step === 'MEETING_COLLECT_EMAIL' && hasCalendar) {
    const email = inboundMessage.trim();
    if (!isEmail(email)) {
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: `That doesn't look like an email. Please send your email address so we can book the calendar invite.`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }
    const draft: MeetingDraft = currentState.meetingDraft ?? {};
    if (!draft.pickedSlotStart || !draft.name) {
      // Lost state — restart
      return {
        nextState: {
          ...currentState,
          flowStep: 'MEETING_DATE_PROMPT',
          meetingDraft: {},
          lastMessageAt: Date.now(),
        },
        smsReply: `Let's start over. What day works for you?`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }

    // Emit CREATE_CALCOM_BOOKING (cal.com path) or CREATE_LOCAL_BOOKING
    // (built-in path). flowEngineService makes the API/DB call and sends
    // the confirmation SMS with the exact scheduled time.
    return {
      nextState: {
        ...currentState,
        flowStep: 'MEETING_COMPLETE',
        meetingDraft: { ...draft, email },
        lastMessageAt: Date.now(),
      },
      smsReply: `Booking your appointment…`,
      sideEffects: [
        {
          type: isCalcom ? 'CREATE_CALCOM_BOOKING' : 'CREATE_LOCAL_BOOKING',
          payload: {
            start: draft.pickedSlotStart,
            name: draft.name,
            email,
            callerPhone: input.callerPhone,
          },
        },
      ],
      flowType: FlowType.MEETING,
    };
  }

  // ── Legacy paths (link fallback, manual) ──────────────────────────────

  if (step === 'MEETING_SCHEDULE') {
    const nextState: CallerState = {
      ...currentState,
      flowStep: 'MEETING_CONFIRM',
      lastMessageAt: Date.now(),
    };

    return {
      nextState,
      smsReply: `Got it! We'll review your request and confirm your meeting shortly. You'll receive a confirmation text within 1 business hour.`,
      sideEffects: [
        {
          type: 'BOOK_MEETING',
          payload: {
            callerPhone: input.callerPhone,
            preferredTime: inboundMessage.trim(),
            notes: null,
          },
        },
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: `Meeting Request from ${input.callerPhone}`,
            message: `Meeting request received from ${input.callerPhone}:\n"${inboundMessage}"`,
            channel: 'email',
          },
        },
      ],
      flowType: FlowType.MEETING,
    };
  }

  if (step === 'MEETING_CONFIRM' || step === 'MEETING_COMPLETE') {
    if (upperMsg === 'CANCEL' || upperMsg === 'NO') {
      return {
        nextState: {
          ...currentState,
          flowStep: 'MEETING_GREETING',
          currentFlow: null,
          meetingDraft: null,
          lastMessageAt: Date.now(),
        },
        smsReply: `No problem! If you change your mind, just text MEETING anytime.`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }

    return {
      nextState: { ...currentState, lastMessageAt: Date.now() },
      smsReply: `Your meeting request is in the queue. We'll be in touch!`,
      sideEffects: [],
      flowType: FlowType.MEETING,
    };
  }

  return {
    nextState: baseInitial(),
    smsReply: `Thanks for reaching out! Text MEETING to schedule a call.`,
    sideEffects: [],
    flowType: FlowType.MEETING,
  };
}
