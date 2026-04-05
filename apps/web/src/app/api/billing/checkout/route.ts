import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const body = CheckoutSchema.parse(await req.json());
    const url = await createCheckoutSession(body.tenantId, body.plan, body.successUrl, body.cancelUrl);
    return apiSuccess({ url });
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
