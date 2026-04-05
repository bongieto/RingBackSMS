import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const tenantId = z.string().uuid().parse(new URL(request.url).searchParams.get('tenantId'));

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
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
