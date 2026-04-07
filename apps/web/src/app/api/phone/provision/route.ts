import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import {
  provisionSubAccount,
  provisionPhoneNumber,
  saveTenantTwilioCredentials,
} from '@/lib/server/services/twilioService';
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
      select: {
        id: true,
        name: true,
        twilioSubAccountSid: true,
        twilioAuthToken: true,
        twilioPhoneNumber: true,
      },
    });

    if (!tenant) return apiError('Tenant not found', 404);

    if (tenant.twilioPhoneNumber) {
      return apiError('Tenant already has a provisioned phone number', 400);
    }

    let subAccountSid = tenant.twilioSubAccountSid;
    let encryptedAuthToken = tenant.twilioAuthToken;

    if (!subAccountSid || !encryptedAuthToken) {
      logger.info('Provisioning Twilio sub-account', { tenantId });
      const subAccount = await provisionSubAccount(tenant.name);
      await saveTenantTwilioCredentials(tenantId, subAccount.accountSid, subAccount.authToken);
      subAccountSid = subAccount.accountSid;
      const updated = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { twilioAuthToken: true },
      });
      encryptedAuthToken = updated!.twilioAuthToken;
    }

    const baseUrl = process.env.FRONTEND_URL ?? 'https://ringbacksms.com';

    const provisionedNumber = await provisionPhoneNumber(
      tenantId,
      subAccountSid,
      encryptedAuthToken!,
      phoneNumber,
      baseUrl
    );

    logger.info('Phone number provisioned for tenant', { tenantId, phoneNumber: provisionedNumber });

    return apiSuccess({ phoneNumber: provisionedNumber, subAccountSid });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
