import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { createCheckoutSession } from '@/lib/server/services/billingService';
import { Plan } from '@ringback/shared-types';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const CheckoutSchema = z.object({
  tenantId: z.string().min(1),
  plan: z.nativeEnum(Plan),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const body = CheckoutSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(authResult)) return authResult;
    const url = await createCheckoutSession(body.tenantId, body.plan, body.successUrl, body.cancelUrl);
    return apiSuccess({ url });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
