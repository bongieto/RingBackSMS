import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  label: z.string().max(120).optional(),
});

export async function GET(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const blackouts = await prisma.calendarBlackout.findMany({
    where: { tenantId },
    orderBy: { startAt: 'asc' },
  });
  return apiSuccess({ blackouts });
}

export async function POST(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch (err: any) {
    return apiError(err?.message ?? 'Invalid body', 400);
  }

  const start = new Date(body.startAt);
  const end = new Date(body.endAt);
  if (end <= start) {
    return apiError('endAt must be after startAt', 400);
  }

  const blackout = await prisma.calendarBlackout.create({
    data: {
      tenantId,
      startAt: start,
      endAt: end,
      label: body.label ?? null,
    },
  });
  return apiSuccess({ blackout });
}
