import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  eventTypeId: z.number().int().positive(),
  eventTypeSlug: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err: any) {
    return apiError(err?.message ?? 'Invalid body', 400);
  }

  try {
    await prisma.tenantConfig.update({
      where: { tenantId },
      data: {
        calcomEventTypeId: body.eventTypeId,
        calcomEventTypeSlug: body.eventTypeSlug,
      },
    });
    logger.info('cal.com event type configured', {
      tenantId,
      eventTypeId: body.eventTypeId,
      eventTypeSlug: body.eventTypeSlug,
    });
    return apiSuccess({
      eventTypeId: body.eventTypeId,
      eventTypeSlug: body.eventTypeSlug,
    });
  } catch (err: any) {
    logger.error(
      '[POST /api/integrations/calcom/configure] failed',
      { tenantId, err: err?.message },
    );
    return apiError('Failed to save event type', 500);
  }
}
