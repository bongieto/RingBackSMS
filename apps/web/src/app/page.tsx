import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import type { Metadata } from 'next';
import {
  Phone,
  Bot,
  BarChart3,
  Clock,
  DollarSign,
  ShieldCheck,
  Zap,
  Store,
  Scissors,
  Stethoscope,
  Wrench,
  UtensilsCrossed,
  Truck,
  ChevronRight,
  Check,
  Star,
  ArrowRight,
  PhoneOff,
  PhoneIncoming,
  MessageCircle,
  TrendingUp,
  Mic,
  Crown,
  MoonStar,
  Repeat,
  Search,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { MobileNav } from '@/components/landing/MobileNav';
import { PricingSection } from '@/components/landing/PricingSection';
import { Logo } from '@/components/Logo';

/* ─── SEO Metadata ────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: 'RingBackSMS — Never Lose a Customer to a Missed Call Again',
  description:
    'RingBackSMS auto-responds to missed calls with AI-powered SMS. Capture leads, take orders, and book appointments — even when you can\'t pick up. Built for restaurants, salons, clinics, and service businesses. Start free today.',
  keywords: [
    'missed call text back',
    'auto reply SMS',
    'missed call auto response',
    'text back service',
    'missed call software',
    'SMS auto responder',
    'restaurant missed calls',
    'salon missed calls',
    'small business SMS',
    'AI text response',
    'never miss a customer',
    'missed call to text',
    'ringback SMS',
    'auto text missed call',
  ],
  openGraph: {
    title: 'RingBackSMS — Never Lose a Customer to a Missed Call Again',
    description:
      'AI-powered SMS auto-response for missed calls. Capture every lead, take orders, book appointments automatically.',
    url: 'https://ringbacksms.com',
    siteName: 'RingBackSMS',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'RingBackSMS — AI SMS Auto-Response for Missed Calls',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RingBackSMS — Never Lose a Customer to a Missed Call Again',
    description:
      'AI-powered SMS auto-response for missed calls. Capture every lead automatically.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  alternates: { canonical: 'https://ringbacksms.com' },
};

/* ─── JSON-LD Structured Data ──────────────────────────────────────────── */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'RingBackSMS',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'AI-powered SMS auto-response platform that texts back missed callers instantly. Built for restaurants, salons, clinics, and service businesses.',
  url: 'https://ringbacksms.com',
  author: {
    '@type': 'Organization',
    name: 'Agape Technology Solutions',
  },
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '0',
    highPrice: '149',
    priceCurrency: 'USD',
    offerCount: '4',
  },
};

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'RingBackSMS',
  url: 'https://ringbacksms.com',
  logo: 'https://ringbacksms.com/favicon.png',
  foundingDate: '2025',
  founder: {
    '@type': 'Person',
    name: 'Rolando Cabral Jr.',
    jobTitle: 'Founder & CEO',
  },
  parentOrganization: {
    '@type': 'Organization',
    name: 'Agape Technology Solutions',
    url: 'https://agapehealthtech.com',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'support@ringbacksms.com',
  },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does RingBackSMS work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'When a customer calls and you can\'t answer, RingBackSMS automatically detects the missed call via your Twilio phone number and instantly sends an AI-powered SMS response. The AI can answer questions, take food orders, book appointments, or route the customer to the right person — all via text.',
      },
    },
    {
      '@type': 'Question',
      name: 'What types of businesses use RingBackSMS?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'RingBackSMS is built for any business that misses calls: restaurants, food trucks, hair salons, barbershops, auto repair shops, medical clinics, dental offices, law firms, real estate agents, consultants, plumbers, electricians, and more.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can RingBackSMS take orders via text?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! RingBackSMS includes a full SMS ordering flow. Customers can browse your menu, select items, confirm their order, and choose a pickup time — all through text messages. Customers can pay via a secure Stripe payment link sent by SMS. Orders sync to your POS automatically.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does RingBackSMS cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'RingBackSMS offers a free Starter plan with up to 25 SMS per month. Paid plans start at $79/month for the Growth plan (750 SMS) and $199/month for Scale (5,000 SMS). Enterprise pricing is custom.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do voicemails get transcribed automatically?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Every voicemail is transcribed within ~30 seconds and tagged by our AI with a one-line summary and an intent badge (ORDER, BOOKING, QUESTION, COMPLAINT, SPAM, OTHER). You can filter the voicemails list by intent so the highest-value recoveries float to the top.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can RingBackSMS handle calls after hours?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You can configure a separate SMS and voice greeting for calls that arrive outside your business hours. The AI keeps taking orders and booking appointments overnight.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I know if RingBackSMS is actually recovering revenue?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Recovery Funnel on the Analytics page shows the entire missed-call → order pipeline: missed calls, SMS sent, caller replied, owner responded, orders and meetings created. You see drop rates between every step plus week-over-week deltas on conversion and average response time.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does RingBackSMS flag VIPs and repeat callers?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Every missed call auto-links to a contact in your CRM. Voicemail rows show a status badge (VIP, Customer, Lead) and a "Nth call today" counter for repeat callers so you can prioritize the highest-value recoveries first.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to change my phone number?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. RingBackSMS provisions a dedicated business number through Twilio that works alongside your existing phone number. You can also port your existing number if you prefer.',
      },
    },
  ],
};

