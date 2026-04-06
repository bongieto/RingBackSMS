import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { createCheckoutSession } from '@/lib/server/services/billingService';
import { Plan } from '@ringback/shared-types';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const CheckoutSchema = z.object({
  tenantId: z.string().min(1),
  plan: z.nativeEnum(Plan),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      logger.error('STRIPE_SECRET_KEY is not set');
      return apiError('Stripe is not configured. Please contact support.', 500);
    }

    const body = CheckoutSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(authResult)) return authResult;
    const url = await createCheckoutSession(body.tenantId, body.plan, body.successUrl, body.cancelUrl);
    return apiSuccess({ url });
  } catch (err: any) {
    logger.error('Checkout error', { error: err.message, stack: err.stack, type: err.type, code: err.code });
    if (err.message === 'Owner email required to create billing account') {
      return apiError('Please add an owner email in Settings before upgrading', 400);
    }
    if (err.message?.startsWith('No Stripe price configured')) {
      return apiError('This plan is not yet available for purchase. Please contact support.', 400);
    }
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
