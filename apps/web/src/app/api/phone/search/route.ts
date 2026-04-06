import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { searchAvailableNumbers, searchNearbyNumbers } from '@/lib/server/services/twilioService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

// Allow up to 30s for Twilio API calls (exact + nearby fallback)
export const maxDuration = 30;

const SearchSchema = z.object({
  areaCode: z.string().length(3).regex(/^\d{3}$/),
  tenantId: z.string().uuid(),
});

/** Wraps a promise with a timeout — rejects if it takes too long */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const { areaCode } = SearchSchema.parse(await req.json());

    // Try exact area code first (10s timeout)
    let numbers: Array<{ phoneNumber: string; friendlyName: string }> = [];
    try {
      numbers = await withTimeout(searchAvailableNumbers(areaCode), 10_000, 'Exact area code search');
    } catch {
      // Timeout on exact search — fall through to nearby
    }

    if (numbers.length > 0) {
      return apiSuccess({
        numbers,
        isAlternative: false,
        searchedAreaCode: areaCode,
      });
    }

    // No exact matches — search nearby area codes (15s timeout)
    let nearbyNumbers: Array<{ phoneNumber: string; friendlyName: string }> = [];
    try {
      nearbyNumbers = await withTimeout(searchNearbyNumbers(areaCode), 15_000, 'Nearby number search');
    } catch {
      // Timeout on nearby search — return empty with message
    }

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
