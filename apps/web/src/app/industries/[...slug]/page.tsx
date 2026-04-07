import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { ArrowRight, Check, ChevronRight, Star, TrendingUp } from 'lucide-react';
import {
  getIndustryLanding,
  getAllIndustrySlugPaths,
  getNichesForHub,
  getHeroImage,
  INDUSTRY_LANDING,
  type HubSlug,
} from '@/lib/industryLandingData';
import { MobileNav } from '@/components/landing/MobileNav';
import { PricingSection } from '@/components/landing/PricingSection';
import { IndustryJsonLd } from './IndustryJsonLd';
import { Logo } from '@/components/Logo';

const SITE_URL = 'https://ring-back-sms.vercel.app';

const PRICING_PLANS = [
  {
    name: 'Starter',
    monthlyPrice: 'Free',
    annualPrice: 'Free',
    monthlyPeriod: 'forever',
    annualPeriod: 'forever',
    annualSavings: '',
    description: 'Try it risk-free',
    sms: '25 SMS/month',
    features: ['1 phone number', 'AI fallback responses', 'Voicemail transcription & tags', 'Reply templates', 'Email notifications'],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Growth',
    monthlyPrice: '$49',
    annualPrice: '$490',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: 'Save $98',
    description: 'Most small shops',
    sms: '500 SMS/month',
    features: ['Everything in Starter', 'Order, Meeting & Inquiry flows', 'POS integration (Square, Clover, Toast, Shopify)', 'Caller memory & reorder shortcuts', 'Custom AI personality', 'Daily digest email', 'Priority support'],
    cta: 'Start 14-day trial',
    highlighted: true,
  },
  {
    name: 'Scale',
    monthlyPrice: '$99',
    annualPrice: '$990',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: 'Save $198',
    description: 'Multi-tech / multi-location',
    sms: '2,500 SMS/month',
    features: ['Everything in Growth', 'Slack notifications', 'Two-way POS catalog sync', 'Recovery funnel analytics', 'Urgency keyword escalation', 'AI ↔ human handoff tracking'],
    cta: 'Start 14-day trial',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    monthlyPrice: 'Custom',
    annualPrice: 'Custom',
    monthlyPeriod: '',
    annualPeriod: '',
    annualSavings: '',
    description: 'Custom needs',
    sms: 'Unlimited SMS',
    features: ['Everything in Scale', 'Dedicated infrastructure', 'SLA & compliance', 'White-glove onboarding'],
    cta: 'Contact us',
    highlighted: false,
  },
];

/* ─── Static params & metadata ───────────────────────────────────────── */

export function generateStaticParams() {
  return getAllIndustrySlugPaths().map((slug) => ({ slug }));
}

interface PageProps {
  params: { slug: string[] };
}

