import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { searchAvailableNumbers, searchNearbyNumbers } from '@/lib/server/services/twilioService';
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

    // Try exact area code first
    const numbers = await searchAvailableNumbers(areaCode);

    if (numbers.length > 0) {
      return apiSuccess({
        numbers,
        isAlternative: false,
        searchedAreaCode: areaCode,
      });
    }

    // No exact matches — search nearby area codes
    const nearbyNumbers = await searchNearbyNumbers(areaCode);

    return apiSuccess({
      numbers: nearbyNumbers,
      isAlternative: true,
      searchedAreaCode: areaCode,
      message: nearbyNumbers.length > 0
        ? `No numbers available in area code ${areaCode}. Here are nearby numbers from your area:`
        : `No numbers available in or near area code ${areaCode}. Try a different area code.`,
    });
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
