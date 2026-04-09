import { prisma } from '../db';
import { logger } from '../logger';

/**
 * Idempotent: returns the Agency row for the given Clerk user, creating
 * one with defaults (20% rev share) if missing. Use this whenever you
 * need to touch an agency — it guarantees the row exists.
 */
export async function ensureAgencyForUser(clerkUserId: string, name?: string | null) {
  const existing = await prisma.agency.findUnique({ where: { clerkUserId } });
  if (existing) return existing;
  return prisma.agency.create({
    data: {
      clerkUserId,
      name: name ?? null,
    },
  });
}

/**
 * Links an existing Tenant to the agency owned by `clerkUserId`.
 * Idempotent: no-op if the tenant is already linked to the same agency.
 * Creates the Agency row if it doesn't exist.
 */
export async function linkTenantToAgency(tenantId: string, clerkUserId: string) {
  const agency = await ensureAgencyForUser(clerkUserId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, agencyId: true },
  });
  if (!tenant) return null;
  if (tenant.agencyId === agency.id) return agency;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { agencyId: agency.id },
  });
  logger.info('Linked tenant to agency', { tenantId, agencyId: agency.id, clerkUserId });
  return agency;
}

/**
 * Reads the current rev share % for an agency. Returns a plain number,
 * not a Prisma Decimal, for easier arithmetic.
 */
export async function getAgencyRevSharePct(agencyId: string): Promise<number> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { defaultRevSharePct: true },
  });
  if (!agency) return 0;
  return Number(agency.defaultRevSharePct);
}
