import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { apiCreated, apiError } from '@/lib/server/response';
import { getCurrentRole } from '@/lib/server/roles';
import { TenantMemberRole } from '@prisma/client';
import { generatePairingCode, PAIRING_CODE_TTL_MS } from '@/lib/server/device';

const BodySchema = z.object({
  label: z.string().trim().min(1).max(64).optional(),
});

/**
 * Manager generates a short-lived pairing code. The mobile device claims
 * it at POST /api/devices/claim. Only OWNER / MANAGER can pair devices.
 */
export async function POST(req: NextRequest) {
  const current = await getCurrentRole();
  if (!current) return apiError('Authentication required', 401);
  if (current.role !== TenantMemberRole.OWNER && current.role !== TenantMemberRole.MANAGER) {
    return apiError('Only owners and managers can pair devices', 403);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError('Invalid request body', 400);

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  const created = await prisma.devicePairingCode.create({
    data: {
      code,
      tenantId: current.tenantId,
      clerkUserId: current.userId,
      expiresAt,
    },
    select: { code: true, expiresAt: true },
  });

  return apiCreated(created);
}
