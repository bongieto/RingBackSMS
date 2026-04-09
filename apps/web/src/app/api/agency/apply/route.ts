import { NextRequest } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  companyName: z.string().max(200).optional().nullable(),
  website: z.string().url().max(500).optional().nullable().or(z.literal('')),
  pitch: z.string().min(20).max(5000),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err: any) {
    return apiError(err?.message ?? 'Invalid body', 400);
  }

  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const email = user.emailAddresses?.[0]?.emailAddress ?? '';
    const fullName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || email;

    // Block if already approved (they're already an agency).
    const existing = await prisma.agencyApplication.findUnique({
      where: { clerkUserId: userId },
    });
    if (existing?.status === 'APPROVED') {
      return apiError('You are already an approved agency partner', 400);
    }

    const app = await prisma.agencyApplication.upsert({
      where: { clerkUserId: userId },
      update: {
        email,
        fullName,
        companyName: body.companyName ?? null,
        website: body.website || null,
        pitch: body.pitch,
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      },
      create: {
        clerkUserId: userId,
        email,
        fullName,
        companyName: body.companyName ?? null,
        website: body.website || null,
        pitch: body.pitch,
      },
    });

    logger.info('Agency application submitted', {
      userId,
      applicationId: app.id,
    });
    return apiSuccess({ id: app.id, status: app.status });
  } catch (err: any) {
    logger.error('[POST /api/agency/apply] failed', { err: err?.message });
    return apiError('Failed to submit application', 500);
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const app = await prisma.agencyApplication.findUnique({
    where: { clerkUserId: userId },
  });
  return apiSuccess(app);
}
