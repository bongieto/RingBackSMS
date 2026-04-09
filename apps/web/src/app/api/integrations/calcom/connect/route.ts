import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { encrypt } from '@/lib/server/encryption';
import { validateApiKey } from '@/lib/server/services/calcomService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ apiKey: z.string().min(10) });

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
    // Validate the key by hitting /me. Throws on bad key.
    const user = await validateApiKey(body.apiKey);
    await prisma.tenantConfig.update({
      where: { tenantId },
      data: {
        calcomApiKey: encrypt(body.apiKey),
      },
    });
    logger.info('cal.com connected', { tenantId, calcomUserId: user.id });
    return apiSuccess({
      connected: true,
      userName: user.name ?? user.username ?? user.email,
      email: user.email,
    });
  } catch (err: any) {
    logger.warn('[POST /api/integrations/calcom/connect] failed', {
      tenantId,
      err: err?.message,
    });
    return apiError(
      err?.message ?? 'Failed to validate cal.com API key',
      400,
    );
  }
}
