import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { sendTenantOwnerInviteEmail } from '@/lib/server/services/emailService';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['org:admin', 'org:member']).default('org:admin'),
});

/**
 * POST /api/tenants/:id/invite
 *
 * Sends an organization invite via Clerk + a custom welcome email
 * via Resend explaining that the recipient's business has been set
 * up on RingbackSMS by their agency.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;

  let body: z.infer<typeof InviteSchema>;
  try {
    body = InviteSchema.parse(await req.json());
  } catch (err: any) {
    return apiError(err?.message ?? 'Invalid body', 400);
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: { name: true, clerkOrgId: true },
    });
    if (!tenant?.clerkOrgId) {
      return apiError('Tenant has no linked organization', 400);
    }

    // Get the inviter's name for the email
    const { userId } = await auth();
    const clerk = await clerkClient();
    let inviterName = 'Your agency';
    if (userId) {
      try {
        const user = await clerk.users.getUser(userId);
        inviterName =
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          user.emailAddresses?.[0]?.emailAddress ||
          'Your agency';
      } catch {}
    }

    // Send Clerk organization invitation
    await clerk.organizations.createOrganizationInvitation({
      organizationId: tenant.clerkOrgId,
      emailAddress: body.email,
      role: body.role,
      inviterUserId: userId!,
    });

    // Send our custom welcome email via Resend
    await sendTenantOwnerInviteEmail(
      body.email,
      tenant.name,
      inviterName,
    ).catch((err) =>
      logger.warn('Custom invite email failed (Clerk invite still sent)', {
        err,
        tenantId: params.id,
      }),
    );

    logger.info('Tenant owner invited', {
      tenantId: params.id,
      email: body.email,
      role: body.role,
    });

    return apiSuccess({ invited: true, email: body.email, role: body.role });
  } catch (err: any) {
    logger.error('[POST /api/tenants/:id/invite] failed', {
      tenantId: params.id,
      err: err?.message,
    });
    return apiError(err?.message ?? 'Failed to send invitation', 500);
  }
}

/**
 * GET /api/tenants/:id/invite
 *
 * Lists pending and accepted invitations + current members for the
 * org, so the settings UI can show who has access.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: { clerkOrgId: true },
    });
    if (!tenant?.clerkOrgId) {
      return apiSuccess({ members: [], invitations: [] });
    }

    const clerk = await clerkClient();

    // Fetch current members
    const membershipsRes = await clerk.organizations.getOrganizationMembershipList({
      organizationId: tenant.clerkOrgId,
    });
    const memberships = Array.isArray(membershipsRes)
      ? membershipsRes
      : (membershipsRes as any).data ?? [];

    const members = memberships.map((m: any) => ({
      userId: m.publicUserData?.userId ?? null,
      email:
        m.publicUserData?.identifier ??
        m.publicUserData?.emailAddress ??
        null,
      name:
        [m.publicUserData?.firstName, m.publicUserData?.lastName]
          .filter(Boolean)
          .join(' ') || null,
      role: m.role,
      createdAt: m.createdAt,
    }));

    // Fetch pending invitations
    const invitationsRes =
      await clerk.organizations.getOrganizationInvitationList({
        organizationId: tenant.clerkOrgId,
      });
    const invitations = (
      Array.isArray(invitationsRes)
        ? invitationsRes
        : (invitationsRes as any).data ?? []
    ).map((inv: any) => ({
      id: inv.id,
      email: inv.emailAddress,
      role: inv.role,
      status: inv.status,
      createdAt: inv.createdAt,
    }));

    return apiSuccess({ members, invitations });
  } catch (err: any) {
    logger.error('[GET /api/tenants/:id/invite] failed', {
      tenantId: params.id,
      err: err?.message,
    });
    return apiError('Failed to load team', 500);
  }
}
