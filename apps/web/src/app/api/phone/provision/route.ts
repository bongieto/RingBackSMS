import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { provisionPhoneNumber } from '@/lib/server/services/twilioService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { checkRateLimit, rateLimitResponse } from '@/lib/server/rateLimit';

// Provisioning creates a sub-account + buys a number — can take a while
export const maxDuration = 30;

const ProvisionSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format'),
  tenantId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const { phoneNumber, tenantId } = ProvisionSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    // Twilio provisioning is billed — limit 5/hour per tenant
    const rl = await checkRateLimit(`phone-provision:${tenantId}`, 5, 3600);
    if (!rl.allowed) return rateLimitResponse(rl);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, twilioPhoneNumber: true },
    });

    if (!tenant) return apiError('Tenant not found', 404);

    if (tenant.twilioPhoneNumber) {
      return apiError('Tenant already has a provisioned phone number', 400);
    }

    const baseUrl = process.env.FRONTEND_URL ?? 'https://ringbacksms.com';

    // New flow: number is bought on the master Twilio account and attached
    // to the A2P 10DLC Messaging Service. No sub-account is created.
    const provisionedNumber = await provisionPhoneNumber(tenantId, phoneNumber, baseUrl);

    logger.info('Phone number provisioned for tenant', { tenantId, phoneNumber: provisionedNumber });

    return apiSuccess({ phoneNumber: provisionedNumber });
  } catch (err: any) {
    // Surface the real cause to logs (Twilio errors usually carry .code,
    // .moreInfo, .status). Without this, the handler returns a bare 500
    // and ops has nothing to debug. Customer-facing message stays generic.
    const twilioCode = err?.code ?? null;
    const twilioStatus = err?.status ?? null;
    const twilioMoreInfo = err?.moreInfo ?? null;
    logger.error('Phone provision failed', {
      message: err?.message,
      twilioCode,
      twilioStatus,
      twilioMoreInfo,
      stack: err?.stack,
    });
    if (err instanceof z.ZodError) {
      return apiError(err.errors.map((e) => e.message).join('; '), 400);
    }
    // Pass Twilio's customer-friendly message through when we have one
    // (e.g. "Phone number is no longer available", "A2P 10DLC ...").
    if (typeof err?.message === 'string' && err.message.length < 200) {
      return apiError(err.message, 500);
    }
    return apiError('Failed to provision phone number', 500);
  }
}
