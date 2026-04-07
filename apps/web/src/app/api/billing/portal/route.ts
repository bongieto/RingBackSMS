import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { createBillingPortalSession } from '@/lib/server/services/billingService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const PortalSchema = z.object({
  tenantId: z.string().min(1),
  returnUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      logger.error('STRIPE_SECRET_KEY is not set');
      return apiError('Stripe is not configured. Please contact support.', 500);
    }

    const body = PortalSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(authResult)) return authResult;
    const url = await createBillingPortalSession(body.tenantId, body.returnUrl);
    return apiSuccess({ url });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return apiError(err.errors.map((e) => e.message).join('; '), 400);
    }
    logger.error('Billing portal error', { error: err?.message, stack: err?.stack });
    if (err?.message === 'Owner email required to create billing account') {
      return apiError('Please add an owner email in Settings before managing billing', 400);
    }
    if (err?.message === 'No active subscription') {
      return apiError('You don\u2019t have an active subscription to manage yet.', 400);
    }
    return apiError(err?.message ?? 'Internal server error', 500);
  }
}
