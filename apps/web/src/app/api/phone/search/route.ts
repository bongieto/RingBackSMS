import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { searchAvailableNumbers } from '@/lib/server/services/twilioService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const SearchSchema = z.object({
  areaCode: z.string().length(3).regex(/^\d{3}$/),
  tenantId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const { areaCode } = SearchSchema.parse(await req.json());
    const numbers = await searchAvailableNumbers(areaCode);
    return apiSuccess(numbers);
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
