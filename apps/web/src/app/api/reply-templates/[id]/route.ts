import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const UpdateSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  body: z.string().min(1).max(1600).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.replyTemplate.findUnique({ where: { id: params.id } });
    if (!existing) return apiError('Not found', 404);
    const auth = await verifyTenantAccess(existing.tenantId);
    if (isNextResponse(auth)) return auth;

    const body = UpdateSchema.parse(await req.json());
    const updated = await prisma.replyTemplate.update({
      where: { id: params.id },
      data: {
        ...(body.label !== undefined && { label: body.label }),
        ...(body.body !== undefined && { body: body.body }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
    });
    return apiSuccess(updated);
  } catch (err: any) {
    logger.error('Reply template update failed', { err });
    return apiError(err?.message ?? 'Internal server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.replyTemplate.findUnique({ where: { id: params.id } });
    if (!existing) return apiError('Not found', 404);
    const auth = await verifyTenantAccess(existing.tenantId);
    if (isNextResponse(auth)) return auth;

    await prisma.replyTemplate.delete({ where: { id: params.id } });
    return apiSuccess({ deleted: true });
  } catch (err: any) {
    logger.error('Reply template delete failed', { err });
    return apiError(err?.message ?? 'Internal server error', 500);
  }
}
