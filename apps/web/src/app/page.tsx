import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock3,
  Headphones,
  MessageSquareText,
  Phone,
  PhoneCall,
  ShoppingBag,
  Sparkles,
  Store,
  UserRoundCheck,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import { MobileNav } from '@/components/landing/MobileNav';
import { PricingSection } from '@/components/landing/PricingSection';
import { DesktopNavAuthLinks, FinalAuthCta, HeroAuthCtas } from '@/components/landing/AuthCtas';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  metadataBase: new URL('https://ringbacksms.com'),
  title: 'RingBackSMS — Turn Missed Calls Into Real Conversations',
  description:
    'RingBackSMS texts missed callers back, handles common requests, and keeps every opportunity in one recovery inbox. Built for busy local businesses.',
  keywords: [
    'missed call text back',
    'missed call recovery',
    'SMS auto response',
    'restaurant phone automation',
    'small business text messaging',
    'RingBackSMS',
  ],
  openGraph: {
    title: 'RingBackSMS — The call you miss can still become business',
    description:
      'Text missed callers back, keep the conversation moving, and know exactly what needs your attention.',
    url: 'https://ringbacksms.com',
    siteName: 'RingBackSMS',
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RingBackSMS missed call recovery' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RingBackSMS — Turn Missed Calls Into Real Conversations',
    description: 'The call you miss can still become business.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: { canonical: 'https://ringbacksms.com' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'RingBackSMS',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'A missed-call recovery platform that texts callers back, handles common requests, and organizes follow-up for local businesses.',
  url: 'https://ringbacksms.com',
  author: { '@type': 'Organization', name: 'Agape Technology Solutions' },
  offers: { '@type': 'AggregateOffer', lowPrice: '0', highPrice: '299', priceCurrency: 'USD' },
};

const PRICING = [
  {
    name: 'Free',
    monthlyPrice: '$0',
    annualPrice: '$0',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: '',
    description: 'See the workflow for yourself',
    sms: '50 SMS / month',
    features: ['1 phone number', 'Voicemail transcription', 'Reply templates', 'Email notifications'],
    cta: 'Start free',
    highlighted: false,
  },
  {
    name: 'Pro',
    monthlyPrice: '$49',
    annualPrice: '$490',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: 'Save $98',
    description: 'For an owner-operated business',
    sms: '1,000 SMS / month',
    features: ['Everything in Free', 'Orders, bookings, and inquiries', 'Caller memory', 'Custom tone and handoff rules'],
    cta: 'Try Pro free',
    highlighted: true,
  },
  {
    name: 'Business',
    monthlyPrice: '$129',
    annualPrice: '$1,290',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: 'Save $258',
    description: 'For busy teams and high call volume',
    sms: '5,000 SMS / month',
    features: ['Everything in Pro', '3 phone numbers', 'POS integrations', 'Recovery analytics and team alerts'],
    cta: 'Try Business free',
    highlighted: false,
  },
  {
    name: 'Scale',
    monthlyPrice: '$299',
    annualPrice: '$2,990',
    monthlyPeriod: '/month',
    annualPeriod: '/year',
    annualSavings: 'Save $598',
    description: 'For agencies and multi-location groups',
    sms: '20,000 SMS / month',
    features: ['Everything in Business', 'Multiple locations and clients', 'API access', 'Priority support'],
    cta: 'Start a trial',
    highlighted: false,
  },
];