/* ─── Constants ────────────────────────────────────────────────────────── */

const STATS = [
  { value: '62%', label: 'of calls to small businesses go unanswered' },
  { value: '85%', label: 'of callers won\'t call back if you miss them' },
  { value: '4 POS', label: 'integrations — Square, Clover, Toast & Shopify' },
  { value: '<3s', label: 'RingBackSMS average response time' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: PhoneOff,
    title: 'You miss a call',
    description:
      'A customer calls while you\'re busy with a client, in the kitchen, or after hours. We detect the missed call instantly.',
  },
  {
    step: '02',
    icon: MessageCircle,
    title: 'AI texts them back',
    description:
      'Within 3 seconds, our AI sends a personalized SMS greeting from your business. "Hi! Sorry we missed your call at Tony\'s Barbershop. How can we help?"',
  },
  {
    step: '03',
    icon: TrendingUp,
    title: 'You capture the sale',
    description:
      'The AI handles the full conversation — takes orders, books appointments, answers questions, or notifies you for urgent requests. No customer left behind.',
  },
];

const FEATURES = [
  {
    icon: Bot,
    title: 'AI-Powered Conversations',
    description:
      'Powered by Claude AI, every response sounds human and on-brand. The AI understands context, handles follow-ups, and knows when to escalate to you.',
  },
  {
    icon: UtensilsCrossed,
    title: 'SMS Ordering with Modifiers',
    description:
      'Customers browse your menu, pick sizes and toppings, add allergy notes, and choose pickup times — all by text. Orders sync to Square, Clover, Toast, or Shopify and come through paid via Stripe link.',
  },
  {
    icon: Clock,
    title: 'Appointment Booking',
    description:
      'Service businesses can book appointments by text. AI validates business hours, collects the details, and drops a Cal.com booking link right in the conversation.',
  },
  {
    icon: Search,
    title: 'Catalog-Aware Product Answers',
    description:
      '"Do you have it in my size?" gets a real answer in 3 seconds. AI searches your catalog, quotes price and availability, and puts the item on hold when the customer replies YES.',
  },
  {
    icon: Repeat,
    title: 'Remembers Every Caller',
    description:
      'Returning customers get "Last time you ordered pepperoni + Caesar — reply SAME." AI knows their name, last order, and whether they\'re a VIP, lead, or rapid redial.',
  },
  {
    icon: AlertTriangle,
    title: 'Urgency & Emergency Escalation',
    description:
      'Keywords like "flood," "burst pipe," "burning smell," or "large party" trigger instant push and Slack notifications so you never bury a real emergency in voicemail.',
  },
  {
    icon: Zap,
    title: '3-Second Response Time',
    description:
      'Your customers get a reply before they even think about calling your competitor. Instant responses, 24/7, even at 2 AM on a Sunday.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Analytics & Daily Digest',
    description:
      'Track missed calls, conversations, orders, bookings, and revenue in real time. Optional daily-digest email lands in your inbox every morning.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-Tenant Security',
    description:
      'Enterprise-grade encryption. Row-level data isolation. Each business gets its own private workspace — your data never touches another account.',
  },
  {
    icon: Store,
    title: 'Two-Way POS Sync',
    description:
      'Connect Square, Clover, Toast, or Shopify. Pull your menu or push RingBackSMS items into your POS. Full sync history so you can see exactly what changed and when.',
  },
  {
    icon: Users,
    title: 'Built-in CRM with Handoff',
    description:
      'Contact timeline unifies every conversation, order, and meeting. Tags, notes, status (Lead → Customer → VIP), CSV export, bulk import — plus one-tap AI-to-human handoff when you want to take over.',
  },
  {
    icon: Mic,
    title: 'AI Voicemail Triage',
    description:
      'Every voicemail gets an instant transcript, a one-line AI summary, and a colored intent tag (ORDER, BOOKING, QUESTION, COMPLAINT). Skim, don\'t listen.',
  },
  {
    icon: MessageCircle,
    title: 'One-Tap Reply & Callback',
    description:
      'Reply to any voicemail with a saved template chip in two taps — or hit the call-back button. Replies thread into the conversation automatically.',
  },
  {
    icon: TrendingUp,
    title: 'Recovery Funnel Analytics',
    description:
      'See exactly where missed-call revenue leaks: missed → SMS sent → caller replied → owner responded → order. Drop rates, conversion %, and avg response time.',
  },
  {
    icon: MoonStar,
    title: 'Business Hours & Holidays',
    description:
      'Set per-day hours, holiday closures, and a separate after-hours greeting. AI capture late-night orders and books tomorrow\'s appointments while you sleep.',
  },
  {
    icon: Crown,
    title: 'VIP & Repeat-Caller Detection',
    description:
      'Every missed call auto-links to a contact. VIPs and repeat callers ("3rd call today") jump out of the voicemail list so you call back the right one first.',
  },
];