export function generateMetadata({ params }: PageProps): Metadata {
  const slugKey = params.slug.join('/');
  const entry = getIndustryLanding(slugKey);
  if (!entry) return {};
  const canonical = `${SITE_URL}/industries/${slugKey}`;
  return {
    title: entry.seo.title,
    description: entry.seo.description,
    keywords: entry.seo.keywords,
    alternates: { canonical },
    openGraph: {
      title: entry.seo.title,
      description: entry.seo.description,
      url: canonical,
      siteName: 'RingBackSMS',
      type: 'website',
      locale: 'en_US',
      images: [{ url: entry.seo.ogImage ?? '/og-image.png', width: 1200, height: 630, alt: entry.seo.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: entry.seo.title,
      description: entry.seo.description,
      images: [entry.seo.ogImage ?? '/og-image.png'],
    },
    robots: { index: true, follow: true },
  };
}

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function IndustryLandingPage({ params }: PageProps) {
  if (params.slug.length < 1 || params.slug.length > 2) notFound();
  const slugKey = params.slug.join('/');
  const entry = getIndustryLanding(slugKey);
  if (!entry) notFound();

  const parentHub = entry.kind === 'niche' && entry.parent ? INDUSTRY_LANDING[entry.parent] : null;
  const relatedNiches =
    entry.kind === 'hub'
      ? getNichesForHub(entry.slug as HubSlug)
      : entry.parent
        ? getNichesForHub(entry.parent).filter((n) => n.slug !== entry.slug)
        : [];

  const HubIcon = entry.hubIcon;

  return (
    <div className="min-h-screen bg-white">
      <IndustryJsonLd entry={entry} siteUrl={SITE_URL} />

      {/* ─── Nav ───────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo size="md" variant="light" />
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link href="/industries" className="hover:text-blue-600">Industries</Link>
            <Link href="/#features" className="hover:text-blue-600">Features</Link>
            <Link href="/#pricing" className="hover:text-blue-600">Pricing</Link>
            <Link href="/#faq" className="hover:text-blue-600">FAQ</Link>
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

      {/* ─── Breadcrumbs ───────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm text-slate-500">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/industries" className="hover:text-blue-600">Industries</Link>
          {parentHub && (
            <>
              <ChevronRight className="h-4 w-4" />
              <Link href={`/industries/${parentHub.slug}`} className="hover:text-blue-600">{parentHub.hero.eyebrow.replace(/^For /, '')}</Link>
            </>
          )}
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 font-medium">{entry.hero.eyebrow.replace(/^For /, '')}</span>
        </nav>
      </div>

      {/* ─── Hero ──────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: `url('${getHeroImage(entry)}')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/90 via-white/80 to-white" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mb-6">
                <HubIcon className="h-4 w-4" />
                {entry.hero.eyebrow}
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
                {entry.hero.headline}
              </h1>
              <p className="mt-6 text-lg text-slate-600 leading-relaxed">
                {entry.hero.subheadline}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href={entry.hero.primaryCta.href}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  {entry.hero.primaryCta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/#how-it-works"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                >
                  See How It Works
                </Link>
              </div>
              <p className="mt-4 text-sm text-slate-500">Free plan forever. No credit card required.</p>
            </div>

            {/* SMS mockup */}
            <div className="mx-auto w-full max-w-sm">
              <div className="bg-slate-900 rounded-[2.5rem] p-3 shadow-2xl">
                <div className="bg-white rounded-[2rem] overflow-hidden">
                  <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                    <div className="text-xs font-semibold text-slate-900">{entry.hero.smsMockup.businessName}</div>
                    <div className="text-[10px] text-slate-500">Text Message • Now</div>
                  </div>
                  <div className="p-4 space-y-2 min-h-[340px]">
                    {entry.hero.smsMockup.messages.map((m, i) => (
                      <div key={i} className={m.from === 'bot' ? 'flex justify-start' : 'flex justify-end'}>
                        <div
                          className={
                            m.from === 'bot'
                              ? 'max-w-[75%] bg-slate-200 text-slate-900 rounded-2xl rounded-bl-sm px-3 py-2 text-xs'
                              : 'max-w-[75%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-3 py-2 text-xs'
                          }
                        >
                          {m.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stat bar ──────────────────────────────────────────────── */}
      <section className="py-10 border-y border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {entry.statBar.map((s) => (
            <div key={s.label}>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-600 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Pain points ──────────────────────────────────────────── */}
      {entry.painPoints.length > 0 && (
        <section className="py-20 sm:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 text-center max-w-2xl mx-auto">
              You know this pain
            </h2>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {entry.painPoints.map((p) => (
                <div key={p.title} className="rounded-2xl p-6 bg-red-50/60 border border-red-100">
                  <h3 className="font-bold text-slate-900 mb-2">{p.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Benefits ─────────────────────────────────────────────── */}
      {entry.benefits.length > 0 && (
        <section className="py-20 sm:py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">What you get</h2>
              <p className="mt-4 text-lg text-slate-600">Every feature built for how your business actually runs.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {entry.benefits.map((b) => (
                <div key={b.title} className="bg-white rounded-2xl p-6 border border-slate-200">
                  <b.icon className="h-7 w-7 text-blue-600 mb-4" />
                  <h3 className="font-bold text-slate-900 mb-2">{b.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── How it works ─────────────────────────────────────────── */}
      {entry.howItWorks.length > 0 && (
        <section className="py-20 sm:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 text-center max-w-2xl mx-auto">
              How it works
            </h2>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {entry.howItWorks.map((s) => (
                <div key={s.step} className="relative rounded-2xl p-6 bg-blue-50/40 border border-blue-100">
                  <div className="text-xs font-bold text-blue-600 mb-2">{s.step}</div>
                  <h3 className="font-bold text-slate-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Testimonials ─────────────────────────────────────────── */}
      {entry.testimonials.length > 0 && (
        <section className="py-20 sm:py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 text-center max-w-2xl mx-auto">
              From businesses like yours
            </h2>
            <div className="mt-12 grid md:grid-cols-3 gap-8">
              {entry.testimonials.map((t) => (
                <div key={t.name} className="bg-white rounded-2xl p-8 border border-slate-200">
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <blockquote className="text-slate-700 leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</blockquote>
                  <div className="text-sm">
                    <div className="font-semibold text-slate-900">{t.name}</div>
                    <div className="text-slate-500">{t.role}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 mt-8">
              *Representative examples. Customer names and figures are illustrative.
            </p>
          </div>
        </section>
      )}

      {/* ─── Related niches ──────────────────────────────────────── */}
      {relatedNiches.length > 0 && (
        <section className="py-20 sm:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 text-center">
              {entry.kind === 'hub' ? 'Popular in this category' : 'Related businesses'}
            </h2>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedNiches.map((n) => (
                <Link
                  key={n.slug}
                  href={`/industries/${n.slug}`}
                  className="rounded-2xl p-6 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-slate-900 group-hover:text-blue-700">{n.hero.headline}</h3>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 shrink-0 mt-1" />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{n.hero.subheadline}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Pricing ──────────────────────────────────────────────── */}
      <PricingSection plans={PRICING_PLANS} />

      {/* ─── FAQs ────────────────────────────────────────────────── */}
      {entry.faqs.length > 0 && (
        <section className="py-20 sm:py-24 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 text-center">
              Frequently asked questions
            </h2>
            <div className="mt-10 space-y-4">
              {entry.faqs.map((f, i) => (
                <details key={i} className="group rounded-xl border border-slate-200 bg-white p-6 open:bg-slate-50">
                  <summary className="cursor-pointer font-semibold text-slate-900 list-none flex justify-between items-start gap-4">
                    {f.q}
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Final CTA ───────────────────────────────────────────── */}
      <section className="py-20 sm:py-24 bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Stop losing customers to voicemail</h2>
          <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
            Free to start. Set up in 5 minutes. Recover every missed call — starting today.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href={entry.hero.primaryCta.href}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-colors"
            >
              <Check className="h-5 w-5" />
              {entry.hero.primaryCta.label}
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-12 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between gap-6">
          <div>
            <div className="mb-2"><Logo size="sm" variant="dark" /></div>
            <div>Never miss a customer again.</div>
          </div>
          <div className="flex gap-6 flex-wrap">
            <Link href="/industries" className="hover:text-white">Industries</Link>
            <Link href="/help" className="hover:text-white">Help</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
