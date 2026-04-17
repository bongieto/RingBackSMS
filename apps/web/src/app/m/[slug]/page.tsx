import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { Logo } from '@/components/Logo';
import { MessageSquare, Phone } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  imageUrl: string | null;
  duration: number | null;
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
        },
      },
    },
  });

  if (!tenant || !tenant.isActive) return null;

  return {
    id: tenant.id,
    name: tenant.name,
    phoneNumber: tenant.twilioPhoneNumber,
    items: tenant.menuItems.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      price: Number(m.price),
      category: m.category,
      imageUrl: m.imageUrl,
      duration: m.duration,
    })),
  };
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const tenant = await loadTenantMenu(params.slug);
  if (!tenant) return { title: 'Menu — RingBackSMS' };
  return {
    title: `${tenant.name} — Menu`,
    description: `See the menu for ${tenant.name} and text your order directly.`,
    robots: { index: false, follow: false },
  };
}

function groupByCategory(items: MenuItem[]): Array<{ category: string; items: MenuItem[] }> {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const cat = item.category || 'Menu';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }
  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
}

export default async function PublicMenuPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantMenu(params.slug);
  if (!tenant) notFound();

  const categories = groupByCategory(tenant.items);
  const hasMenu = tenant.items.length > 0;

  // Pre-fill SMS body ("ORDER") so tapping the button opens the SMS app
  // ready to send. Works on iOS and Android.
  const smsHref = tenant.phoneNumber
    ? `sms:${tenant.phoneNumber}?&body=${encodeURIComponent('ORDER')}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">{tenant.name}</h1>
            <p className="text-xs text-muted-foreground">Text to order</p>
          </div>
          {tenant.phoneNumber && (
            <a
              href={`tel:${tenant.phoneNumber}`}
              className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
        </div>
      </header>

      {/* Menu */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {!hasMenu ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Our menu is being updated.</p>
            <p className="text-sm mt-2">Text us to place an order.</p>
          </div>
        ) : (
          categories.map((group) => (
            <section key={group.category} className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 px-1">
                {group.category}
              </h2>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {group.items.map((item) => (
                  <div key={item.id} className="p-4 flex gap-3">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-900">{item.name}</h3>
                        <span className="font-mono font-semibold text-slate-900 shrink-0">
                          ${item.price.toFixed(2)}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {item.description}
                        </p>
                      )}
                      {item.duration != null && (
                        <p className="text-xs text-slate-500 mt-1">{item.duration} min</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Sticky CTA */}
      {smsHref && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <a
              href={smsHref}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-transform shadow-lg shadow-blue-600/25"
            >
              <MessageSquare className="h-5 w-5" />
              Text to order
            </a>
          </div>
          <p className="text-center text-[10px] text-slate-400 pb-2 px-4">
            Powered by <Link href="/" className="hover:underline">RingBackSMS</Link>
          </p>
        </div>
      )}
    </div>
  );
}