const INDUSTRIES = [
  {
    icon: UtensilsCrossed,
    name: 'Restaurants & Food Trucks',
    pain: 'Busy dinner rush, can\'t answer the phone',
    solution: 'AI takes orders via text — works with Square, Clover & Toast POS, menus sync automatically',
    stat: '35% more takeout orders',
    href: '/industries/restaurants',
  },
  {
    icon: Scissors,
    name: 'Salons & Barbershops',
    pain: 'Hands full with a client, phone keeps ringing',
    solution: 'Customers book their next appointment via SMS',
    stat: '50% fewer no-shows',
    href: '/industries/service-businesses/beauty-salons',
  },
  {
    icon: Stethoscope,
    name: 'Medical & Dental Offices',
    pain: 'Front desk overwhelmed with call volume',
    solution: 'AI answers common questions and schedules visits',
    stat: '40% less phone time for staff',
    href: '/industries/service-businesses',
  },
  {
    icon: Wrench,
    name: 'Home Services & Trades',
    pain: 'On a job site, can\'t pick up leads',
    solution: 'Captures lead details and schedules estimates',
    stat: '3x more leads captured',
    href: '/industries/service-businesses',
  },
  {
    icon: Store,
    name: 'Retail & Boutiques',
    pain: 'Helping in-store customers, missing phone orders',
    solution: 'AI answers product questions and hours',
    stat: '25% more customer inquiries handled',
    href: '/industries/retail',
  },
  {
    icon: Truck,
    name: 'Food Trucks',
    pain: 'Moving every day, customers can\'t reach you',
    solution: 'SMS ordering with location-aware preorders',
    stat: '2x more preorders',
    href: '/industries/restaurants/food-trucks',
  },
];

