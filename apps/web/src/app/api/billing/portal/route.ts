import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createBillingPortalSession } from '@/lib/server/services/billingService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const PortalSchema = z.object({
  tenantId: z.string().min(1),
  returnUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const body = PortalSchema.parse(await req.json());
    const url = await createBillingPortalSession(body.tenantId, body.returnUrl);
    return apiSuccess({ url });
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
