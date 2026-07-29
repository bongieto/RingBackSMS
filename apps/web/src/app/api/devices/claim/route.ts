import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { apiCreated, apiError } from '@/lib/server/response';
import { resolveTenantRole } from '@/lib/server/roles';
import { generateDeviceToken, hashDeviceToken } from '@/lib/server/device';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/server/rateLimit';
import { logger } from '@/lib/server/logger';

const BodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceLabel: z.string().trim().min(1).max(64),
  platform: z.enum(['android', 'ios']),
});

/**
 * Mobile app exchanges a 6-digit pairing code for a bearer token. The
 * plaintext token is returned ONCE and stored hashed server-side. The
 * code row is marked consumed atomically to prevent double-claim races.
 */
export async function POST(req: NextRequest) {
  // Brute-force guard. This endpoint is unauthenticated by design (the
  // phone doing the pairing has no session yet), codes are 6 digits
  // (1M space) with a 10-minute TTL, and a hit mints a tenant-scoped
  // bearer token — without a limiter, ~60k guesses fit inside one TTL
  // window. 10 attempts/min per IP makes sweeping the space infeasible
  // while leaving room for genuine typos.
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(`device-claim:${ip}`, 10, 60);
  if (!rl.allowed) {
    logger.warn('Device claim rate limited', { ip });
    return rateLimitResponse(rl);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError('Invalid request body', 400);
  const { code, deviceLabel, platform } = parsed.data;

  const token = generateDeviceToken();
  const tokenHash = hashDeviceToken(token);

  try {
    const device = await prisma.$transaction(async (tx) => {
      const pairing = await tx.devicePairingCode.findUnique({
        where: { code },
      });
      if (!pairing) throw new PairingError('Invalid code', 404);
      if (pairing.consumedAt) throw new PairingError('Code already used', 409);
      if (pairing.expiresAt < new Date()) throw new PairingError('Code expired', 410);

      await tx.devicePairingCode.update({
        where: { id: pairing.id },
        data: { consumedAt: new Date() },
      });

      return tx.device.create({
        data: {
          tenantId: pairing.tenantId,
          clerkUserId: pairing.clerkUserId,
          label: deviceLabel,
          platform,
          tokenHash,
        },
        select: { id: true, tenantId: true, clerkUserId: true },
      });
    });

    // Resolve role outside the transaction (non-transactional read is fine).
    // The pairing user's org role is not available here, but resolveTenantRole
    // falls back to TenantMember lookup which is what we want.
    const role = await resolveTenantRole(device.clerkUserId, null, device.tenantId);

    return apiCreated({
      deviceToken: token,
      deviceId: device.id,
      tenantId: device.tenantId,
      userId: device.clerkUserId,
      role,
    });
  } catch (err) {
    if (err instanceof PairingError) return apiError(err.message, err.status);
    logger.error('[POST /api/devices/claim] failed', { err });
    return apiError('Pairing failed', 500);
  }
}

class PairingError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
