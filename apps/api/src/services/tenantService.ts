import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// NOTE: Tenant CRUD (create, read, update config, menu, flows) is handled
// by the Next.js app routes under apps/web/src/app/api/tenants. The former
// Express implementations were removed because they diverged from the
// canonical versions (missing business-type profile seeding and tenant
// ownership checks). Only functions still used by admin-only routes
// remain here.

export async function listTenants(page = 1, pageSize = 20) {
  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        businessType: true,
        plan: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.tenant.count(),
  ]);

  return { tenants, total };
}
