import { auth } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

type PosHealth = 'ok' | 'expiring' | 'expired' | 'not_set_up';

function posHealth(
  provider: string | null,
  expiresAt: Date | null,
): PosHealth {
  if (!provider) return 'not_set_up';
  if (!expiresAt) return 'ok'; // provider set but no expiry tracked
  const now = Date.now();
  const exp = expiresAt.getTime();
  if (exp < now) return 'expired';
  if (exp < now + 48 * 60 * 60 * 1000) return 'expiring';
  return 'ok';
}

export async function GET() {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const tenants = await prisma.tenant.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      plan: true,
      isActive: true,
      twilioPhoneNumber: true,
      twilioSubAccountSid: true,
      posProvider: true,
      posMerchantId: true,
      posLocationId: true,
      posTokenExpiresAt: true,
    },
  });

  const rows = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    plan: t.plan,
    isActive: t.isActive,
    twilioPhoneNumber: t.twilioPhoneNumber,
    twilioSubAccountSid: t.twilioSubAccountSid,
    pos: {
      provider: t.posProvider,
      merchantId: t.posMerchantId,
      locationId: t.posLocationId,
      tokenExpiresAt: t.posTokenExpiresAt,
      health: posHealth(t.posProvider, t.posTokenExpiresAt),
    },
  }));

  return apiSuccess(rows);
}
