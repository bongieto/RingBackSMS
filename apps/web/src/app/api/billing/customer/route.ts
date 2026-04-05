import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createStripeCustomer } from '@/lib/server/services/billingService';
import { z } from 'zod';
import { apiCreated, apiError } from '@/lib/server/response';

const CustomerSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const body = CustomerSchema.parse(await req.json());
    const customerId = await createStripeCustomer(body.tenantId, body.email, body.name);
    return apiCreated({ customerId });
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
