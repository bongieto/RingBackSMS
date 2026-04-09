import { auth, clerkClient } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isAgencyUser, isSuperAdmin } from '@/lib/server/agency';
import { ensureAgencyForUser } from '@/lib/server/services/agencyService';
import { prisma } from '@/lib/server/db';
import {
  createConnectExpressAccount,
  createConnectAccountLink,
} from '@/lib/server/services/billingService';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  if (!isSuperAdmin(userId) && !(await isAgencyUser(userId))) {
    return apiError('Not an agency', 403);
  }

  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const email = user.emailAddresses?.[0]?.emailAddress;

    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || email || null;
    let agency = await ensureAgencyForUser(userId, name);

    // Create the Connect account if missing.
    if (!agency.stripeConnectAccountId) {
      const accountId = await createConnectExpressAccount({
        email: email ?? undefined,
        clerkUserId: userId,
        agencyId: agency.id,
      });
      agency = await prisma.agency.update({
        where: { id: agency.id },
        data: { stripeConnectAccountId: accountId },
      });
      logger.info('Created Stripe Connect account', {
        agencyId: agency.id,
        accountId,
      });
    }

    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ??
      'https://ringbacksms.com';
    const url = await createConnectAccountLink(
      agency.stripeConnectAccountId!,
      `${base}/partner/settings?connect=success`,
      `${base}/partner/settings?connect=refresh`,
    );
    return apiSuccess({ url });
  } catch (err: any) {
    logger.error('[POST /api/agency/connect/onboard] failed', {
      err: err?.message,
    });
    return apiError(err?.message ?? 'Failed to start Connect onboarding', 500);
  }
}
