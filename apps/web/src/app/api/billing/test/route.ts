import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(_req: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return apiError('STRIPE_SECRET_KEY not set', 500);
  }

  try {
    // Test Stripe connectivity with a simple fetch (bypass SDK)
    const res = await fetch('https://api.stripe.com/v1/customers?limit=1', {
      headers: {
        'Authorization': `Bearer ${key}`,
      },
    });
    const data = await res.json();
    return apiSuccess({
      status: res.status,
      keyPrefix: key.substring(0, 12) + '...',
      hasCustomers: data?.data?.length > 0,
      customerId: data?.data?.[0]?.id ?? null,
    });
  } catch (err: any) {
    return apiError(`Fetch failed: ${err.message}`, 500);
  }
}