const PRICING = [
  {
    name: 'Starter',
    monthlyPrice: 'Free',
    annualPrice: 'Free',
    monthlyPeriod: 'forever',
    annualPeriod: 'forever',
    annualSavings: '',
    description: 'Try it risk-free',
    sms: '25 SMS/month',
    features: [
      '1 phone number',
      'AI auto-responses (Fallback flow)',
      'Voicemail transcription & intent tags',
      'Reply templates',
      'Basic analytics',
      'Email notifications',
    ],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Growth',
    monthlyPrice: '$79',
    annualPrice: '$790',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: 'Save $158',
    description: 'Most small shops',
    sms: '750 SMS/month',
    features: [
      'Everything in Starter',
      'Order, Meeting & Inquiry flows',
      'POS integration (Square, Clover, Toast, Shopify)',
      'Caller memory & reorder shortcuts',
      'Modifier groups (size, toppings, allergy notes)',
      'SMS + Email notifications',
      'Custom AI personality',
      'Daily digest email',
      'Priority support',
    ],
    cta: 'Start 14-Day Trial',
    highlighted: true,
  },
  {
    name: 'Scale',
    monthlyPrice: '$199',
    annualPrice: '$1,990',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: 'Save $398',
    description: 'Multi-tech / multi-location',
    sms: '5,000 SMS/month',
    features: [
      'Everything in Growth',
      'Slack notifications for orders, bookings & inquiries',
      'Two-way POS catalog sync',
      'Recovery funnel analytics',
      'Urgency keyword escalation',
      'AI ↔ human handoff tracking',
      'Priority phone support',
    ],
    cta: 'Start 14-Day Trial',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    monthlyPrice: 'Custom',
    annualPrice: 'Custom',
    monthlyPeriod: '',
    annualPeriod: '',
    annualSavings: '',
    description: 'For multi-location businesses and franchises',
    sms: 'Unlimited SMS',
    features: [
      'Everything in Scale',
      'Unlimited locations',
      'Dedicated account manager',
      'Custom integrations',
      'Custom SLAs available',
      'White-glove onboarding',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const TESTIMONIALS = [
  {
    quote:
      'We were losing 15+ calls a day during lunch rush. Now every missed call gets a text back instantly. Our takeout orders jumped 35% in the first month.',
    name: 'Maria Santos',
    title: 'Owner, Lola\'s Filipino Kitchen',
    industry: 'Restaurant',
    avatar: 'MS',
  },
  {
    quote:
      'My hands are literally in someone\'s hair when the phone rings. RingBackSMS books appointments for me while I work. I haven\'t lost a new client since.',
    name: 'DeShawn Williams',
    title: 'Owner, Fresh Cuts Barbershop',
    industry: 'Barbershop',
    avatar: 'DW',
  },
  {
    quote:
      'Our front desk was drowning in calls. Now the AI handles appointment requests and common questions automatically. Staff can focus on patients.',
    name: 'Dr. Priya Patel',
    title: 'Dentist, Bright Smile Family Dental',
    industry: 'Dental Office',
    avatar: 'PP',
  },
];

const FAQ = [
  {
    question: 'How does RingBackSMS work?',
    answer:
      'When a customer calls and you can\'t answer, RingBackSMS detects the missed call through your dedicated Twilio phone number and sends an AI-powered SMS within 3 seconds. The AI then carries on a natural text conversation — answering questions, taking orders, or booking appointments — based on your business type and settings.',
  },
  {
    question: 'Do I need to change my phone number?',
    answer:
      'No. RingBackSMS gives you a dedicated business phone number through Twilio. You can keep your existing number and either forward missed calls to your RingBackSMS number, or use it as your primary business line. You can also port your existing number if you prefer.',
  },
  {
    question: 'Can the AI really take food orders via text?',
    answer:
      'Yes! You upload your menu (or sync it from Square POS), and the AI guides customers through ordering — showing the menu, letting them pick items, confirming the order, and choosing a pickup time. Customers can pay via a secure Stripe payment link sent by SMS. Orders appear in your dashboard and can sync directly to your POS.',
  },
  {
    question: 'What if the AI can\'t answer a question?',
    answer:
      'The AI knows its limits. If a question is outside its scope or the customer asks to speak to a human, it immediately notifies you via SMS, email, or Slack with the conversation details so you can follow up personally.',
  },
  {
    question: 'Is my customer data secure?',
    answer:
      'Yes. We encrypt all stored Twilio credentials and sensitive tokens at rest and in transit. Every tenant gets strict data isolation via PostgreSQL Row-Level Security — your conversations, contacts, and orders are never visible to other accounts. SOC 2 readiness is in progress.',
  },
  {
    question: 'How long does setup take?',
    answer:
      'About 2 minutes. Sign up, tell us your business type, customize your greeting message, and you\'re live. If you have a Square account, you can sync your entire menu in one click. Most businesses are fully operational within 5 minutes.',
  },
  {
    question: 'Can I customize what the AI says?',
    answer:
      'Yes. You control your greeting message, business hours, AI personality and tone, menu items, and conversation flows. The AI adapts to sound like your brand — whether that\'s casual and fun or professional and formal.',
  },
  {
    question: 'What happens if I go over my SMS limit?',
    answer:
      'We\'ll never cut off your customers. If you exceed your plan\'s SMS limit, additional messages are billed at $0.05/SMS — well below industry average. You\'ll get a notification when you\'re approaching your limit so there are no surprises.',
  },
  {
    question: 'Can customers pay via text?',
    answer:
      'Yes. After confirming an order, customers receive a secure Stripe Checkout link via SMS. You can require payment upfront (the order is only placed after payment) or send the link as a follow-up after the order is placed. Payment links expire after 30 minutes.',
  },
  {
    question: 'Do voicemails get transcribed automatically?',
    answer:
      'Yes. Every voicemail is transcribed within ~30 seconds and tagged by our AI with a one-line summary and an intent badge (ORDER, BOOKING, QUESTION, COMPLAINT, SPAM, OTHER). You can filter the voicemails list by intent so the highest-value recoveries float to the top — no more pressing play on every recording.',
  },
  {
    question: 'Can RingBackSMS handle calls after hours?',
    answer:
      'Absolutely. You can configure a separate SMS and voice greeting for calls that arrive outside your business hours. The AI keeps taking orders and booking appointments overnight, so you wake up to a queue of recovered revenue instead of missed calls.',
  },
  {
    question: 'How do I know if RingBackSMS is actually recovering revenue?',
    answer:
      'The Recovery Funnel on your Analytics page shows the entire missed-call → order pipeline: how many calls were missed, how many got an SMS, how many callers replied, how fast you responded, and how many turned into orders or meetings. You see drop rates between every step plus week-over-week deltas.',
  },
  {
    question: 'Do you flag VIPs and repeat callers?',
    answer:
      'Yes. Every missed call auto-links to a Contact in your CRM. Voicemail rows show a status badge (VIP, Customer, Lead) and a "Nth call today" counter for repeat callers — so you instantly know who to call back first.',
  },
  {
    question: 'Do you integrate with my POS system?',
    answer:
      'Yes — RingBackSMS connects with Square, Clover, Toast, and Shopify out of the box. You can pull your menu from the POS or push RingBackSMS items the other way. Orders placed by SMS land in your POS automatically, and the full sync history is visible in the dashboard.',
  },
  {
    question: 'Does it handle holidays and different hours each day?',
    answer:
      'Yes. You can set per-day business hours (e.g., closed Mondays, late Friday), mark specific holiday closures, and configure a separate after-hours greeting. The AI respects all of this and books customers into the next open slot.',
  },
  {
    question: 'Can customers with existing accounts just reorder?',
    answer:
      'Yes. Returning customers see "Last time you ordered X — reply SAME to reorder." The AI recognizes them from their phone number, remembers their past order, and can replay it in a single message.',
  },
];

/* ─── SMS Demo Conversation ─────────────────────────────────────────── */

const SMS_DEMO = [
  { from: 'business', text: 'Hi! Sorry we missed your call at Tony\'s Pizza. How can we help? Reply ORDER to place an order, or just tell us what you need!' },
  { from: 'customer', text: 'ORDER' },
  { from: 'business', text: 'Great! Here\'s our menu:\n\nMargherita — $12\nPepperoni — $14\nSupreme — $16\nCaesar Salad — $8\nDrinks — $3\n\nWhat would you like to order?' },
  { from: 'customer', text: '2 pepperoni and a caesar salad' },
  { from: 'business', text: 'Got it! Your order:\n\n2x Pepperoni Pizza — $28\n1x Caesar Salad — $8\n\nTotal: $36\n\nWhen would you like to pick up?' },
  { from: 'customer', text: '6:30pm' },
  { from: 'business', text: 'Your total is $36. You\'ll receive a payment link — your order will be confirmed once payment is received.' },
  { from: 'business', text: 'Pay securely here: pay.ringbacksms.com/checkout/...' },
  { from: 'business', text: 'Payment received! Order #ORD-2847 confirmed. Pickup: 6:30 PM. See you soon!' },
];

/* ─── Page Component ────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />

      <main className="min-h-screen bg-white">
        {/* ─── Navigation ──────────────────────────────────────────── */}
        <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg border-b border-slate-100 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Logo size="md" variant="light" />
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
              <a href="#how-it-works" className="hover:text-blue-600 transition-colors">How It Works</a>
              <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
              <a href="#industries" className="hover:text-blue-600 transition-colors">Industries</a>
              <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-blue-600 transition-colors">FAQ</a>
            </div>
            <div className="flex items-center gap-3">
              <SignedOut>
                <Link href="/sign-in" className="hidden sm:block text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  className="hidden sm:inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Start Free
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="hidden sm:inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Dashboard
                </Link>
              </SignedIn>
              <MobileNav />
            </div>
          </div>
        </nav>

        {/* ─── Hero Section ────────────────────────────────────────── */}
        <section
          className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=2000&q=80')",
          }}
        >
          {/* Light gradient overlay so copy stays legible */}
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/40" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-transparent to-white/80" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: Copy */}
              <div className="space-y-6 sm:space-y-8 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs font-semibold text-blue-700">
                  <Zap className="h-3.5 w-3.5" />
                  Responding to missed calls in under 3 seconds
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.1] tracking-tight">
                  Never lose a customer to a{' '}
                  <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                    missed call
                  </span>{' '}
                  again
                </h1>
                <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
                  RingBackSMS instantly texts back every missed call with an AI assistant that takes orders,
                  books appointments, and answers questions — so you never lose another sale while you&apos;re
                  busy running your business.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 sm:justify-center lg:justify-start">
                  <SignedOut>
                    <Link
                      href="/sign-up"
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25 text-lg"
                    >
                      Start Free Today
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                    <a
                      href="#how-it-works"
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors border border-slate-200 text-lg"
                    >
                      See How It Works
                    </a>
                  </SignedOut>
                  <SignedIn>
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25 text-lg"
                    >
                      Go to Dashboard
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </SignedIn>
                </div>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> No credit card required</span>
                  <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> 2-minute setup</span>
                  <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Cancel anytime</span>
                </div>
              </div>

              {/* Right: SMS Demo Phone */}
              <div className="relative flex justify-center lg:justify-end">
                <div className="w-[340px] bg-slate-900 rounded-[2.5rem] p-3 shadow-2xl shadow-slate-900/30">
                  <div className="bg-white rounded-[2rem] overflow-hidden">
                    {/* Phone header */}
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                          <Phone className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Tony&apos;s Pizza</p>
                          <p className="text-xs text-slate-500">RingBackSMS</p>
                        </div>
                      </div>
                    </div>
                    {/* Messages */}
                    <div className="p-4 space-y-3 h-[420px] overflow-hidden">
                      {SMS_DEMO.map((msg, i) => (
                        <div key={i} className={`flex ${msg.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-line ${
                              msg.from === 'customer'
                                ? 'bg-blue-600 text-white rounded-br-md'
                                : 'bg-slate-100 text-slate-800 rounded-bl-md'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Floating badge */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 lg:left-8 lg:translate-x-0 bg-white border border-slate-200 rounded-full px-4 py-2 shadow-lg flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-medium text-slate-700">Order captured in 45 seconds</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Social Proof Bar ────────────────────────────────────── */}
        <section className="py-6 bg-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">{stat.value}</div>
                  <div className="text-xs sm:text-sm text-slate-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Problem Statement ───────────────────────────────────── */}
        <section className="py-20 sm:py-28 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-6">
              Every missed call is a{' '}
              <span className="text-red-500">missed sale</span>
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed max-w-3xl mx-auto">
              You&apos;re busy doing what you do best — cooking meals, cutting hair, fixing cars, seeing patients.
              But every time your phone rings and you can&apos;t answer, that customer calls your competitor instead.
              <strong className="text-slate-800"> 85% of callers won&apos;t leave a voicemail or call back.</strong> They&apos;re gone forever.
            </p>
            <div className="mt-12 grid sm:grid-cols-3 gap-8">
              <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                <PhoneOff className="h-8 w-8 text-red-500 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 mb-1">Customer calls you</h3>
                <p className="text-sm text-slate-600">You&apos;re with a client, in the kitchen, or it&apos;s after hours. The call goes unanswered.</p>
              </div>
              <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                <PhoneIncoming className="h-8 w-8 text-red-500 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 mb-1">They don&apos;t leave a voicemail</h3>
                <p className="text-sm text-slate-600">85% of missed callers hang up without leaving a message. You don&apos;t even know they called.</p>
              </div>
              <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                <DollarSign className="h-8 w-8 text-red-500 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 mb-1">They call your competitor</h3>
                <p className="text-sm text-slate-600">Within 60 seconds, they&apos;ve Googled the next business and are placing their order there.</p>
              </div>
            </div>
            <div className="mt-12 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-2xl p-8 text-lg font-semibold">
              <p>RingBackSMS breaks this cycle. Every missed call gets an instant text response — in under 3 seconds.</p>
            </div>
          </div>
        </section>

        {/* ─── How It Works ────────────────────────────────────────── */}
        <section id="how-it-works" className="py-20 sm:py-28 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                How RingBackSMS works
              </h2>
              <p className="text-lg text-slate-600 mt-4 max-w-2xl mx-auto">
                Set it up in 2 minutes. Then let AI handle the rest.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step} className="relative bg-white rounded-2xl p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <div className="text-5xl font-extrabold text-blue-100 absolute top-6 right-6">{item.step}</div>
                  <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center mb-5">
                    <item.icon className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Features Grid ───────────────────────────────────────── */}
        <section id="features" className="py-20 sm:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                Everything you need to capture every customer
              </h2>
              <p className="text-lg text-slate-600 mt-4 max-w-2xl mx-auto">
                More than just a text-back service. RingBackSMS is a full AI-powered customer engagement platform.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="bg-slate-50 rounded-2xl p-6 hover:bg-blue-50 hover:border-blue-100 border border-transparent transition-all group">
                  <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                    <feature.icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Industries ──────────────────────────────────────────── */}
        <section id="industries" className="py-20 sm:py-28 bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold">
                Built for businesses that are too busy to answer the phone
              </h2>
              <p className="text-lg text-slate-400 mt-4 max-w-2xl mx-auto">
                If your hands are full, your schedule is packed, or you&apos;re closed — RingBackSMS has you covered.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {INDUSTRIES.map((industry) => (
                <Link key={industry.name} href={industry.href} className="block bg-white/5 rounded-2xl p-6 border border-white/10 hover:bg-white/10 hover:border-blue-400/40 transition-colors group">
                  <industry.icon className="h-8 w-8 text-blue-400 mb-4" />
                  <h3 className="text-lg font-bold mb-2 group-hover:text-blue-300">{industry.name}</h3>
                  <p className="text-sm text-slate-400 mb-3">
                    <span className="text-red-400 font-medium">Pain:</span> {industry.pain}
                  </p>
                  <p className="text-sm text-slate-400 mb-4">
                    <span className="text-green-400 font-medium">Solution:</span> {industry.solution}
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 rounded-full text-xs font-bold text-green-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {industry.stat}*
                  </div>
                </Link>
              ))}
            </div>
            <p className="text-center text-xs text-slate-500 mt-8">
              *Illustrative outcomes based on typical customer patterns.
            </p>
          </div>
        </section>

        {/* ─── Testimonials ────────────────────────────────────────── */}
        <section className="py-20 sm:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                Loved by business owners everywhere
              </h2>
              <p className="text-lg text-slate-600 mt-4">
                Join hundreds of businesses recovering lost revenue from missed calls.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {TESTIMONIALS.map((testimonial) => (
                <div key={testimonial.name} className="bg-slate-50 rounded-2xl p-8 border border-slate-100 relative">
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <blockquote className="text-slate-700 leading-relaxed mb-6">
                    &ldquo;{testimonial.quote}&rdquo;
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{testimonial.name}</div>
                      <div className="text-xs text-slate-500">{testimonial.title}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 mt-8">
              *Representative examples. Customer names and stats are illustrative.
            </p>
          </div>
        </section>

        {/* ─── For Agencies ────────────────────────────────────────── */}
        <section id="agencies" className="py-20 sm:py-28 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <div className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wide mb-4">
                For Agencies
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                Built for agencies managing multiple clients
              </h2>
              <p className="text-lg text-slate-600 mt-4 max-w-2xl mx-auto">
                Run every client business from a single login. Each client stays fully isolated — their own phone number, contacts, conversations, and billing.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: Users,
                  title: 'One login, all clients',
                  desc: 'Switch between client businesses from the org switcher. No juggling passwords or browser profiles.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Isolated per client',
                  desc: 'Each client has its own phone number, data, settings, and team members. Zero cross-bleed.',
                },
                {
                  icon: DollarSign,
                  title: 'Per-client billing',
                  desc: 'Each client carries its own Stripe subscription. Invoice them directly or roll it into your managed fee.',
                },
                {
                  icon: TrendingUp,
                  title: 'Scale with your book',
                  desc: 'Add or remove clients any time. No seat limits, no setup fees, no long-term commitments.',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-slate-50 rounded-2xl p-6 hover:bg-blue-50 hover:border-blue-100 border border-transparent transition-all group"
                >
                  <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
                    <Icon className="h-5 w-5 text-blue-600 group-hover:text-white transition-colors" aria-hidden />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="mailto:support@ringbacksms.com?subject=Agency%20access%20request"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Request agency access <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/help#agencies"
                className="inline-flex items-center gap-2 text-slate-700 hover:text-blue-600 font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                See how it works
              </a>
            </div>
            <p className="text-center text-xs text-slate-500 mt-6 max-w-xl mx-auto">
              Agency access is granted on request while we finalize agency pricing. Contact support to enable it on your account.
            </p>
          </div>
        </section>

        {/* ─── Pricing ─────────────────────────────────────────────── */}
        <section id="pricing" className="py-20 sm:py-28 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                Simple, transparent pricing
              </h2>
              <p className="text-lg text-slate-600 mt-4 max-w-2xl mx-auto">
                Start free, upgrade when you&apos;re ready. Every plan pays for itself with the revenue you&apos;ll recover.
              </p>
            </div>
            <PricingSection plans={PRICING} />
            <p className="text-center text-sm text-slate-500 mt-8">
              All plans include a 14-day free trial. No credit card required to start. Cancel anytime.
            </p>
            <p className="text-center text-xs text-slate-500 mt-2">
              Billing is per business. <a href="#agencies" className="text-blue-600 hover:underline">Agency access</a> — managing multiple clients from one login — is granted on request.
            </p>
          </div>
        </section>

        {/* ─── FAQ ─────────────────────────────────────────────────── */}
        <section id="faq" className="py-20 sm:py-28 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                Frequently asked questions
              </h2>
              <p className="text-lg text-slate-600 mt-4">
                Everything you need to know about RingBackSMS.
              </p>
            </div>
            <div className="space-y-4">
              {FAQ.map((faq) => (
                <details key={faq.question} className="group bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                  <summary className="px-6 py-4 cursor-pointer flex items-center justify-between font-semibold text-slate-900 hover:bg-slate-100 transition-colors list-none">
                    {faq.question}
                    <ChevronRight className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-6 pb-4 text-sm text-slate-600 leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Final CTA ───────────────────────────────────────────── */}
        <section className="py-20 sm:py-28 bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-6">
              Stop losing customers to missed calls
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
              Join hundreds of business owners who never miss a sale. Set up in 2 minutes, start capturing
              revenue today. Your first 50 SMS are free, forever.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <SignedOut>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center justify-center gap-2 px-10 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-lg shadow-lg"
                >
                  Get Started Free
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-10 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-lg shadow-lg"
                >
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </SignedIn>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-blue-200 mt-6">
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Free forever plan</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> 2-minute setup</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> No credit card</span>
            </div>
          </div>
        </section>

        {/* ─── Footer ──────────────────────────────────────────────── */}
        <footer className="bg-slate-900 text-slate-400 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
              {/* Brand */}
              <div className="lg:col-span-1">
                <div className="mb-4">
                  <Logo size="sm" variant="dark" />
                </div>
                <p className="text-sm leading-relaxed mb-3">
                  AI-powered SMS auto-response for missed calls. Built for restaurants, salons, clinics, and
                  every business that&apos;s too busy to answer the phone.
                </p>
                <p className="text-xs text-slate-500">
                  A product of <span className="text-slate-300 font-semibold">Agape Technology Solutions</span>
                </p>
              </div>
              {/* Product */}
              <div>
                <h4 className="text-white font-semibold mb-4">Product</h4>
                <ul className="space-y-2 text-sm">
                  <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                  <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                  <li><a href="#industries" className="hover:text-white transition-colors">Industries</a></li>
                  <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                  <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
                </ul>
              </div>
              {/* Industries */}
              <div>
                <h4 className="text-white font-semibold mb-4">Industries</h4>
                <ul className="space-y-2 text-sm">
                  <li><span className="hover:text-white transition-colors cursor-default">Restaurants &amp; Food Trucks</span></li>
                  <li><span className="hover:text-white transition-colors cursor-default">Salons &amp; Barbershops</span></li>
                  <li><span className="hover:text-white transition-colors cursor-default">Medical &amp; Dental</span></li>
                  <li><span className="hover:text-white transition-colors cursor-default">Home Services</span></li>
                  <li><span className="hover:text-white transition-colors cursor-default">Auto Shops</span></li>
                </ul>
              </div>
              {/* Legal */}
              <div>
                <h4 className="text-white font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-sm">
                  <li><a href="mailto:support@ringbacksms.com" className="hover:text-white transition-colors">Contact Support</a></li>
                  <li><Link href="/help" className="hover:text-white transition-colors">Help Center</Link></li>
                  <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
              <p>&copy; 2026 RingBackSMS. All rights reserved. A product of <span className="text-slate-300 font-medium">Agape Technology Solutions</span>.</p>
              <p>
                Made with <span className="text-red-400">&#9829;</span> for small business owners who are too busy to answer the phone.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
