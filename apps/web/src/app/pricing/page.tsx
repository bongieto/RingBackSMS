import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { Check, X, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Pricing — RingBackSMS | Plans Starting Free',
  description:
    'RingBackSMS pricing plans. Start free with 50 SMS/month. Pro at $49/mo, Business at $129/mo, Scale at $299/mo. No contracts, cancel anytime. AI-powered missed call recovery for small businesses.',
  alternates: { canonical: 'https://ringbacksms.com/pricing' },
  openGraph: {
    title: 'RingBackSMS Pricing — Start Free',
    description:
      'AI missed call recovery starting at $0/month. Plans for every business size.',
    url: 'https://ringbacksms.com/pricing',
  },
};

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'RingBackSMS',
  description: 'AI-powered missed call recovery and SMS automation platform for small businesses.',
  brand: { '@type': 'Brand', name: 'RingBackSMS' },
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD',
      description: '50 SMS/mo, 25 AI calls/mo. Perfect for trying it out.',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '49',
      priceCurrency: 'USD',
      description: '1,000 SMS/mo, 500 AI calls/mo. All flow types and analytics.',
    },
    {
      '@type': 'Offer',
      name: 'Business',
      price: '129',
      priceCurrency: 'USD',
      description: '5,000 SMS/mo, 2,500 AI calls/mo. POS integration and full analytics.',
    },
    {
      '@type': 'Offer',
      name: 'Scale',
      price: '299',
      priceCurrency: 'USD',
      description: '20,000 SMS/mo, unlimited AI calls. API access and multi-location support.',
    },
  ],
};

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'Try it out — no credit card required',
    features: [
      { label: '50 SMS / month', included: true },
      { label: '25 AI calls / month', included: true },
      { label: '1 phone number', included: true },
      { label: '1 team member', included: true },
      { label: 'Fallback flow only', included: true },
      { label: 'POS integration', included: false },
      { label: 'Custom flows', included: false },
    ],
    cta: 'Start Free',
    href: '/sign-up',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/mo',
    description: 'For growing businesses that miss calls daily',
    features: [
      { label: '1,000 SMS / month', included: true },
      { label: '500 AI calls / month', included: true },
      { label: '1 phone number', included: true },
      { label: '3 team members', included: true },
      { label: 'All flow types', included: true },
      { label: 'Basic analytics', included: true },
      { label: 'POS integration', included: false },
    ],
    cta: 'Start Free Trial',
    href: '/sign-up',
    highlight: true,
  },
  {
    name: 'Business',
    price: '$129',
    period: '/mo',
    description: 'For busy multi-staff shops with high call volume',
    features: [
      { label: '5,000 SMS / month', included: true },
      { label: '2,500 AI calls / month', included: true },
      { label: '3 phone numbers', included: true },
      { label: '10 team members', included: true },
      { label: 'All flows + custom', included: true },
      { label: 'POS integration', included: true },
      { label: 'Full analytics', included: true },
    ],
    cta: 'Start Free Trial',
    href: '/sign-up',
    highlight: false,
  },
  {
    name: 'Scale',
    price: '$299',
    period: '/mo',
    description: 'For agencies and multi-location operations',
    features: [
      { label: '20,000 SMS / month', included: true },
      { label: 'Unlimited AI calls', included: true },
      { label: 'Unlimited phone numbers', included: true },
      { label: 'Unlimited team members', included: true },
      { label: 'API access', included: true },
      { label: 'Multi-location', included: true },
      { label: 'POS + everything', included: true },
    ],
    cta: 'Start Free Trial',
    href: '/sign-up',
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />

      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo size="md" variant="light" />
          <div className="flex items-center gap-4">
            <Link href="/help" className="text-sm text-slate-600 hover:text-slate-900">
              Help
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Start free. Upgrade when you need more SMS. No contracts, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-blue-600 ring-2 ring-blue-600/20 relative'
                  : 'border-slate-200'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
              <div className="mt-2 mb-1">
                <span className="text-3xl font-extrabold text-slate-900">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-slate-500 text-sm">{plan.period}</span>
                )}
              </div>
              <p className="text-sm text-slate-500 mb-6">{plan.description}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li
                    key={f.label}
                    className="flex items-center gap-2 text-sm"
                  >
                    {f.included ? (
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-slate-300 shrink-0" />
                    )}
                    <span
                      className={
                        f.included ? 'text-slate-700' : 'text-slate-400'
                      }
                    >
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2.5 rounded-lg font-medium text-sm ${
                  plan.highlight
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'Do I need a credit card to start?',
                a: 'No. The Free plan is completely free with no credit card required. You can upgrade anytime from your dashboard.',
              },
              {
                q: 'What happens if I go over my SMS limit?',
                a: 'Overage SMS are billed at $0.03 each on top of your plan. We\'ll notify you when you\'re approaching your limit so you can upgrade if it makes sense.',
              },
              {
                q: 'Can I switch plans at any time?',
                a: 'Yes. Upgrades take effect immediately. Downgrades take effect at the end of your current billing period.',
              },
              {
                q: 'Is there a long-term contract?',
                a: 'No. All plans are month-to-month. Cancel anytime from your dashboard — no penalties, no hassle.',
              },
              {
                q: 'Do you offer annual pricing?',
                a: 'Yes. Pay annually and save 2 months. Annual pricing is available for Pro, Business, and Scale plans.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-slate-200 pb-4">
                <h3 className="font-semibold text-slate-900 mb-1">{q}</h3>
                <p className="text-sm text-slate-600">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 text-lg"
          >
            Get Started Free
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="text-sm text-slate-500 mt-3">
            No credit card required · Set up in under 5 minutes
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <Logo size="sm" variant="light" />
          <div className="flex gap-4">
            <Link href="/about" className="hover:text-slate-700">About</Link>
            <Link href="/privacy" className="hover:text-slate-700">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-700">Terms</Link>
            <Link href="/help" className="hover:text-slate-700">Help</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
