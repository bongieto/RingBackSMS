import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiCreated, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const CreateSchema = z.object({
  tenantId: z.string().min(1),
  label: z.string().min(1).max(60),
  body: z.string().min(1).max(1600),
  sortOrder: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);
  const auth = await verifyTenantAccess(tenantId);
  if (isNextResponse(auth)) return auth;

  const items = await prisma.replyTemplate.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return apiSuccess(items);
}

export async function POST(req: NextRequest) {
  try {
    const body = CreateSchema.parse(await req.json());
    const auth = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(auth)) return auth;

    const item = await prisma.replyTemplate.create({
      data: {
        tenantId: body.tenantId,
        label: body.label,
        body: body.body,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    logger.info('Reply template created', { id: item.id, tenantId: body.tenantId });
    return apiCreated(item);
  } catch (err: any) {
    logger.error('Reply template create failed', { err });
    return apiError(err?.message ?? 'Internal server error', 500);
  }
}
