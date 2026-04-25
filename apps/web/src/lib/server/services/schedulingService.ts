import axios from 'axios';
import { MeetingStatus } from '@prisma/client';
import { logger } from '../logger';
import { prisma } from '../db';
import { createTask, autoCompleteTasksForEntity } from './taskService';

export interface CreateMeetingInput {
  tenantId: string;
  conversationId: string;
  callerPhone: string;
  preferredTime?: string | null;
  notes: string | null;
  scheduledAt?: Date | null;
  durationMinutes?: number | null;
  guestName?: string | null;
  guestEmail?: string | null;
  status?: MeetingStatus;
  calcomBookingId?: string | null;
  calcomBookingUid?: string | null;
}

export async function createMeeting(input: CreateMeetingInput) {
  // If we don't have a conversation id (cal.com booking from a fresh
  // number with no prior SMS), create a placeholder conversation so the
  // Meeting row's FK is satisfied.
  let conversationId = input.conversationId;
  if (!conversationId) {
    const conv = await prisma.conversation.create({
      data: {
        tenantId: input.tenantId,
        callerPhone: input.callerPhone,
        isActive: true,
        flowType: 'MEETING',
      },
    });
    conversationId = conv.id;
  }

  const meeting = await prisma.meeting.create({
    data: {
      tenantId: input.tenantId,
      conversationId,
      callerPhone: input.callerPhone,
      status: input.status ?? MeetingStatus.PENDING,
      scheduledAt: input.scheduledAt ?? null,
      durationMinutes: input.durationMinutes ?? null,
      guestName: input.guestName ?? null,
      guestEmail: input.guestEmail ?? null,
      notes: input.notes ?? input.preferredTime ?? null,
      calcomBookingId: input.calcomBookingId ?? null,
      calcomBookingUid: input.calcomBookingUid ?? null,
    },
  });

  logger.info('Meeting created', { tenantId: input.tenantId, meetingId: meeting.id });

  // Action item for the owner — only for pending (non-confirmed) meetings.
  if ((input.status ?? MeetingStatus.PENDING) === MeetingStatus.PENDING) {
    await createTask({
      tenantId: input.tenantId,
      source: 'MEETING',
      title: `Confirm meeting request from ${input.callerPhone}`,
      description: input.notes ?? input.preferredTime ?? undefined,
      priority: 'HIGH',
      callerPhone: input.callerPhone,
      meetingId: meeting.id,
    }).catch((err) => logger.warn('Failed to create meeting task', { err, meetingId: meeting.id }));
  }

  return meeting;
}

export interface CalcomBookingPayload {
  eventTypeId: number;
  start: string;
  end: string;
  responses: {
    name: string;
    email: string;
    phone?: string;
    notes?: string;
  };
  timeZone: string;
  language: string;
  metadata: Record<string, string>;
}

/**
 * Creates a cal.com booking via their API.
 * Requires a cal.com API key on the tenant config.
 */
export async function createCalcomBooking(
  apiKey: string,
  payload: CalcomBookingPayload
): Promise<{ bookingId: string; uid: string; confirmationUrl: string }> {
  const response = await axios.post('https://api.cal.com/v1/bookings', payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const data = response.data as {
    id: number;
    uid: string;
    metadata?: { videoCallUrl?: string };
  };

  return {
    bookingId: String(data.id),
    uid: data.uid,
    confirmationUrl: data.metadata?.videoCallUrl ?? '',
  };
}

export async function updateMeetingWithBooking(
  meetingId: string,
  tenantId: string,
  bookingId: string,
  bookingUid: string,
  scheduledAt: Date
) {
  const updated = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      calcomBookingId: bookingId,
      calcomBookingUid: bookingUid,
      scheduledAt,
      status: MeetingStatus.CONFIRMED,
    },
  });
  await autoCompleteTasksForEntity('MEETING', 'meetingId', meetingId).catch((err) =>
    logger.warn('Failed to auto-complete meeting task', { err, meetingId })
  );
  return updated;
}

/**
 * Match a customer SMS like "C" / "yes" / "confirmed" against a recent
 * meeting where we sent a confirmation prompt and they haven't replied
 * yet. Stamps confirmedAt and sends a thank-you SMS. Returns true when
 * the message was consumed (caller-SMS handler skips the AI flow).
 *
 * "R" / "reschedule" goes through a sister handler that sends the
 * reschedule ack and clears CallerState so the next message restarts
 * the booking flow.
 */
const CONFIRM_RE = /^\s*(c|y|yes|yeah|yep|ok|okay|confirm(?:ed|ing)?|sure)[\s!.,]*$/i;
const RESCHEDULE_RE = /^\s*(r|reschedule|change|move|different\s+(?:day|time))[\s!.,]*$/i;

export async function tryConsumeMeetingConfirmReply(
  tenantId: string,
  callerPhone: string,
  body: string,
): Promise<{ consumed: boolean; rescheduled?: boolean }> {
  const isConfirm = CONFIRM_RE.test(body);
  const isReschedule = RESCHEDULE_RE.test(body);
  if (!isConfirm && !isReschedule) return { consumed: false };

  // Match a meeting where:
  //   - the confirmation prompt was sent (confirmationSentAt non-null),
  //   - it's still upcoming (scheduledAt > now - 1hr buffer),
  //   - the caller hasn't replied yet (confirmedAt is null),
  //   - status is CONFIRMED (not already CANCELLED).
  // The 1hr buffer past scheduledAt lets a "thanks see you in a bit"
  // reply still register as a confirmation just before the appointment.
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 60_000);
  const meeting = await prisma.meeting.findFirst({
    where: {
      tenantId,
      callerPhone,
      status: MeetingStatus.CONFIRMED,
      confirmationSentAt: { not: null },
      confirmedAt: null,
      scheduledAt: { gte: since },
    },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true, scheduledAt: true, tenant: { select: { name: true, config: { select: { timezone: true } } } } },
  });
  if (!meeting) return { consumed: false };

  if (isReschedule) {
    // Don't change status; clearing CallerState (handled by caller) lets
    // the next inbound message restart the MEETING flow naturally.
    const { sms: i18nSms } = await import('../i18n');
    const { sendSms } = await import('./twilioService');
    await sendSms(tenantId, callerPhone, i18nSms('meetingRescheduleAck', null, {})).catch(() => {});
    logger.info('Meeting reschedule requested via SMS', { meetingId: meeting.id });
    return { consumed: true, rescheduled: true };
  }

  // Confirm path
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { confirmedAt: new Date() },
  });
  const tz = meeting.tenant.config?.timezone ?? 'America/Chicago';
  const timeLabel = meeting.scheduledAt
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
        .format(meeting.scheduledAt)
        .replace(/,/g, '')
    : 'soon';
  const { sms: i18nSms } = await import('../i18n');
  const { sendSms } = await import('./twilioService');
  await sendSms(
    tenantId,
    callerPhone,
    i18nSms('meetingConfirmThanks', null, { timeLabel }),
  ).catch(() => {});
  logger.info('Meeting confirmed via SMS', { meetingId: meeting.id });
  return { consumed: true };
}

export async function getTenantMeetings(
  tenantId: string,
  status?: MeetingStatus,
  page = 1,
  pageSize = 20
) {
  const where = { tenantId, ...(status && { status }) };
  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.meeting.count({ where }),
  ]);

  return { meetings, total };
}
