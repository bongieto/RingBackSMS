import { prisma } from './db';

export interface TenantBranding {
  name: string;
  brandColor: string | null;
  brandLogoUrl: string | null;
  hidePoweredBy: boolean;
}

/**
 * Load tenant branding for public pages (/m /o /r /pay). Returns a
 * default-friendly shape so callers can consume without null checks.
 */
export async function loadTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      config: { select: { brandColor: true, brandLogoUrl: true, hidePoweredBy: true } },
    },
  });
  if (!tenant) return null;
  return {
    name: tenant.name,
    brandColor: tenant.config?.brandColor ?? null,
    brandLogoUrl: tenant.config?.brandLogoUrl ?? null,
    hidePoweredBy: tenant.config?.hidePoweredBy ?? false,
  };
}
