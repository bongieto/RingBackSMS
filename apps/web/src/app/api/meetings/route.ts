import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { MeetingStatus } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiCreated, apiPaginated, apiError } from '@/lib/server/response';
import { ValidationError } from '@/lib/server/errors';

const CreateMeetingSchema = z.object({
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  callerPhone: z.string().min(1),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

async function validateBusinessHours(tenantId: string, scheduledAt: string): Promise<void> {
  const config = await prisma.tenantConfig.findUnique({ where: { tenantId } });
  if (!config) return;

  const date = new Date(scheduledAt);

  const dayOfWeek = date.getDay();
  if (config.businessDays.length > 0 && !config.businessDays.includes(dayOfWeek)) {
    throw new ValidationError(
      `Meetings cannot be scheduled on this day. Business days: ${config.businessDays.join(', ')}`
    );
  }

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  if (timeStr < config.businessHoursStart || timeStr >= config.businessHoursEnd) {
    throw new ValidationError(
      `Meetings must be scheduled between ${config.businessHoursStart} and ${config.businessHoursEnd}`
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') ?? '';
  if (!tenantId) return apiError('tenantId is required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const status = searchParams.get('status') as MeetingStatus | undefined ?? undefined;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

  const where = {
    tenantId,
    ...(status && { status }),
    ...(from || to
      ? {
          scheduledAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        }
      : {}),
  };

  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { conversation: true },
    }),
    prisma.meeting.count({ where }),
  ]);

  return apiPaginated(meetings, total, page, pageSize);
}

export async function POST(req: NextRequest) {
  try {
    const body = CreateMeetingSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(authResult)) return authResult;

    if (body.scheduledAt) {
      await validateBusinessHours(body.tenantId, body.scheduledAt);
    }

    let conversationId = body.conversationId;
    if (!conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { tenantId: body.tenantId, callerPhone: body.callerPhone, isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (existing) {
        conversationId = existing.id;
      } else {
        const conversation = await prisma.conversation.create({
          data: {
            tenantId: body.tenantId,
            callerPhone: body.callerPhone,
            flowType: 'MEETING',
            isActive: true,
          },
        });
        conversationId = conversation.id;
      }
    }

    const meeting = await prisma.meeting.create({
      data: {
        tenantId: body.tenantId,
        conversationId,
        callerPhone: body.callerPhone,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        notes: body.notes,
        status: 'PENDING',
      },
      include: { conversation: true },
    });

    return apiCreated(meeting);
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', err.statusCode ?? 500);
  }
}
