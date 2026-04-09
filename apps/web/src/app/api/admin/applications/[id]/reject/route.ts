import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ notes: z.string().max(2000).optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  let body: z.infer<typeof BodySchema> = {};
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    // empty body is fine
  }

  try {
    const app = await prisma.agencyApplication.findUnique({
      where: { id: params.id },
    });
    if (!app) return apiError('Application not found', 404);
    if (app.status === 'APPROVED') {
      return apiError('Cannot reject an already-approved application', 400);
    }

    await prisma.agencyApplication.update({
      where: { id: app.id },
      data: {
        status: 'REJECTED',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: body.notes ?? null,
      },
    });

    logger.info('Agency application rejected', {
      applicationId: app.id,
      clerkUserId: app.clerkUserId,
      reviewedBy: userId,
    });

    return apiSuccess({ id: app.id, status: 'REJECTED' });
  } catch (err: any) {
    logger.error('[POST /api/admin/applications/:id/reject] failed', {
      err: err?.message,
    });
    return apiError('Failed to reject application', 500);
  }
}
