import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTenantMenuItems, upsertMenuItem } from '@/lib/server/services/tenantService';
import { z } from 'zod';
import { apiSuccess, apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const items = await getTenantMenuItems(params.id);
    return apiSuccess(items);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}

const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  category: z.string().optional(),
  isAvailable: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  try {
    const body = ItemSchema.parse(await req.json());
    const item = await upsertMenuItem(params.id, body);
    return apiCreated(item);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}
