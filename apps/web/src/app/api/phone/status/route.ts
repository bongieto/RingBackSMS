import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest) {
  try {
    const tenantId = z.string().uuid().parse(new URL(request.url).searchParams.get('tenantId'));
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        twilioPhoneNumber: true,
        twilioSubAccountSid: true,
      },
    });

    if (!tenant) return apiError('Tenant not found', 404);

    return apiSuccess({
      hasPhoneNumber: !!tenant.twilioPhoneNumber,
      phoneNumber: tenant.twilioPhoneNumber,
      subAccountSid: tenant.twilioSubAccountSid,
    });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
