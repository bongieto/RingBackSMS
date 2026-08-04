import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { isAvailableAtAnyActiveLocation } from '@/lib/server/commerce/menuAvailability';

export const dynamic = 'force-dynamic';

/**
 * Public GET /api/public/tenants/:slug/menu
 *
 * Unauthenticated endpoint for the customer-facing menu page at /m/:slug.
 * Returns business name, phone, and available menu items grouped by category.
 * No sensitive data — safe to expose.
 */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      twilioPhoneNumber: true,
      isActive: true,
      locations: { where: { isActive: true }, select: { id: true } },
      menuItems: {
        where: { isAvailable: true, posDeletedAt: null },
        orderBy: [{ categoryRef: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          isAvailable: true,
          name: true,
          description: true,
          price: true,
          category: true,
          imageUrl: true,
          duration: true,
          categoryRef: { select: { isAvailable: true } },
          locationAvailability: {
            where: { location: { isActive: true } },
            select: { isAvailable: true },
          },
        },
      },
    },
  });

  if (!tenant || !tenant.isActive) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    name: tenant.name,
    phoneNumber: tenant.twilioPhoneNumber,
    items: tenant.menuItems
      .filter(
        (m) =>
          (m.categoryRef?.isAvailable ?? true) !== false &&
          isAvailableAtAnyActiveLocation(m, tenant.locations.length)
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        price: Number(m.price),
        category: m.category,
        imageUrl: m.imageUrl,
        duration: m.duration,
      })),
  });
}
