import { FlowInput, FlowOutput, FlowStep } from '../types';
import { FlowType, CallerState, MeetingDraft } from '@ringback/shared-types';
import { pushDecision } from '../decisions';

// ── Date parsing (MVP — keyword-based, no LLM) ────────────────────────────

/**
 * Resolve a naive natural-language date expression to a UTC day range.
 * Returns null if we can't parse it, so the caller can re-prompt.
 */
function parseDateExpression(
  input: string,
  timezone: string,
  now: Date = new Date(),
): { startUtc: Date; endUtc: Date; label: string } | null {
  const t = input.trim().toLowerCase();
  const nowInTz = toZonedDate(now, timezone);
  let target: Date | null = null;

  if (/^today$|^tdy$/.test(t)) {
    target = nowInTz;
  } else if (/^tomorrow$|^tmrw$|^tomm?orow$/.test(t)) {
    target = addDays(nowInTz, 1);
  } else {
    const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const match = t.match(/^(?:next\s+)?(sun|mon|tue|wed|thu|fri|sat)/);
    if (match) {
      const wantedDay = weekdays.indexOf(match[1]);
      const currentDay = nowInTz.getDay();
      let delta = (wantedDay - currentDay + 7) % 7;
      if (delta === 0) delta = 7; // "monday" spoken on monday → next monday
      if (t.includes('next') && delta < 7) delta += 7;
      target = addDays(nowInTz, delta);
    } else {
      // MM/DD or YYYY-MM-DD
      const numMatch = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (numMatch) {
        const yyyy = numMatch[3]
          ? numMatch[3].length === 2
            ? 2000 + Number(numMatch[3])
            : Number(numMatch[3])
          : nowInTz.getFullYear();
        // Treat as YYYY-MM-DD if first group is 4 digits (not possible from this regex,
        // so assume US MM/DD input).
        const mm = Number(numMatch[1]);
        const dd = Number(numMatch[2]);
        target = new Date(Date.UTC(yyyy, mm - 1, dd));
      }
    }
  }

  if (!target) return null;

  // Build day range in the tenant's timezone. We query cal.com with UTC
  // ISO strings spanning 00:00 → 23:59 local.
  const y = target.getFullYear();
  const m = target.getMonth();
  const d = target.getDate();
  const startLocal = new Date(y, m, d, 0, 0, 0);
  const endLocal = new Date(y, m, d, 23, 59, 59);
  return {
    startUtc: startLocal,
    endUtc: endLocal,
    label: formatDateLabel(startLocal, timezone),
  };
}

function toZonedDate(now: Date, timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = Number(parts.find((p) => p.type === 'year')?.value ?? '1970');
    const m = Number(parts.find((p) => p.type === 'month')?.value ?? '1');
    const d = Number(parts.find((p) => p.type === 'day')?.value ?? '1');
    return new Date(y, m - 1, d);
  } catch {
    return now;
  }
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDateLabel(d: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toDateString();
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
    timezone: string;
  };
  const calcomLink = cfg.calcomLink ?? null;
  const hasFullIntegration = Boolean(cfg.calcomApiKey && cfg.calcomEventTypeId);

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
    // Tier 1: full integration — kick off conversational booking.
    if (hasFullIntegration) {
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

  // ── MEETING_DATE_PROMPT → ask cal.com for slots ───────────────────────
  if (step === 'MEETING_DATE_PROMPT' && hasFullIntegration) {
    const parsed = parseDateExpression(
      inboundMessage,
      cfg.timezone ?? 'America/Chicago',
    );
    if (!parsed) {
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: `Sorry, I didn't catch that. What day works for you? e.g. "tomorrow", "Friday", or "4/15".`,
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
          type: 'FETCH_CALCOM_SLOTS',
          payload: {
            startUtc: parsed.startUtc.toISOString(),
            endUtc: parsed.endUtc.toISOString(),
            dateLabel: parsed.label,
          },
        },
      ],
      flowType: FlowType.MEETING,
    };
  }

  // ── MEETING_SLOT_PICK → customer picks a slot number ──────────────────
  if (step === 'MEETING_SLOT_PICK' && hasFullIntegration) {
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
  if (step === 'MEETING_COLLECT_NAME' && hasFullIntegration) {
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
      smsReply: `Thanks ${name}! What's your email address? (cal.com needs it to send the calendar invite)`,
      sideEffects: [],
      flowType: FlowType.MEETING,
    };
  }

  // ── MEETING_COLLECT_EMAIL → collect email + book ──────────────────────
  if (step === 'MEETING_COLLECT_EMAIL' && hasFullIntegration) {
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

    // Emit CREATE_CALCOM_BOOKING — flowEngineService makes the API call
    // and sends the confirmation SMS with the exact scheduled time.
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
          type: 'CREATE_CALCOM_BOOKING',
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
