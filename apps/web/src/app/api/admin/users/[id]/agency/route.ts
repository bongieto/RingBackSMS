import { NextRequest } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { ensureAgencyForUser } from '@/lib/server/services/agencyService';
import { prisma } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  isAgency: z.boolean().optional(),
  defaultRevSharePct: z.number().min(0).max(100).optional(),
});

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

    // Toggle the Clerk metadata flag if provided.
    if (typeof body.isAgency === 'boolean') {
      const merged = {
        ...(existing.publicMetadata as Record<string, unknown> | null ?? {}),
        isAgency: body.isAgency,
      };
      await clerk.users.updateUser(params.id, { publicMetadata: merged });
      // Ensure an Agency DB row exists when flagging on.
      if (body.isAgency) {
        const name =
          [existing.firstName, existing.lastName].filter(Boolean).join(' ') ||
          existing.emailAddresses?.[0]?.emailAddress ||
          null;
        await ensureAgencyForUser(params.id, name);
      }
    }

    // Update rev share % if provided. Requires the user to already be
    // (or be being flipped to) an agency.
    if (typeof body.defaultRevSharePct === 'number') {
      const flag =
        typeof body.isAgency === 'boolean'
          ? body.isAgency
          : Boolean((existing.publicMetadata as Record<string, unknown> | null)?.isAgency);
      if (!flag) return apiError('User must be an agency before setting rev share', 400);
      const agency = await ensureAgencyForUser(params.id);
      await prisma.agency.update({
        where: { id: agency.id },
        data: { defaultRevSharePct: body.defaultRevSharePct },
      });
    }

    return apiSuccess({ id: params.id, ...body });
  } catch (err) {
    console.error('[PATCH /api/admin/users/:id/agency] failed', err);
    return apiError('Failed to update user', 500);
  }
}
