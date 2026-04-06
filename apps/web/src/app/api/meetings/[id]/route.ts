import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { MeetingStatus } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { ValidationError } from '@/lib/server/errors';

const UpdateMeetingSchema = z.object({
  status: z.nativeEnum(MeetingStatus).optional(),
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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.id },
    include: { conversation: true },
  });
  if (!meeting) return apiError('Meeting not found', 404);
  const authResult = await verifyTenantAccess(meeting.tenantId);
  if (isNextResponse(authResult)) return authResult;
  return apiSuccess(meeting);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = UpdateMeetingSchema.parse(await req.json());

    const existing = await prisma.meeting.findUnique({ where: { id: params.id } });
    if (!existing) return apiError('Meeting not found', 404);
    const authResult = await verifyTenantAccess(existing.tenantId);
    if (isNextResponse(authResult)) return authResult;

    if (body.scheduledAt) {
      await validateBusinessHours(existing.tenantId, body.scheduledAt);
    }

    const meeting = await prisma.meeting.update({
      where: { id: params.id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: { conversation: true },
    });

    return apiSuccess(meeting);
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', err.statusCode ?? 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const existing = await prisma.meeting.findUnique({ where: { id: params.id } });
  if (!existing) return apiError('Meeting not found', 404);
  const authResult = await verifyTenantAccess(existing.tenantId);
  if (isNextResponse(authResult)) return authResult;
  const meeting = await prisma.meeting.update({
    where: { id: params.id },
    data: { status: 'CANCELLED' },
    include: { conversation: true },
  });
  return apiSuccess(meeting);
}
