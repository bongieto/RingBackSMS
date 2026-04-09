import { NextRequest } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';
import { ensureAgencyForUser } from '@/lib/server/services/agencyService';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  try {
    const app = await prisma.agencyApplication.findUnique({
      where: { id: params.id },
    });
    if (!app) return apiError('Application not found', 404);
    if (app.status === 'APPROVED') {
      return apiSuccess({ id: app.id, status: app.status, alreadyApproved: true });
    }

    // Flip the Clerk user's isAgency flag.
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(app.clerkUserId);
    const merged = {
      ...((user.publicMetadata as Record<string, unknown> | null) ?? {}),
      isAgency: true,
    };
    await clerk.users.updateUser(app.clerkUserId, { publicMetadata: merged });

    // Create the Agency DB row with defaults.
    await ensureAgencyForUser(app.clerkUserId, app.fullName);

    await prisma.agencyApplication.update({
      where: { id: app.id },
      data: {
        status: 'APPROVED',
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });

    logger.info('Agency application approved', {
      applicationId: app.id,
      clerkUserId: app.clerkUserId,
      reviewedBy: userId,
    });

    return apiSuccess({ id: app.id, status: 'APPROVED' });
  } catch (err: any) {
    logger.error('[POST /api/admin/applications/:id/approve] failed', {
      err: err?.message,
    });
    return apiError('Failed to approve application', 500);
  }
}
