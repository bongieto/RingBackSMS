import { NextRequest } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ isAgency: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err: any) {
    return apiError(err?.message ?? 'Invalid body', 400);
  }

  try {
    const clerk = await clerkClient();
    const existing = await clerk.users.getUser(params.id);
    const merged = {
      ...(existing.publicMetadata as Record<string, unknown> | null ?? {}),
      isAgency: body.isAgency,
    };
    await clerk.users.updateUser(params.id, { publicMetadata: merged });
    return apiSuccess({ id: params.id, isAgency: body.isAgency });
  } catch (err) {
    console.error('[PATCH /api/admin/users/:id/agency] failed', err);
    return apiError('Failed to update user', 500);
  }
}
