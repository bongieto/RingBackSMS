import axios from 'axios';
import { PrismaClient, MeetingStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface CreateMeetingInput {
  tenantId: string;
  conversationId: string;
  callerPhone: string;
  preferredTime: string | null;
  notes: string | null;
}

export async function createMeeting(input: CreateMeetingInput) {
  const meeting = await prisma.meeting.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      callerPhone: input.callerPhone,
      status: MeetingStatus.PENDING,
      notes: input.notes ?? input.preferredTime,
    },
  });

  logger.info('Meeting created', { tenantId: input.tenantId, meetingId: meeting.id });
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
  return prisma.meeting.update({
    where: { id: meetingId },
    data: {
      calcomBookingId: bookingId,
      calcomBookingUid: bookingUid,
      scheduledAt,
      status: MeetingStatus.CONFIRMED,
    },
  });
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
