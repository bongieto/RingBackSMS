import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { createStripeCustomer } from '@/lib/server/services/billingService';
import { z } from 'zod';
import { apiCreated, apiError } from '@/lib/server/response';

const CustomerSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = CustomerSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(body.tenantId);
    if (isNextResponse(authResult)) return authResult;
    const customerId = await createStripeCustomer(body.tenantId, body.email, body.name);
    return apiCreated({ customerId });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