const FAQ = [
  {
    question: 'What happens when I miss a call?',
    answer:
      'RingBackSMS recognizes the missed call and sends a text from your business number. The caller can explain what they need, place an order, request an appointment, or ask for a person. You can follow the entire exchange in one inbox.',
  },
  {
    question: 'Do I have to replace my current phone number?',
    answer:
      'No. You can keep your existing business number and forward missed calls to RingBackSMS, use a dedicated RingBackSMS number, or discuss porting your number when you are ready.',
  },
  {
    question: 'Will it sound like a generic bot?',
    answer:
      'You set your greeting, tone, business facts, hours, and handoff rules. RingBackSMS uses that information to keep replies useful and on-brand, and it can bring a person into the conversation whenever the request needs human judgment.',
  },
  {
    question: 'Can it take orders or book appointments?',
    answer:
      'Yes. Restaurants can guide customers through an SMS order, while service businesses can offer available appointment times. You decide which flows are active for your business.',
  },
  {
    question: 'How do I know what still needs a reply?',
    answer:
      'The Recovery Inbox groups the call, voicemail, texts, tasks, and outcome around the caller. New requests, active conversations, follow-ups, and recovered opportunities stay visible until the work is finished.',
  },
  {
    question: 'Can my team take over a conversation?',
    answer:
      'Yes. Your team can read the context, jump into the SMS thread, call the customer back, assign follow-up, and close the recovery case from the dashboard.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

const OUTCOMES = [
  {
    number: '01',
    icon: ShoppingBag,
    title: 'Take the order',
    copy: 'Guide the customer through items, options, pickup time, and payment without pulling someone off the floor.',
    tone: 'bg-[#F05A37] text-[#171713]',
  },
  {
    number: '02',
    icon: CalendarCheck,
    title: 'Book the time',
    copy: 'Offer an available slot, collect the details, and keep confirmations in the same conversation.',
    tone: 'bg-[#DCE7A3] text-[#171713]',
  },
  {
    number: '03',
    icon: MessageSquareText,
    title: 'Answer the question',
    copy: 'Use your real hours, menu, services, and policies so the caller gets a useful answer while interest is high.',
    tone: 'bg-[#BBC9F4] text-[#171713]',
  },
  {
    number: '04',
    icon: UserRoundCheck,
    title: 'Hand it to a human',
    copy: 'Escalate the odd, urgent, or high-value request with the full context already attached.',
    tone: 'bg-[#282923] text-[#F6F0E4]',
  },
];

const INDUSTRIES = [
  {
    icon: UtensilsCrossed,
    title: 'Restaurants',
    moment: 'The dinner rush',
    href: '/industries/restaurants',
  },
  {
    icon: Sparkles,
    title: 'Salons & barbers',
    moment: 'Hands with a client',
    href: '/industries/service-businesses/beauty-salons',
  },
  {
    icon: Wrench,
    title: 'Home services',
    moment: 'On the job site',
    href: '/industries/service-businesses',
  },
  {
    icon: Store,
    title: 'Local retail',
    moment: 'Helping someone in-store',
    href: '/industries/retail',
  },
];

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return <Logo size="md" variant={inverse ? 'dark' : 'light'} />;
}

function Eyebrow({ children, inverse = false }: { children: React.ReactNode; inverse?: boolean }) {
  return (
    <div className={`mb-5 flex items-center gap-3 text-xs font-black uppercase tracking-[0.16em] ${inverse ? 'text-[#DCE7A3]' : 'text-[#6A6B62]'}`}>
      <span className={`h-2 w-2 rounded-full ${inverse ? 'bg-[#DCE7A3]' : 'bg-[#F05A37]'}`} />
      {children}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <main className="overflow-hidden bg-[#F6F0E4] text-[#171713] selection:bg-[#F05A37] selection:text-[#171713]">
        <nav className="fixed inset-x-0 top-0 z-50 border-b-2 border-[#171713] bg-[#F6F0E4]/95 backdrop-blur-md">
          <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
            <BrandMark />
            <div className="hidden items-center gap-7 text-sm font-bold lg:flex">
              <a href="#how-it-works" className="transition-colors hover:text-[#F05A37]">How it works</a>
              <a href="#features" className="transition-colors hover:text-[#F05A37]">What it handles</a>
              <a href="#industries" className="transition-colors hover:text-[#F05A37]">Who it is for</a>
              <a href="#pricing" className="transition-colors hover:text-[#F05A37]">Pricing</a>
            </div>
            <div className="flex items-center gap-3">
              <DesktopNavAuthLinks />
              <MobileNav />
            </div>
          </div>
        </nav>

        <section className="relative border-b-2 border-[#171713] pt-[70px]">
          <div className="grid min-h-[690px] lg:grid-cols-[1.08fr_.92fr] xl:min-h-[720px]">
            <div className="relative flex flex-col justify-center border-[#171713] px-5 py-14 sm:px-8 sm:py-16 lg:border-r-2 lg:px-12 xl:px-20">
              <div className="absolute right-7 top-6 hidden -rotate-6 border-2 border-[#171713] bg-[#DCE7A3] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] shadow-[4px_4px_0_#171713] 2xl:block">
                Built for the call you cannot take
              </div>
              <div className="max-w-[760px]">
                <Eyebrow>Missed-call recovery for real businesses</Eyebrow>
                <h1 className="font-serif text-[clamp(3.65rem,6.9vw,7.5rem)] font-normal leading-[0.84] tracking-[-0.065em]">
                  Busy hands.
                  <span className="block italic text-[#F05A37]">Ringing phone.</span>
                  <span className="block">Business kept.</span>
                </h1>
                <p className="mt-7 max-w-[610px] text-lg font-medium leading-7 text-[#4F5049] sm:text-xl sm:leading-8">
                  RingBackSMS texts missed callers back, figures out what they need, and keeps the opportunity moving—while you keep doing the work in front of you.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <HeroAuthCtas />
                </div>
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-[#5F6058]">
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#F05A37]" /> Start free</span>
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#F05A37]" /> Keep your current number</span>
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#F05A37]" /> Human takeover anytime</span>
                </div>
              </div>
            </div>

            <div className="relative min-h-[610px] overflow-hidden bg-[#282923] lg:min-h-full">
              <Image
                src="https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=1600&q=88"
                alt="A busy local business owner helping a customer"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 46vw"
                className="object-cover grayscale-[20%] contrast-[1.04]"
              />
              <div className="absolute inset-0 bg-[#171713]/15" />
              <div className="absolute left-5 top-8 rotate-[-3deg] border-2 border-[#171713] bg-[#F6F0E4] p-4 shadow-[7px_7px_0_#171713] sm:left-10 sm:top-12 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F05A37]"><PhoneCall className="h-5 w-5" /></span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#77786E]">Missed call</p>
                    <p className="font-serif text-2xl leading-none">(312) 555-0147</p>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-8 right-5 w-[min(88%,420px)] rotate-[2deg] border-2 border-[#171713] bg-[#DCE7A3] p-5 shadow-[-7px_7px_0_#171713] sm:bottom-12 sm:right-10 sm:p-7">
                <div className="mb-5 flex items-center justify-between border-b border-[#171713]/25 pb-4">
                  <span className="text-xs font-black uppercase tracking-[0.14em]">Text sent by RingBackSMS</span>
                  <span className="flex items-center gap-1 text-xs font-bold"><Clock3 className="h-3.5 w-3.5" /> just now</span>
                </div>
                <p className="font-serif text-2xl leading-tight sm:text-3xl">
                  “Sorry we missed you at Marlowe&apos;s. What can we help with?”
                </p>
                <div className="mt-5 flex items-center gap-2 text-sm font-black">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#171713]" /> Caller is replying…
                </div>
              </div>
            </div>
          </div>

          <div className="flex overflow-hidden border-t-2 border-[#171713] bg-[#F05A37] py-3">
            <div className="marketing-marquee flex min-w-max items-center gap-8 whitespace-nowrap text-sm font-black uppercase tracking-[0.14em]">
              {[...Array(2)].flatMap((_, group) => [
                <span key={`${group}-1`}>Missed call</span>,
                <ArrowRight key={`${group}-2`} className="h-4 w-4" />,
                <span key={`${group}-3`}>Text conversation</span>,
                <ArrowRight key={`${group}-4`} className="h-4 w-4" />,
                <span key={`${group}-5`}>Order, booking, answer, or callback</span>,
                <ArrowRight key={`${group}-6`} className="h-4 w-4" />,
              ])}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b-2 border-[#171713] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-12 lg:grid-cols-[.78fr_1.22fr] lg:gap-20">
              <div>
                <Eyebrow>What happens after the ring</Eyebrow>
                <h2 className="max-w-[560px] font-serif text-5xl leading-[0.96] tracking-[-0.05em] sm:text-7xl">
                  A missed call becomes a clear next step.
                </h2>
                <p className="mt-7 max-w-[510px] text-lg leading-8 text-[#5F6058]">
                  Not another chatbot window. Not another place to check. RingBackSMS turns a phone interruption into an organized customer conversation.
                </p>
              </div>

              <div className="border-2 border-[#171713] bg-[#FFFBF3] shadow-[10px_10px_0_#171713]">
                {[
                  ['1', 'The phone rings', 'The caller reaches voicemail because your team is already helping someone.'],
                  ['2', 'The text goes out', 'They get a useful, on-brand reply while the reason for the call is still fresh.'],
                  ['3', 'The request gets handled', 'Automation moves it forward or gives your team a complete, prioritized follow-up.'],
                ].map(([number, title, copy], index) => (
                  <div key={number} className={`grid gap-5 p-6 sm:grid-cols-[76px_1fr] sm:p-8 ${index < 2 ? 'border-b-2 border-[#171713]' : ''}`}>
                    <div className="font-serif text-6xl italic leading-none text-[#F05A37]">{number}</div>
                    <div>
                      <h3 className="text-xl font-black tracking-[-0.02em]">{title}</h3>
                      <p className="mt-2 max-w-xl leading-7 text-[#62635B]">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-b-2 border-[#171713] bg-[#FFFBF3] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <Eyebrow>Useful on purpose</Eyebrow>
                <h2 className="max-w-[760px] font-serif text-5xl leading-[.95] tracking-[-0.05em] sm:text-7xl">
                  The conversation has somewhere to go.
                </h2>
              </div>
              <p className="max-w-[390px] text-lg leading-8 text-[#606158]">
                Every flow ends in a real business outcome—not endless small talk with a bot.
              </p>
            </div>

            <div className="grid border-l-2 border-t-2 border-[#171713] md:grid-cols-2">
              {OUTCOMES.map(({ number, icon: Icon, title, copy, tone }) => (
                <div key={title} className={`${tone} min-h-[330px] border-b-2 border-r-2 border-[#171713] p-7 sm:p-9`}>
                  <div className="flex items-start justify-between">
                    <span className="font-serif text-3xl italic">{number}</span>
                    <Icon className="h-8 w-8" strokeWidth={1.8} />
                  </div>
                  <h3 className="mt-16 font-serif text-4xl leading-none tracking-[-0.04em] sm:text-5xl">{title}</h3>
                  <p className="mt-5 max-w-[500px] text-base font-semibold leading-7 opacity-80">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b-2 border-[#171713] bg-[#282923] px-5 py-24 text-[#F6F0E4] sm:px-8 sm:py-32 lg:px-12">
          <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[.84fr_1.16fr] lg:items-center lg:gap-20">
            <div>
              <Eyebrow inverse>One place to recover the work</Eyebrow>
              <h2 className="font-serif text-5xl leading-[.96] tracking-[-0.05em] sm:text-7xl">
                Know who called.<br />Know what happened.<br /><span className="italic text-[#DCE7A3]">Know what&apos;s next.</span>
              </h2>
              <p className="mt-7 max-w-[530px] text-lg leading-8 text-[#C9C5BA]">
                The Recovery Inbox keeps each caller&apos;s missed calls, voicemail, text thread, tasks, orders, and appointments together—so follow-up feels like operations, not detective work.
              </p>
              <Link href="/sign-up" className="mt-8 inline-flex items-center gap-2 border-b-2 border-[#F05A37] pb-1 text-base font-black text-[#F6F0E4] hover:text-[#F05A37]">
                See it with your own calls <ArrowDownRight className="h-5 w-5" />
              </Link>
            </div>

            <div className="relative border-2 border-[#F6F0E4] bg-[#F6F0E4] text-[#171713] shadow-[12px_12px_0_#F05A37]">
              <div className="flex items-center justify-between border-b-2 border-[#171713] px-5 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#76776E]">Recovery inbox</p>
                  <p className="mt-1 font-serif text-2xl">Tuesday, 11:42 AM</p>
                </div>
                <span className="rounded-full bg-[#F05A37] px-3 py-1 text-xs font-black">3 need attention</span>
              </div>
              <div className="grid md:grid-cols-[.9fr_1.1fr]">
                <div className="border-[#171713] md:border-r-2">
                  {[
                    ['NEW', 'Jordan Lee', 'Catering for 24 people', '2m'],
                    ['ACTIVE', 'Priya Shah', 'Asking about Saturday', '7m'],
                    ['FOLLOW UP', 'Marcus T.', 'Voicemail: leaking pipe', '18m'],
                    ['RECOVERED', 'Ana Rivera', 'Pickup order paid', '1h'],
                  ].map(([status, name, subject, time], index) => (
                    <div key={name} className={`p-4 ${index < 3 ? 'border-b border-[#171713]/30' : ''} ${index === 0 ? 'bg-[#DCE7A3]' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black tracking-[0.14em]">{status}</span>
                        <span className="text-xs font-bold text-[#74756C]">{time}</span>
                      </div>
                      <p className="mt-2 font-black">{name}</p>
                      <p className="mt-1 text-sm text-[#65665E]">{subject}</p>
                    </div>
                  ))}
                </div>
                <div className="p-5 sm:p-7">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#75766D]">Jordan Lee · new lead</p>
                      <h3 className="mt-2 font-serif text-3xl">Catering request</h3>
                    </div>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#BBC9F4]"><Phone className="h-5 w-5" /></span>
                  </div>
                  <div className="mt-7 space-y-3">
                    <div className="max-w-[88%] bg-[#E8E3D8] p-3 text-sm leading-6">Sorry we missed you at Marlowe&apos;s. What can we help with?</div>
                    <div className="ml-auto max-w-[85%] bg-[#171713] p-3 text-sm leading-6 text-white">Need lunch for 24 people next Thursday. Do you deliver downtown?</div>
                    <div className="max-w-[88%] bg-[#E8E3D8] p-3 text-sm leading-6">Yes. I can help build the order. What time should lunch arrive?</div>
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-2 text-center text-xs font-black uppercase tracking-[.08em]">
                    <span className="border-2 border-[#171713] px-3 py-3">Take over</span>
                    <span className="border-2 border-[#171713] bg-[#F05A37] px-3 py-3">Create order</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="industries" className="border-b-2 border-[#171713] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-10 lg:grid-cols-[.86fr_1.14fr] lg:gap-20">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <Eyebrow>For the businesses that cannot pause</Eyebrow>
                <h2 className="font-serif text-5xl leading-[.95] tracking-[-0.05em] sm:text-7xl">
                  When the phone rings at the worst possible time.
                </h2>
                <p className="mt-7 max-w-[520px] text-lg leading-8 text-[#5F6058]">
                  The best customers often call while the real work is happening. RingBackSMS gives them a next step without asking you to choose between the caller and the customer in front of you.
                </p>
              </div>

              <div className="border-l-2 border-t-2 border-[#171713]">
                {INDUSTRIES.map(({ icon: Icon, title, moment, href }, index) => (
                  <Link key={title} href={href} className={`group grid min-h-[170px] grid-cols-[60px_1fr_auto] items-center gap-4 border-b-2 border-r-2 border-[#171713] p-5 transition-colors sm:grid-cols-[84px_1fr_auto] sm:gap-7 sm:p-7 ${index === 1 ? 'bg-[#BBC9F4]' : index === 2 ? 'bg-[#DCE7A3]' : 'bg-[#FFFBF3] hover:bg-[#F05A37]'}`}>
                    <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-[#171713] sm:h-16 sm:w-16"><Icon className="h-6 w-6" /></span>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#686961]">{moment}</p>
                      <h3 className="mt-2 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">{title}</h3>
                    </div>
                    <ChevronRight className="h-7 w-7 transition-transform group-hover:translate-x-2" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b-2 border-[#171713] bg-[#BBC9F4] px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
              <div>
                <Eyebrow>Fits the way you work</Eyebrow>
                <h2 className="font-serif text-5xl leading-[.95] tracking-[-0.05em] sm:text-6xl">Connect the tools already behind your counter.</h2>
              </div>
              <div className="grid grid-cols-2 border-l-2 border-t-2 border-[#171713] sm:grid-cols-4">
                {['Square', 'Clover', 'Toast', 'Shopify'].map((name) => (
                  <div key={name} className="grid min-h-28 place-items-center border-b-2 border-r-2 border-[#171713] bg-[#F6F0E4] p-4 font-serif text-2xl italic sm:min-h-36 sm:text-3xl">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-b-2 border-[#171713] bg-[#FFFBF3] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_.45fr] lg:items-end">
              <div>
                <Eyebrow>Simple plans, no sales maze</Eyebrow>
                <h2 className="max-w-[840px] font-serif text-5xl leading-[.95] tracking-[-0.05em] sm:text-7xl">Start with one missed call. Scale when the calls add up.</h2>
              </div>
              <p className="text-lg leading-8 text-[#606158]">Every plan starts with the same idea: make it easier for a caller to become a customer.</p>
            </div>
            <PricingSection plans={PRICING} />
          </div>
        </section>

        <section id="faq" className="border-b-2 border-[#171713] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
          <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[.55fr_1fr] lg:gap-20">
            <div>
              <Eyebrow>Before you ask</Eyebrow>
              <h2 className="font-serif text-5xl leading-[.95] tracking-[-0.05em] sm:text-7xl">Good questions deserve plain answers.</h2>
            </div>
            <div className="border-t-2 border-[#171713]">
              {FAQ.map((item, index) => (
                <details key={item.question} className="group border-b-2 border-[#171713] py-6 sm:py-7">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-lg font-black sm:text-xl">
                    <span><span className="mr-3 font-serif text-[#F05A37]">0{index + 1}</span>{item.question}</span>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[#171713] text-xl leading-none transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-[680px] pb-2 pl-9 pr-10 pt-4 leading-7 text-[#5F6058]">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#F05A37] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
          <div className="mx-auto max-w-[1120px] text-center">
            <div className="mx-auto mb-7 grid h-16 w-16 place-items-center rounded-full border-2 border-[#171713] bg-[#F6F0E4]"><Headphones className="h-7 w-7" /></div>
            <h2 className="font-serif text-5xl leading-[.9] tracking-[-0.06em] sm:text-8xl">Let the next missed call be the last one you lose.</h2>
            <p className="mx-auto mt-7 max-w-[660px] text-lg font-semibold leading-8">Set up the text-back flow, call your number, and experience it exactly the way your customer will.</p>
            <div className="mt-9 flex justify-center"><FinalAuthCta /></div>
          </div>
        </section>

        <footer className="border-t-2 border-[#171713] bg-[#171713] px-5 py-14 text-[#C8C3B7] sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-10 md:grid-cols-[1fr_auto_auto] md:gap-16">
              <div>
                <BrandMark inverse />
                <p className="mt-5 max-w-sm leading-7">Missed-call recovery for the people already busy running the business.</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[.14em] text-[#F05A37]">Explore</p>
                <div className="mt-4 grid gap-3 text-sm font-bold">
                  <Link href="/industries">Industries</Link>
                  <Link href="/pricing">Pricing</Link>
                  <Link href="/become-a-partner">Partners</Link>
                  <Link href="/help">Help</Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[.14em] text-[#F05A37]">Company</p>
                <div className="mt-4 grid gap-3 text-sm font-bold">
                  <Link href="/about">About</Link>
                  <a href="mailto:info@ringbacksms.com">Contact</a>
                  <Link href="/privacy">Privacy</Link>
                  <Link href="/terms">Terms</Link>
                </div>
              </div>
            </div>
            <div className="mt-14 flex flex-col justify-between gap-3 border-t border-white/20 pt-6 text-xs sm:flex-row">
              <span>© {new Date().getFullYear()} RingBackSMS</span>
              <span>An Agape Technology Solutions product</span>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
