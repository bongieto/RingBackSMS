import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { clerkClient } from '@clerk/nextjs/server';
import { ensureTenantForClerkOrg } from '@/lib/server/services/tenantService';
import { linkTenantToAgency } from '@/lib/server/services/agencyService';
import { isAgencyUser } from '@/lib/server/agency';
import { logger } from '@/lib/server/logger';
import { apiSuccess, apiError } from '@/lib/server/response';

// Clerk webhook payload shape (minimal — we only read what we use).
interface ClerkEvent {
  type: string;
  data: {
    id?: string;
    name?: string | null;
    created_by?: string | null;
    [key: string]: unknown;
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('[clerk webhook] CLERK_WEBHOOK_SECRET not configured');
    return apiError('Webhook not configured', 500);
  }

  const hdrs = await headers();
  const svixId = hdrs.get('svix-id');
  const svixTimestamp = hdrs.get('svix-timestamp');
  const svixSignature = hdrs.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return apiError('Missing svix headers', 400);
  }

  const body = await req.text();

  let evt: ClerkEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    logger.warn('[clerk webhook] signature verification failed', { err });
    return apiError('Invalid signature', 401);
  }

  try {
    if (evt.type === 'organization.created') {
      const { id, name, created_by } = evt.data;
      if (!id) {
        logger.warn('[clerk webhook] organization.created missing id');
        return apiSuccess({ received: true });
      }

      let ownerEmail: string | undefined;
      if (created_by) {
        try {
          const clerk = await clerkClient();
          const user = await clerk.users.getUser(created_by);
          ownerEmail = user.emailAddresses?.[0]?.emailAddress?.toLowerCase();
        } catch (err) {
          logger.warn('[clerk webhook] failed to resolve creator email', {
            err,
            created_by,
          });
        }
      }

      const tenant = await ensureTenantForClerkOrg({
        clerkOrgId: id,
        name,
        ownerEmail,
      });

      // If the Clerk user who created this org is an agency, auto-link
      // the new tenant so future subscription invoices accrue commission.
      if (created_by && (await isAgencyUser(created_by))) {
        try {
          await linkTenantToAgency(tenant.id, created_by);
        } catch (err) {
          logger.warn('[clerk webhook] failed to auto-link agency', { err });
        }
      }

      logger.info('[clerk webhook] organization.created processed', {
        clerkOrgId: id,
        tenantId: tenant.id,
      });
    }
    // Other event types are acknowledged but ignored.
    return apiSuccess({ received: true });
  } catch (err) {
    logger.error('[clerk webhook] handler failed', { err, type: evt.type });
    // 500 so Clerk retries with backoff; the handler is idempotent.
    return apiError('Webhook handler failed', 500);
  }
}
