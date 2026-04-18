import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { PublicMenuClient } from './_components/PublicMenuClient';

export const dynamic = 'force-dynamic';

interface ModifierOption {
  id: string;
  name: string;
  priceAdjust: number;
  isDefault: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: ModifierOption[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  imageUrl: string | null;
  duration: number | null;
  modifierGroups: ModifierGroup[];
}

interface TenantMenu {
  id: string;
  name: string;
  phoneNumber: string | null;
  items: MenuItem[];
}

async function loadTenantMenu(slug: string): Promise<TenantMenu | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: slug.toLowerCase() },
    select: {
      id: true,
      name: true,
      twilioPhoneNumber: true,
      isActive: true,
      menuItems: {
        // Items pass the item-level filter here; the category filter
        // runs post-query because Prisma can't express `OR` across a
        // nullable relation's field in a single `where`.
        where: { isAvailable: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          category: true,
          imageUrl: true,
          duration: true,
          categoryRef: { select: { isAvailable: true } },
          modifierGroups: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              selectionType: true,
              required: true,
              minSelections: true,
              maxSelections: true,
              modifiers: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  name: true,
                  priceAdjust: true,
                  isDefault: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!tenant || !tenant.isActive) return null;

  return {
    id: tenant.id,
    name: tenant.name,
    phoneNumber: tenant.twilioPhoneNumber,
    items: tenant.menuItems
      // Hide items whose category has been marked unavailable — gives
      // operators a "mute this whole section" switch without having to
      // toggle every item individually.
      .filter((m) => (m.categoryRef?.isAvailable ?? true) !== false)
      .map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        price: Number(m.price),
        category: m.category,
        imageUrl: m.imageUrl,
        duration: m.duration,
        modifierGroups: m.modifierGroups.map((g) => ({
          id: g.id,
          name: g.name,
          selectionType: (g.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE') as 'SINGLE' | 'MULTIPLE',
          required: g.required,
          minSelections: g.minSelections,
          maxSelections: g.maxSelections,
          modifiers: g.modifiers.map((mod) => ({
            id: mod.id,
            name: mod.name,
            priceAdjust: Number(mod.priceAdjust),
            isDefault: mod.isDefault,
          })),
        })),
      })),
  };
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const tenant = await loadTenantMenu(params.slug);
  if (!tenant) {
    return {
      title: 'Menu',
      openGraph: { title: 'Menu', siteName: 'Menu' },
    };
  }
  const title = `Menu — ${tenant.name}`;
  const description = `Browse the menu for ${tenant.name} and text your order directly.`;
  return {
    title,
    description,
    // iMessage / SMS rich-link previews read Open Graph tags. Setting
    // `siteName` to "Menu" makes the preview card show "Menu" instead of
    // the bare domain (ringbacksms.com), which confuses customers.
    openGraph: {
      title,
      description,
      siteName: 'Menu',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    robots: { index: false, follow: false },
  };
}

export default async function PublicMenuPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantMenu(params.slug);
  if (!tenant) notFound();

  // Rendering + interactivity happens in a client component so we can
  // maintain the quantity-per-item state and build the sms: prefill body
  // locally. Data fetch stays server-side.
  return (
    <PublicMenuClient
      tenantName={tenant.name}
      phoneNumber={tenant.phoneNumber}
      items={tenant.items}
    />
  );
}
