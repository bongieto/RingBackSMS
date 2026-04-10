import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { ArrowRight, Heart, Phone, Zap, Users, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About RingBackSMS — Our Story | Agape Technology Solutions',
  description:
    'RingBackSMS is an AI-powered missed call recovery platform built by Agape Technology Solutions. Founded by Rolando Cabral Jr., a nurse-turned-CIO-turned-SaaS-founder with a mission to help small businesses never lose another customer to a missed call.',
  alternates: { canonical: 'https://ringbacksms.com/about' },
  openGraph: {
    title: 'About RingBackSMS — Our Story',
    description:
      'Meet the team behind the AI that texts back your missed calls. Built by a nurse-turned-tech-founder who knows what it means to serve.',
    url: 'https://ringbacksms.com/about',
  },
};

const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Rolando Cabral Jr.',
  jobTitle: 'Founder & CEO',
  worksFor: {
    '@type': 'Organization',
    name: 'Agape Technology Solutions',
    url: 'https://agapehealthtech.com',
  },
  knowsAbout: [
    'Healthcare IT',
    'SaaS Development',
    'AI-powered Communication',
    'Small Business Technology',
  ],
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />

      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Built for small businesses, by someone who gets it.
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            RingBackSMS is an AI-powered missed call recovery platform that
            helps local businesses capture every customer — even when they
            can&apos;t pick up the phone.
          </p>
        </div>

        {/* Founder Story */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Heart className="h-6 w-6 text-blue-600" />
            The Founder Story
          </h2>
          <div className="prose prose-slate max-w-none text-slate-700 space-y-4">
            <p>
              <strong>Rolando Cabral Jr.</strong> started his career as a registered nurse,
              spending years at the bedside caring for patients. That experience taught him
              something every small business owner knows: when someone reaches out for help,
              every second counts.
            </p>
            <p>
              Rolando transitioned into healthcare IT, eventually becoming a Chief Information
              Officer responsible for the technology infrastructure of entire organizations.
              He saw firsthand how the right technology — deployed at the right moment — could
              transform outcomes.
            </p>
            <p>
              Rolando also owns <strong>The Lumpia House</strong>, a successful Filipino
              restaurant in Central Illinois. Running his own restaurant gave him a
              front-row seat to the problem: missed calls during the lunch rush meant
              lost catering orders, missed pickup requests, and frustrated customers who
              simply called the next place on the list.
            </p>
            <p>
              That firsthand experience as both a tech leader and a restaurant owner led
              him to launch <strong>Agape Technology Solutions</strong> with a clear
              mission: bring enterprise-grade intelligence to the businesses that need it
              most — the local restaurant that misses a lunch rush call, the salon that
              loses a booking while blow-drying, the clinic that can&apos;t answer during
              a procedure.
            </p>
            <p>
              <strong>RingBackSMS</strong> was born from that mission. It&apos;s an AI that
              detects a missed call and responds via SMS in under 3 seconds — taking orders,
              booking appointments, and answering questions while the business owner is busy
              doing what they do best. Rolando built it because he needed it himself.
            </p>
          </div>
        </section>

        {/* What We Do */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Zap className="h-6 w-6 text-blue-600" />
            What RingBackSMS Does
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: Phone,
                title: 'Missed Call Recovery',
                desc: 'Detects every missed call and responds instantly via SMS so no customer is left waiting.',
              },
              {
                icon: Users,
                title: 'AI Conversations',
                desc: 'Our AI handles the entire conversation — taking orders, booking meetings, answering questions.',
              },
              {
                icon: Shield,
                title: 'A2P 10DLC Compliant',
                desc: 'Registered ISV with Twilio. Every message is carrier-compliant and deliverable.',
              },
              {
                icon: ArrowRight,
                title: 'POS Integration',
                desc: 'Orders placed via SMS flow directly into Square, Clover, Toast, or Shopify.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="border border-slate-200 rounded-xl p-6"
              >
                <item.icon className="h-6 w-6 text-blue-600 mb-3" />
                <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Parent Company */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Agape Technology Solutions
          </h2>
          <p className="text-slate-700 mb-4">
            RingBackSMS is a product of{' '}
            <a
              href="https://agapehealthtech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Agape Technology Solutions
            </a>
            , a technology company focused on building AI-powered tools for
            small and medium businesses. &ldquo;Agape&rdquo; means unconditional
            love — and that&apos;s the standard we hold ourselves to when building
            products for the businesses that serve our communities.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-slate-50 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Get in Touch</h2>
          <p className="text-slate-600 mb-4">
            Have questions? Want a demo? We&apos;d love to hear from you.
          </p>
          <p className="text-slate-700">
            <a href="mailto:info@ringbacksms.com" className="text-blue-600 hover:underline">
              info@ringbacksms.com
            </a>
          </p>
          <div className="mt-6">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              Start Free Today
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <Logo size="sm" variant="light" />
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-slate-700">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-700">Terms</Link>
            <Link href="/help" className="hover:text-slate-700">Help</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
