import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { createBillingPortalSession } from '@/lib/server/services/billingService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const PortalSchema = z.object({
  tenantId: z.string().min(1),
  returnUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const body = PortalSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(authResult)) return authResult;
    const url = await createBillingPortalSession(body.tenantId, body.returnUrl);
    return apiSuccess({ url });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
