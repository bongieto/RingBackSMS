import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { getHubs, getNichesForHub, type HubSlug } from '@/lib/industryLandingData';
import { MobileNav } from '@/components/landing/MobileNav';
import { Logo } from '@/components/Logo';

const SITE_URL = 'https://ringbacksms.com';

export const metadata: Metadata = {
  title: 'Industries We Serve — Restaurants, Services, Retail | RingBackSMS',
  description:
    'RingBackSMS builds SMS auto-response for small businesses in hospitality, services, and retail. Explore landing pages for your vertical.',
  alternates: { canonical: `${SITE_URL}/industries` },
  openGraph: {
    title: 'Industries We Serve — RingBackSMS',
    description: 'SMS auto-response landing pages for restaurants, service businesses, and retail shops.',
    url: `${SITE_URL}/industries`,
    siteName: 'RingBackSMS',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RingBackSMS — Industries' }],
  },
  robots: { index: true, follow: true },
};

export default function IndustriesIndexPage() {
  const hubs = getHubs();
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo size="md" variant="light" />
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link href="/industries" className="text-blue-600">Industries</Link>
            <Link href="/#features" className="hover:text-blue-600">Features</Link>
            <Link href="/#pricing" className="hover:text-blue-600">Pricing</Link>
            <SignedOut>
              <Link href="/sign-in" className="hover:text-blue-600">Sign In</Link>
              <Link href="/sign-up" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Start Free</Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Dashboard</Link>
            </SignedIn>
          </div>
          <MobileNav />
        </div>
      </nav>

      {/* Breadcrumbs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm text-slate-500">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 font-medium">Industries</span>
        </nav>
      </div>

      {/* Hero */}
      <section className="py-16 sm:py-20 bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900">Built for how your business actually runs</h1>
          <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">
            RingBackSMS adapts to your vertical — restaurants take orders, service pros book jobs, retailers answer product inquiries. Pick yours below.
          </p>
        </div>
      </section>

      {/* Hub list */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
          {hubs.map((hub) => {
            const niches = getNichesForHub(hub.slug as HubSlug);
            const HubIcon = hub.hubIcon;
            return (
              <div key={hub.slug}>
                <div className="flex items-start justify-between gap-6 mb-8">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mb-3">
                      <HubIcon className="h-4 w-4" />
                      {hub.hero.eyebrow}
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{hub.hero.headline}</h2>
                    <p className="mt-3 text-slate-600 max-w-3xl">{hub.hero.subheadline}</p>
                  </div>
                  <Link
                    href={`/industries/${hub.slug}`}
                    className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0"
                  >
                    View hub
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                {niches.length > 0 && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {niches.map((n) => (
                      <Link
                        key={n.slug}
                        href={`/industries/${n.slug}`}
                        className="rounded-2xl p-5 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-slate-900 group-hover:text-blue-700 text-sm">{n.hero.headline}</h3>
                          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 shrink-0 mt-1" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
