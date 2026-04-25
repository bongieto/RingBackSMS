// Host-side glue between flowEngineService and the pure availability
// engine in @ringback/flow-engine. Responsibilities:
//   - fetchAvailabilityInputs: pull existing meetings + blackouts + config
//     for the requested day, ready to pass into computeAvailableSlots.
//   - createLocalBooking: SERIALIZABLE conflict check + Meeting insert.
//
// The flow-engine package itself stays free of Prisma; this module is the
// only place the built-in calendar touches the DB.

import { Prisma, MeetingStatus } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../logger';

interface AvailabilityInputs {
  existingMeetings: Array<{ scheduledAt: Date; durationMinutes: number | null }>;
  blackouts: Array<{ startAt: Date; endAt: Date }>;
}

/**
 * Pull existing meetings + blackouts whose windows overlap the requested
 * day. We pad each side by `durationMinutes` worth of slack so a meeting
 * straddling midnight (rare) is still considered.
 */
export async function fetchAvailabilityInputs(
  tenantId: string,
  dayStartUtc: Date,
  dayEndUtc: Date,
  defaultDurationMinutes: number,
): Promise<AvailabilityInputs> {
  const padMs = defaultDurationMinutes * 60_000;
  const windowStart = new Date(dayStartUtc.getTime() - padMs);
  const windowEnd = new Date(dayEndUtc.getTime() + padMs);

  const [existingMeetings, blackouts] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        tenantId,
        status: { in: [MeetingStatus.CONFIRMED, MeetingStatus.PENDING] },
        scheduledAt: { gte: windowStart, lte: windowEnd },
      },
      select: { scheduledAt: true, durationMinutes: true },
    }),
    prisma.calendarBlackout.findMany({
      where: {
        tenantId,
        // overlap test: blackout.startAt < windowEnd AND blackout.endAt > windowStart
        startAt: { lt: windowEnd },
        endAt: { gt: windowStart },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  return {
    existingMeetings: existingMeetings
      .filter((m) => m.scheduledAt !== null)
      .map((m) => ({
        scheduledAt: m.scheduledAt as Date,
        durationMinutes: m.durationMinutes,
      })),
    blackouts,
  };
}

export class SlotConflictError extends Error {
  constructor(message = 'Slot conflict') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

/**
 * Atomically book a slot in the built-in calendar. Uses a SERIALIZABLE
 * transaction to prevent two concurrent SMS conversations from grabbing
 * the same slot. Throws SlotConflictError if the slot is no longer free.
 */
export async function createLocalBooking(input: {
  tenantId: string;
  conversationId: string;
  callerPhone: string;
  start: Date;
  durationMinutes: number;
  guestName: string;
  guestEmail: string;
}): Promise<{ id: string }> {
  const start = input.start;
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  // The meeting flow always runs at least 5 turns before booking (greeting
  // → date → slot pick → name → email), so by the time we get here the
  // caller already has a Conversation row. If conversationId is missing
  // we create a placeholder so the FK is satisfied — same shape as the
  // cal.com path's createMeeting.
  let conversationId = input.conversationId;
  if (!conversationId) {
    const placeholder = await prisma.conversation.create({
      data: {
        tenantId: input.tenantId,
        callerPhone: input.callerPhone,
        flowType: 'MEETING',
        isActive: true,
      },
    });
    conversationId = placeholder.id;
  }

  // Single SERIALIZABLE transaction for the conflict check + insert. All
  // queries use `tx` so we don't deadlock on connection-pool exhaustion
  // (the earlier version mixed `tx` reads with global-`prisma` writes,
  // which timed out the interactive transaction at 5s).
  return prisma.$transaction(
    async (tx) => {
      // Conflict check: any active meeting whose [scheduledAt, scheduledAt
      // + duration) overlaps our [start, end). We can't express the
      // duration-aware overlap purely in WHERE, so pull candidates whose
      // start is plausibly within range and filter in memory.
      const candidates = await tx.meeting.findMany({
        where: {
          tenantId: input.tenantId,
          status: { in: [MeetingStatus.CONFIRMED, MeetingStatus.PENDING] },
          scheduledAt: {
            gte: new Date(start.getTime() - 4 * 60 * 60_000), // 4h back
            lte: new Date(end.getTime() + 4 * 60 * 60_000),   // 4h fwd
          },
        },
        select: { id: true, scheduledAt: true, durationMinutes: true },
      });

      const overlap = candidates.find((c) => {
        if (!c.scheduledAt) return false;
        const cStart = c.scheduledAt.getTime();
        const cEnd = cStart + (c.durationMinutes ?? input.durationMinutes) * 60_000;
        return cStart < end.getTime() && cEnd > start.getTime();
      });
      if (overlap) throw new SlotConflictError();

      const blackoutHit = await tx.calendarBlackout.findFirst({
        where: {
          tenantId: input.tenantId,
          startAt: { lt: end },
          endAt: { gt: start },
        },
        select: { id: true },
      });
      if (blackoutHit) throw new SlotConflictError('Slot is in a blackout window');

      const meeting = await tx.meeting.create({
        data: {
          tenantId: input.tenantId,
          conversationId,
          callerPhone: input.callerPhone,
          scheduledAt: start,
          durationMinutes: input.durationMinutes,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          notes: `Booked via SMS: ${input.guestName} <${input.guestEmail}>`,
          status: MeetingStatus.CONFIRMED,
        },
        select: { id: true },
      });

      return { id: meeting.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  ).catch((err) => {
    if (err instanceof SlotConflictError) throw err;
    logger.error('createLocalBooking failed', {
      tenantId: input.tenantId,
      errMessage: err?.message,
      errName: err?.name,
      errCode: err?.code,
      errStack: err?.stack?.slice(0, 1500),
    });
    throw err;
  });
}
