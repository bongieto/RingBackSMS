import { prisma } from './db';

/**
 * Convert a business name to a URL-safe slug.
 *   "The Lumpia House & Truck" → "the-lumpia-house-and-truck"
 *   "Rolando's Tacos"           → "rolandos-tacos"
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function randomSuffix(len = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Generate a unique tenant slug. If the base slug is already taken,
 * appends a random 4-char suffix and retries up to 5 times.
 */
export async function generateUniqueTenantSlug(name: string): Promise<string> {
  const base = slugifyName(name) || 'business';

  // Try base first
  const baseExists = await prisma.tenant.findFirst({
    where: { slug: base },
    select: { id: true },
  });
  if (!baseExists) return base;

  // Collision — try with random suffixes
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomSuffix()}`;
    const exists = await prisma.tenant.findFirst({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }

  // Final fallback — base + timestamp (virtually guaranteed unique)
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}

/**
 * Ensures the tenant has a slug, generating one from its name if missing.
 * Idempotent and safe to call from hot paths. Returns the slug or null if
 * the tenant doesn't exist.
 */
export async function ensureTenantSlug(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) return null;
  if (tenant.slug) return tenant.slug;

  const slug = await generateUniqueTenantSlug(tenant.name);
  try {
    await prisma.tenant.update({ where: { id: tenantId }, data: { slug } });
    return slug;
  } catch {
    // Race — someone else set it; re-read
    const refetched = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    return refetched?.slug ?? null;
  }
}
