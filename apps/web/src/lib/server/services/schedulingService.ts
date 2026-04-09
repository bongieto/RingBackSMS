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
