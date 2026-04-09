import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { verifyWebhookSignature } from '@/lib/server/services/calcomService';
import { sendNotification } from '@/lib/server/services/notificationService';
import { logger } from '@/lib/server/logger';
import { apiSuccess, apiError } from '@/lib/server/response';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

interface CalcomWebhookPayload {
  triggerEvent: string;
  createdAt?: string;
  payload: {
    bookingId?: number;
    uid?: string;
    eventTypeId?: number;
    title?: string;
    startTime?: string;
    endTime?: string;
    attendees?: Array<{ email?: string; name?: string; phoneNumber?: string }>;
    organizer?: { email?: string; name?: string };
    metadata?: Record<string, unknown>;
    cancellationReason?: string;
  };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(`calcom-wh:${ip}`, 120, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const rawBody = await req.text();
  const sig = req.headers.get('x-cal-signature-256') ?? req.headers.get('x-cal-signature');
  if (!verifyWebhookSignature(rawBody, sig)) {
    logger.warn('[calcom webhook] signature verification failed');
    return apiError('Invalid signature', 401);
  }

  let evt: CalcomWebhookPayload;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return apiError('Invalid JSON', 400);
  }

  try {
    const p = evt.payload ?? {};
    const bookingUid = p.uid ?? null;
    if (!bookingUid) {
      logger.warn('[calcom webhook] payload missing uid', { triggerEvent: evt.triggerEvent });
      return apiSuccess({ received: true });
    }

    // Resolve which tenant this booking belongs to. Priority:
    // 1) metadata.ringbackTenantId (set when SMS flow creates the booking)
    // 2) matching the eventTypeId against any TenantConfig.calcomEventTypeId
    let tenantId: string | null =
      (p.metadata?.ringbackTenantId as string | undefined) ?? null;
    if (!tenantId && p.eventTypeId) {
      const cfg = await prisma.tenantConfig.findFirst({
        where: { calcomEventTypeId: p.eventTypeId },
        select: { tenantId: true },
      });
      tenantId = cfg?.tenantId ?? null;
    }
    if (!tenantId) {
      logger.info('[calcom webhook] no matching tenant', {
        triggerEvent: evt.triggerEvent,
        eventTypeId: p.eventTypeId,
      });
      return apiSuccess({ received: true });
    }

    const callerPhone =
      (p.metadata?.ringbackCallerPhone as string | undefined) ??
      p.attendees?.[0]?.phoneNumber ??
      p.attendees?.[0]?.email ??
      'unknown';
    const scheduledAt = p.startTime ? new Date(p.startTime) : null;

    // We need a conversation id for the Meeting row. Reuse the caller's
    // most recent conversation, or create a synthetic one if none exists.
    const conversation = await prisma.conversation.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const conversationId = conversation?.id;

    const existing = await prisma.meeting.findFirst({
      where: { tenantId, calcomBookingUid: bookingUid },
      select: { id: true },
    });

    const evtType = evt.triggerEvent;

    if (evtType === 'BOOKING_CREATED') {
      if (existing) {
        await prisma.meeting.update({
          where: { id: existing.id },
          data: { status: 'CONFIRMED', scheduledAt },
        });
      } else if (conversationId) {
        await prisma.meeting.create({
          data: {
            tenantId,
            conversationId,
            callerPhone,
            calcomBookingId: p.bookingId ? String(p.bookingId) : null,
            calcomBookingUid: bookingUid,
            scheduledAt,
            status: 'CONFIRMED',
            notes: p.title ?? null,
          },
        });
      } else {
        logger.info('[calcom webhook] skipping orphan booking (no conversation)', {
          tenantId,
          bookingUid,
        });
      }

      sendNotification({
        tenantId,
        subject: 'New cal.com booking',
        message: `${p.attendees?.[0]?.name ?? callerPhone} booked ${p.title ?? 'a meeting'}${
          scheduledAt ? ` at ${scheduledAt.toLocaleString()}` : ''
        }.`,
        channel: 'email',
      }).catch((err) =>
        logger.warn('Failed to send cal.com booking notification', { err, tenantId }),
      );
    } else if (evtType === 'BOOKING_RESCHEDULED') {
      if (existing) {
        await prisma.meeting.update({
          where: { id: existing.id },
          data: { scheduledAt, status: 'CONFIRMED' },
        });
      }
    } else if (evtType === 'BOOKING_CANCELLED' || evtType === 'BOOKING_REJECTED') {
      if (existing) {
        await prisma.meeting.update({
          where: { id: existing.id },
          data: {
            status: 'CANCELLED',
            notes: p.cancellationReason ?? p.title ?? null,
          },
        });
      }
      sendNotification({
        tenantId,
        subject: 'cal.com booking cancelled',
        message: `A booking was ${evtType === 'BOOKING_REJECTED' ? 'rejected' : 'cancelled'}: ${
          p.title ?? bookingUid
        }`,
        channel: 'email',
      }).catch((err) =>
        logger.warn('Failed to send cancellation notification', { err, tenantId }),
      );
    }

    return apiSuccess({ received: true });
  } catch (err: any) {
    logger.error('[calcom webhook] handler failed', { err: err?.message });
    return apiError('Webhook handler failed', 500);
  }
}
