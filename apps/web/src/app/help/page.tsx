import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Phone,
  MessageSquare,
  ShoppingBag,
  Calendar,
  Users,
  BarChart3,
  Settings,
  UtensilsCrossed,
  Briefcase,
  Zap,
  CreditCard,
  Plug2,
  PhoneForwarded,
  Bot,
  Mic,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Help Center — RingBackSMS',
  description: 'Learn how to set up and use RingBackSMS to never miss a customer again.',
  alternates: { canonical: 'https://ringbacksms.com/help' },
  openGraph: {
    title: 'Help Center — RingBackSMS',
    description: 'Learn how to set up and use RingBackSMS to never miss a customer again.',
    url: 'https://ringbacksms.com/help',
  },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4 border-b pb-2">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <div className="text-gray-700 text-sm mt-1">{children}</div>
      </div>
    </div>
  );
}

function NavCard({ icon: Icon, title, description, href }: { icon: React.ElementType; title: string; description: string; href: string }) {
  return (
    <a href={href} className="block p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group">
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-gray-900 group-hover:text-blue-700">{title}</p>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
    </a>
  );
}

function FAQ({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="border border-gray-200 rounded-lg mb-3 group">
      <summary className="p-4 font-medium text-gray-900 cursor-pointer list-none flex items-center justify-between hover:bg-gray-50">
        {question}
        <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="px-4 pb-4 text-gray-700 text-sm leading-relaxed">{children}</div>
    </details>
  );
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo size="md" variant="light" />
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            &larr; Back to Home
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-blue-50 to-white py-12">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <HelpCircle className="h-12 w-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Help Center</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">Everything you need to set up and get the most out of RingBackSMS. Turn missed calls into customers with AI-powered text replies.</p>
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Jump to a topic</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <NavCard icon={Phone} title="Getting Started" description="Set up your account in 5 minutes" href="#getting-started" />
          <NavCard icon={PhoneForwarded} title="Call Forwarding" description="Connect your business phone" href="#call-forwarding" />
          <NavCard icon={Bot} title="AI & Conversations" description="How the AI responds for you" href="#ai-conversations" />
          <NavCard icon={Mic} title="Voicemails" description="Transcripts, AI summaries, one-tap reply" href="#voicemails" />
          <NavCard icon={UtensilsCrossed} title="Menu & Orders" description="Take food orders via text" href="#menu-orders" />
          <NavCard icon={Briefcase} title="Services & Booking" description="Service businesses & appointments" href="#services-booking" />
          <NavCard icon={Calendar} title="Meetings" description="Schedule appointments via SMS" href="#meetings" />
          <NavCard icon={Users} title="Contacts & CRM" description="Manage your customer database" href="#contacts" />
          <NavCard icon={Plug2} title="Integrations" description="Connect Square, Clover & more" href="#integrations" />
          <NavCard icon={CreditCard} title="Billing & Plans" description="Pricing, usage, and upgrades" href="#billing" />
          <NavCard icon={Settings} title="Settings" description="Configure your business profile" href="#settings" />
          <NavCard icon={BarChart3} title="Analytics" description="Track your performance" href="#analytics" />
          <NavCard icon={Briefcase} title="Agencies" description="Manage multiple clients from one login" href="#agencies" />
          <NavCard icon={HelpCircle} title="FAQs" description="Common questions answered" href="#faq" />
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 pb-16">

        {/* ── Getting Started ──────────────────────────────── */}
        <Section id="getting-started" title="Getting Started">
          <p className="text-gray-700 mb-6">Setting up RingBackSMS takes about 5 minutes. Here&apos;s how to get your account up and running.</p>

          <Step number={1} title="Create your account">
            <p>Sign up at <strong>ringbacksms.com</strong> and complete the onboarding form with your business name, type, and contact info. Choose the industry that best fits your business.</p>
          </Step>

          <Step number={2} title="Customize your greeting">
            <p>Write the SMS message that callers receive when they miss your call. Keep it under 160 characters for best delivery. You can also let the AI generate one for you based on your business type.</p>
          </Step>

          <Step number={3} title="Get a phone number">
            <p>Go to <strong>Settings &rarr; Phone</strong> and search for a phone number by area code. If no numbers are available in your area code, we&apos;ll automatically suggest nearby alternatives. Select and provision your number with one click.</p>
          </Step>

          <Step number={4} title="Forward your business phone">
            <p>Set up call forwarding from your existing business phone to your new RingBackSMS number. This way, when you can&apos;t answer, the call forwards to us and the caller gets an instant text. See the <a href="#call-forwarding" className="text-blue-600 hover:underline">Call Forwarding</a> section for detailed instructions.</p>
          </Step>

          <Step number={5} title="Add your menu or services">
            <p>If you&apos;re a restaurant, go to <strong>Menu</strong> to add your items. If you&apos;re a service business, go to <strong>Services</strong> to add your offerings with pricing and duration. The AI uses this info when chatting with your callers.</p>
          </Step>

          <Step number={6} title="Enable your flows">
            <p>Go to <strong>Flows</strong> and turn on the automations you need — ORDER for taking orders, MEETING for scheduling appointments, and FALLBACK for general AI conversations.</p>
          </Step>
        </Section>

        {/* ── Call Forwarding ──────────────────────────────── */}
        <Section id="call-forwarding" title="Call Forwarding Setup">
          <p className="text-gray-700 mb-4">Call forwarding sends unanswered calls from your existing business phone to your RingBackSMS number. You keep your current phone number — customers call you as usual.</p>

          <SubSection title="How it works">
            <ol className="list-decimal pl-6 text-gray-700 space-y-2">
              <li>A customer calls your business phone number</li>
              <li>If you don&apos;t answer after a few rings, the call forwards to your RingBackSMS number</li>
              <li>The caller hears a brief greeting: &quot;Hi, thanks for calling [Your Business]. We can help you faster by text — you&apos;ll receive a message in just a moment.&quot;</li>
              <li>They can optionally leave a voicemail (up to 60 seconds)</li>
              <li>Immediately, they receive your custom SMS greeting</li>
              <li>The AI continues the conversation from there</li>
            </ol>
          </SubSection>

          <SubSection title="Setup instructions by carrier">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Your RingBackSMS number</strong> can be found in <strong>Settings &rarr; Phone</strong>. You&apos;ll need this number for the steps below.
              </p>
            </div>

            <div className="space-y-3">
              <div className="border rounded-lg p-4">
                <p className="font-medium">iPhone / iOS</p>
                <p className="text-sm text-gray-600 mt-1">Go to <strong>Settings &rarr; Phone &rarr; Call Forwarding</strong> and enter your RingBackSMS number.</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="font-medium">Android</p>
                <p className="text-sm text-gray-600 mt-1">Open <strong>Phone app &rarr; Settings &rarr; Calls &rarr; Call forwarding &rarr; When unanswered</strong> and enter your RingBackSMS number.</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="font-medium">Landline / VoIP</p>
                <p className="text-sm text-gray-600 mt-1">Dial <strong>*71</strong> followed by your RingBackSMS number (e.g., *71-631-790-5591). To disable, dial <strong>*73</strong>. Contact your phone provider if these codes don&apos;t work — codes vary by carrier.</p>
              </div>
            </div>
          </SubSection>

          <SubSection title="What callers experience">
            <p className="text-gray-700">When a call goes unanswered, callers hear a short, professional greeting and can leave a voicemail. Simultaneously, they receive an SMS with your custom greeting. If voicemail is left, it&apos;s saved to the missed call record in your dashboard.</p>
          </SubSection>
        </Section>

        {/* ── AI & Conversations ──────────────────────────── */}
        <Section id="ai-conversations" title="AI & Conversations">
          <p className="text-gray-700 mb-4">RingBackSMS uses AI to have natural, helpful conversations with your callers via text. The AI knows about your business, your menu or services, and can direct customers to place orders or book appointments.</p>

          <SubSection title="How the AI works">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Personality:</strong> You can customize the AI&apos;s tone in Settings. Describe how you want it to sound — friendly, professional, casual, etc.</li>
              <li><strong>Business context:</strong> The AI knows your business name, type, address, hours, and available menu items or services. It references this info when answering questions.</li>
              <li><strong>Website context:</strong> If you add your website URL in Settings, the AI can extract info from your site to answer detailed questions.</li>
              <li><strong>SMS-optimized:</strong> Responses are kept concise (under 160 characters when possible) for the best text messaging experience.</li>
              <li><strong>Smart routing:</strong> When someone asks about food, the AI directs them to text ORDER. For appointments, it suggests texting MEETING.</li>
            </ul>
          </SubSection>

          <SubSection title="Conversation flows">
            <p className="text-gray-700 mb-3">RingBackSMS has three main conversation flows you can enable in the <strong>Flows</strong> page:</p>
            <div className="space-y-3">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                  <p className="font-medium">Fallback (General AI)</p>
                </div>
                <p className="text-sm text-gray-600">Handles general questions, provides info about your business, and directs customers to the right flow. Always recommended to keep enabled.</p>
              </div>
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingBag className="h-4 w-4 text-green-600" />
                  <p className="font-medium">Order</p>
                </div>
                <p className="text-sm text-gray-600">Takes food orders via text. Shows your menu, lets customers select items and quantities, confirms the order, and asks for pickup time. Best for restaurants and food businesses.</p>
              </div>
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  <p className="font-medium">Meeting</p>
                </div>
                <p className="text-sm text-gray-600">Schedules appointments via text. Customers provide their preferred date and time, and you get notified to confirm. Works with Cal.com for online booking.</p>
              </div>
            </div>
          </SubSection>

          <SubSection title="Viewing conversations">
            <p className="text-gray-700">Go to <strong>Conversations</strong> in the sidebar to see all SMS threads. You can search by phone number, filter by flow type (Order, Meeting, Fallback), and view the full message history for any conversation.</p>
          </SubSection>
        </Section>

        {/* ── Voicemails ──────────────────────────────────── */}
        <Section id="voicemails" title="Voicemails">
          <p className="text-gray-700 mb-4">Every missed call that leaves a recording shows up on the <strong>Voicemails</strong> page. Instead of pressing play on each one, you get a transcript, an AI summary, and a colored intent badge so the highest-value recoveries float to the top.</p>

          <SubSection title="AI transcription & summary">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Transcript:</strong> Generated automatically when the recording finishes — usually within ~30 seconds. Click any row to expand the full transcript.</li>
              <li><strong>One-line summary:</strong> The AI condenses what the caller wanted into a single sentence so you can triage at a glance.</li>
              <li><strong>Intent badge:</strong> Each voicemail is tagged <strong>ORDER</strong>, <strong>BOOKING</strong>, <strong>QUESTION</strong>, <strong>COMPLAINT</strong>, <strong>SPAM</strong>, or <strong>OTHER</strong>. Use the intent dropdown above the table to filter — e.g., show only ORDER voicemails during a busy lunch rush.</li>
              <li><strong>Status:</strong> While the transcript is being generated you&apos;ll see &quot;Transcribing…&quot;. If transcription fails (very noisy audio, dropped recording) the row is marked <strong>Failed</strong> — the original audio is still playable.</li>
            </ul>
          </SubSection>

          <SubSection title="One-click reply & callback">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Reply:</strong> The Reply button on each row opens a small popover with a message composer and your saved <a href="#settings" className="text-blue-600 hover:underline">reply templates</a> as one-tap chips. The reply is sent via SMS and threads into the caller&apos;s conversation, switching that thread to Human handoff so the AI stops auto-responding.</li>
              <li><strong>Call back:</strong> The Call back button is a tel: link that opens your device&apos;s dialer with the caller&apos;s number pre-filled.</li>
              <li><strong>Funnel impact:</strong> Replying from this view stamps the &quot;Owner responded&quot; step on the recovery funnel automatically — no extra bookkeeping.</li>
            </ul>
          </SubSection>
        </Section>

        {/* ── Menu & Orders ───────────────────────────────── */}
        <Section id="menu-orders" title="Menu & Orders">
          <p className="text-gray-700 mb-4">If you run a restaurant or food business, the Menu and Order system lets customers browse your offerings and place orders entirely via text.</p>

          <SubSection title="Managing your menu">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Go to <strong>Menu</strong> in the sidebar to add, edit, or remove items</li>
              <li>Each item has a name, price, category, description, and availability toggle</li>
              <li>Items are grouped by category (Appetizers, Mains, Desserts, etc.)</li>
              <li>Toggle items off when they&apos;re temporarily unavailable — they won&apos;t show to customers</li>
              <li>If you use <strong>Square, Clover, Toast, or Shopify</strong>, you can sync your menu automatically from your POS system in <strong>Integrations</strong></li>
            </ul>
          </SubSection>

          <SubSection title="How SMS ordering works">
            <ol className="list-decimal pl-6 text-gray-700 space-y-2">
              <li>A customer texts <strong>ORDER</strong> (or the AI directs them)</li>
              <li>They receive your menu with numbered items and prices</li>
              <li>They reply with their selection (e.g., &quot;1x2, 3x1&quot; for 2 of item 1 and 1 of item 3, or just item names)</li>
              <li>They see an order summary with total and reply <strong>YES</strong> to confirm</li>
              <li>They provide a pickup time</li>
              <li>If <strong>Require Upfront Payment</strong> is enabled, the customer receives a Stripe payment link via SMS. The order is only confirmed after payment is completed. If disabled, the order is placed immediately.</li>
              <li>You receive a notification with the order details</li>
            </ol>
          </SubSection>

          <SubSection title="Payments">
            <p className="text-gray-700 mb-3">RingBackSMS integrates with <strong>Stripe</strong> to collect payments during the SMS ordering flow.</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Payment links:</strong> After a customer confirms their order, they receive a secure Stripe Checkout link via SMS. They can pay on their phone in seconds.</li>
              <li><strong>Require Upfront Payment:</strong> Toggle this ON in <strong>Settings &rarr; Payments</strong> to require payment before the order is placed. The order is only created in your system after the customer completes payment.</li>
              <li><strong>Pay After Order:</strong> When upfront payment is OFF, the order is placed immediately and the payment link is sent as a follow-up. Useful for businesses that want to confirm the order first.</li>
              <li><strong>Expiration:</strong> Payment links expire after 30 minutes. If the link expires, the customer is notified via SMS and can text to start a new order.</li>
              <li><strong>Cancellation:</strong> While waiting for payment (upfront mode), customers can text <strong>CANCEL</strong> to abort and return to the menu.</li>
            </ul>
          </SubSection>

          <SubSection title="Managing orders">
            <p className="text-gray-700">Go to <strong>Orders</strong> to see all incoming orders. Each order shows its payment status (<strong>Unpaid</strong>, <strong>Pending</strong>, <strong>Paid</strong>, or <strong>Expired</strong>) alongside its fulfillment status:</p>
            <p className="text-sm text-gray-600 mt-2"><strong>Pending</strong> &rarr; <strong>Confirmed</strong> &rarr; <strong>Preparing</strong> &rarr; <strong>Ready</strong> &rarr; <strong>Completed</strong></p>
            <p className="text-sm text-gray-600 mt-1">You can advance the status or cancel at any stage. Orders auto-refresh every 30 seconds.</p>
          </SubSection>
        </Section>

        {/* ── Services & Booking ──────────────────────────── */}
        <Section id="services-booking" title="Services & Booking">
          <p className="text-gray-700 mb-4">If you run a service business (salon, clinic, plumber, auto shop, etc.), the Services page lets you list your offerings so the AI can tell callers what you provide and help them book appointments.</p>

          <SubSection title="Adding services">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Go to <strong>Services</strong> in the sidebar</li>
              <li>Add each service with a name, price, duration (in minutes), category, and description</li>
              <li>Services are automatically flagged as requiring booking</li>
              <li>The AI will reference your service list when callers ask what you offer or how much something costs</li>
            </ul>
          </SubSection>

          <SubSection title="How service booking works via SMS">
            <ol className="list-decimal pl-6 text-gray-700 space-y-2">
              <li>A caller asks about services — the AI lists what you offer with pricing and duration</li>
              <li>When they want to book, the ORDER flow shows services with duration info</li>
              <li>After selecting a service and confirming, they&apos;re asked for their preferred date and time</li>
              <li>You receive a notification with the booking request</li>
              <li>Confirm the appointment and the customer gets a confirmation text</li>
            </ol>
          </SubSection>
        </Section>

        {/* ── Meetings ────────────────────────────────────── */}
        <Section id="meetings" title="Meetings & Appointments">
          <p className="text-gray-700 mb-4">The Meeting flow handles appointment scheduling via SMS. Customers text <strong>MEETING</strong> to start the booking process.</p>

          <SubSection title="Setting up appointments">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Enable the <strong>Meeting</strong> flow in the <strong>Flows</strong> page</li>
              <li>Optionally, add your <strong>Cal.com booking link</strong> in Settings — customers get a direct link to book online</li>
              <li>Without Cal.com, customers provide their preferred date and time via text, and you confirm manually</li>
            </ul>
          </SubSection>

          <SubSection title="Managing meetings">
            <p className="text-gray-700">Go to <strong>Meetings</strong> to see all appointments. You can view them in a list or weekly calendar view. Each meeting can be confirmed, cancelled, or marked as completed.</p>
          </SubSection>
        </Section>

        {/* ── Contacts ────────────────────────────────────── */}
        <Section id="contacts" title="Contacts & CRM">
          <p className="text-gray-700 mb-4">RingBackSMS automatically builds a contact database from every caller who interacts with your business via SMS.</p>

          <SubSection title="Contact management">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Contacts are auto-created when someone calls and receives an SMS</li>
              <li>View each contact&apos;s full history: conversations, orders, and meetings</li>
              <li>Assign statuses: <strong>Lead</strong>, <strong>Customer</strong>, <strong>VIP</strong>, or <strong>Inactive</strong></li>
              <li>Add tags for custom grouping (e.g., &quot;catering&quot;, &quot;regular&quot;, &quot;follow-up&quot;)</li>
              <li>Write notes on any contact for your team</li>
              <li>Send a manual SMS directly from a contact&apos;s profile</li>
              <li>Export your contacts to CSV for use in other tools</li>
            </ul>
          </SubSection>

          <SubSection title="Automatic contact linking & VIP detection">
            <p className="text-gray-700 mb-2">Every missed call automatically upserts a Contact for the caller&apos;s phone number, so the same person across multiple calls is always one record. On the Voicemails page each row surfaces:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Caller name</strong> (when known) instead of just a masked phone number — clickable through to the contact profile.</li>
              <li><strong>Status badge:</strong> <strong>VIP</strong> (gold), <strong>Customer</strong> (green), or <strong>Lead</strong> (gray). Promote anyone to VIP from their contact profile to make their future calls jump out.</li>
              <li><strong>Repeat counter:</strong> A &quot;2nd call today&quot; / &quot;3rd call today&quot; badge appears when the same number has called more than once in the last 24 hours — the clearest signal that someone urgently needs you.</li>
            </ul>
          </SubSection>
        </Section>

        {/* ── Integrations ────────────────────────────────── */}
        <Section id="integrations" title="Integrations">
          <p className="text-gray-700 mb-4">Connect your existing tools to RingBackSMS to sync menus, push orders, and streamline your workflow.</p>

          <SubSection title="POS systems">
            <p className="text-gray-700 mb-3">We support four point-of-sale systems:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li><strong>Square</strong> — Sync your Square catalog to your RingBackSMS menu. Orders can be pushed back to Square.</li>
              <li><strong>Clover</strong> — Import your Clover menu items with pricing.</li>
              <li><strong>Toast</strong> — Pull your Toast menu structure and items.</li>
              <li><strong>Shopify</strong> — Import products from your Shopify store.</li>
            </ul>
            <p className="text-sm text-gray-600 mt-3">POS integrations are available on the <strong>Growth</strong> plan and above. Go to <strong>Integrations</strong> to connect. You can pull your catalog from the POS or push RingBackSMS items the other way, and every sync is logged with item counts and status.</p>
          </SubSection>

          <SubSection title="Other integrations">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Cal.com</strong> — Add your Cal.com booking link in Settings to let customers book appointments online.</li>
              <li><strong>Slack</strong> — Add a Slack webhook URL in Settings to receive order and meeting notifications in a Slack channel.</li>
            </ul>
          </SubSection>
        </Section>

        {/* ── Billing ─────────────────────────────────────── */}
        <Section id="billing" title="Billing & Plans">

          <SubSection title="Plans">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-semibold">Plan</th>
                    <th className="text-left py-2 pr-4 font-semibold">Price</th>
                    <th className="text-left py-2 pr-4 font-semibold">SMS/month</th>
                    <th className="text-left py-2 font-semibold">Key Features</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Starter</td>
                    <td className="py-2 pr-4">Free</td>
                    <td className="py-2 pr-4">25</td>
                    <td className="py-2">1 phone number, AI auto-responses, basic analytics</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Growth</td>
                    <td className="py-2 pr-4">$79/mo</td>
                    <td className="py-2 pr-4">750</td>
                    <td className="py-2">+ Order, Meeting &amp; Inquiry flows, POS integrations, daily digest</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Scale</td>
                    <td className="py-2 pr-4">$199/mo</td>
                    <td className="py-2 pr-4">5,000</td>
                    <td className="py-2">+ Slack, two-way POS sync, recovery funnel, urgency escalation</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Enterprise</td>
                    <td className="py-2 pr-4">Custom</td>
                    <td className="py-2 pr-4">Unlimited</td>
                    <td className="py-2">+ White-label, dedicated support, custom dev</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Usage & overages">
            <p className="text-gray-700">Your SMS usage is tracked on the <strong>Billing</strong> page. You&apos;ll receive email warnings at 75% and 90% of your plan limit. If you exceed your limit, additional SMS are billed at a metered rate.</p>
          </SubSection>

          <SubSection title="Managing your subscription">
            <p className="text-gray-700">Go to <strong>Billing</strong> to view your current plan, see your usage, and upgrade or downgrade. Click <strong>Manage Billing</strong> to access the Stripe customer portal where you can update your payment method, view invoices, or cancel.</p>
          </SubSection>
        </Section>

        {/* ── Settings ────────────────────────────────────── */}
        <Section id="settings" title="Settings">

          <SubSection title="Business profile">
            <p className="text-gray-700">Configure your business name, type, owner email, owner phone, address, and website URL. This information is used by the AI when responding to customers.</p>
          </SubSection>

          <SubSection title="Auto-response settings">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Greeting:</strong> The first SMS sent to callers when they miss your call. Keep it short and welcoming.</li>
              <li><strong>AI Personality:</strong> Describe how you want the AI to sound (e.g., &quot;warm, casual, and enthusiastic&quot; or &quot;professional and concise&quot;).</li>
              <li><strong>Website Context:</strong> Add your website URL and the AI will extract relevant info to better answer customer questions.</li>
            </ul>
          </SubSection>

          <SubSection title="Business hours">
            <p className="text-gray-700">Set your timezone and business hours for each day of the week. You can also add closed dates for holidays. The AI is aware of your hours and can tell callers when you&apos;re open.</p>
          </SubSection>

          <SubSection title="Payments">
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Require Upfront Payment:</strong> When toggled ON, customers must pay via Stripe before their order is confirmed. The order is only created after payment succeeds.</li>
              <li><strong>Pay After Order:</strong> When toggled OFF (default), orders are placed immediately and a payment link is sent as a follow-up.</li>
            </ul>
            <p className="text-sm text-gray-600 mt-2">Configure this in <strong>Settings &rarr; Payments</strong>.</p>
          </SubSection>

          <SubSection title="After-hours greetings">
            <p className="text-gray-700 mb-2">In the Greeting card you&apos;ll find a second pair of fields labeled <strong>After-hours SMS greeting</strong> and <strong>After-hours voice greeting</strong>. These are used whenever a call arrives outside the business hours configured in your <strong>Business Schedule</strong> (using the timezone set on your tenant).</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Leave them blank to fall back to your normal greeting around the clock.</li>
              <li>Use them to set a different tone after-hours — e.g., &quot;We&apos;re closed now, but reply MENU to order ahead for tomorrow.&quot;</li>
              <li>Double-check your <strong>Timezone</strong> setting first — that&apos;s what decides what counts as after-hours.</li>
            </ul>
          </SubSection>

          <SubSection title="Reply templates">
            <p className="text-gray-700">Manage your library of one-tap SMS replies in the <strong>Reply Templates</strong> card on Settings. Add a label and body for each template (e.g., &quot;On our way&quot;, &quot;Closed today&quot;, &quot;Pickup ready in 15&quot;). They appear as chips inside the Reply popover on every voicemail and conversation row.</p>
          </SubSection>

          <SubSection title="Phone number">
            <p className="text-gray-700">Go to <strong>Settings &rarr; Phone</strong> to provision a phone number or view your current number. This is the number callers are forwarded to and the number SMS messages come from.</p>
          </SubSection>
        </Section>

        {/* ── Analytics ───────────────────────────────────── */}
        <Section id="analytics" title="Analytics">
          <p className="text-gray-700 mb-4">The <strong>Analytics</strong> page gives you a bird&apos;s-eye view of how RingBackSMS is performing for your business.</p>
          <ul className="list-disc pl-6 text-gray-700 space-y-2">
            <li><strong>Missed calls handled:</strong> How many calls were caught and responded to</li>
            <li><strong>Conversations:</strong> Total SMS conversations with customers</li>
            <li><strong>Orders placed:</strong> Number of orders taken via text</li>
            <li><strong>Meetings booked:</strong> Appointments scheduled via SMS</li>
            <li><strong>Time period:</strong> View data for the last 7, 30, or 90 days</li>
          </ul>
          <p className="text-gray-700 mt-3">The <strong>Overview</strong> dashboard also shows a summary of key metrics plus your most recent conversations. Enable the <strong>Daily digest email</strong> in Settings and you&apos;ll get the same snapshot in your inbox every morning.</p>

          <SubSection title="Recovery funnel">
            <p className="text-gray-700 mb-2">The Recovery Funnel card on the Analytics page shows exactly where missed-call revenue is leaking. Each step counts unique missed calls and the bar between steps shows the drop rate:</p>
            <ol className="list-decimal pl-6 text-gray-700 space-y-1">
              <li><strong>Missed calls</strong> — every inbound call that wasn&apos;t answered.</li>
              <li><strong>SMS sent</strong> — your auto-greeting actually went out.</li>
              <li><strong>Caller replied</strong> — the caller texted back at least once.</li>
              <li><strong>Owner responded</strong> — you (or the AI) sent the first outbound reply, either from the dashboard or via SMS.</li>
              <li><strong>Orders / meetings created</strong> — the recovery converted into real revenue.</li>
            </ol>
            <p className="text-gray-700 mt-3">Below the funnel you&apos;ll see headline KPIs: <strong>conversion rate</strong> (orders ÷ missed calls), <strong>average response time</strong> (how long it takes you to reply), <strong>meetings booked</strong>, and <strong>week-over-week deltas</strong> on the headline numbers.</p>
          </SubSection>
        </Section>

        {/* ── FAQ ─────────────────────────────────────────── */}
        <Section id="agencies" title="Agencies & Multi-business">
          <p className="text-gray-700 mb-4">
            RingBackSMS supports agencies and operators managing multiple client businesses from a single login. Each client is a fully isolated organization with its own phone number, contacts, conversations, menu, settings, and Stripe subscription — no data bleeds between them.
          </p>
          <p className="text-gray-700 mb-6">
            <strong>Agency access is gated.</strong> By default, an account can own one organization. To enable multi-client management, email <strong>info@ringbacksms.com</strong> and we&apos;ll grant agency access on your account while we finalize agency pricing.
          </p>

          <SubSection title="Adding a new client">
            <Step number={1} title="Request agency access">
              Email support to enable agency access on your account. You&apos;ll be notified once it&apos;s granted.
            </Step>
            <Step number={2} title="Open the organization switcher">
              In the sidebar, click the organization name at the top to open the switcher, then choose <strong>Create organization</strong>.
            </Step>
            <Step number={3} title="Onboard the new client">
              Enter the client&apos;s business name and complete onboarding — phone number, greeting, menu or services, and business hours — just like your first business.
            </Step>
            <Step number={4} title="Switch between clients">
              Use the switcher any time to toggle between client dashboards. Everything you see is scoped to the active organization.
            </Step>
          </SubSection>

          <SubSection title="Inviting client staff">
            <p className="text-gray-700 text-sm">
              You can invite each client&apos;s team members as members of only their organization. They&apos;ll see just their own business and won&apos;t have access to your other clients. Manage members from the organization switcher&apos;s <strong>Manage organization</strong> panel.
            </p>
          </SubSection>
        </Section>

        <Section id="faq" title="Frequently Asked Questions">

          <FAQ question="Do I need to change my business phone number?">
            <p>No. You keep your existing business phone number. RingBackSMS works through call forwarding — when you can&apos;t answer, the call forwards to your RingBackSMS number and the caller gets a text. Your customers always call the same number they already know.</p>
          </FAQ>

          <FAQ question="What happens when someone calls my number?">
            <p>If you answer, nothing changes — it&apos;s a normal call. If you don&apos;t answer, the call forwards to RingBackSMS. The caller hears a short greeting and can leave a voicemail. At the same time, they receive an SMS with your custom greeting. The AI then handles the conversation from there.</p>
          </FAQ>

          <FAQ question="Can customers leave a voicemail?">
            <p>Yes. After the greeting, callers can leave a voicemail up to 60 seconds. The recording is saved to the missed call record in your dashboard. However, the greeting encourages them to use text for faster service — most callers will wait for the SMS instead.</p>
          </FAQ>

          <FAQ question="How quickly do callers receive the text?">
            <p>Within seconds. The SMS is sent as soon as the call comes in — often while the caller is still listening to the voicemail greeting.</p>
          </FAQ>

          <FAQ question="Can I customize what the AI says?">
            <p>Yes. You control the initial greeting, the AI&apos;s personality/tone, and the information it has access to (your menu, services, hours, website content). Go to <strong>Settings</strong> to configure these.</p>
          </FAQ>

          <FAQ question="Will the AI make things up or say something wrong?">
            <p>The AI only references information you&apos;ve provided — your menu items, services, business hours, and website content. It&apos;s designed to be helpful within what it knows. For questions it can&apos;t answer, it offers to have you follow up directly.</p>
          </FAQ>

          <FAQ question="Can I see all the messages the AI sends?">
            <p>Yes. Every conversation is logged in the <strong>Conversations</strong> page. You can see every message exchanged between the AI and your customers.</p>
          </FAQ>

          <FAQ question="What if I want to take over a conversation from the AI?">
            <p>You can hand off any conversation to yourself from the conversation detail view. Once handed off, the AI stops responding and you can reply manually.</p>
          </FAQ>

          <FAQ question="How does SMS ordering work?">
            <p>Customers text ORDER and see your numbered menu. They reply with item numbers and quantities (e.g., &quot;1x2, 3x1&quot;), confirm with YES, and provide a pickup time. If upfront payment is required, they receive a Stripe payment link and the order is confirmed once payment is complete. You get notified instantly. If you have a POS system connected, orders can be pushed there automatically.</p>
          </FAQ>

          <FAQ question="Can customers pay via text?">
            <p>Yes. After confirming an order, customers receive a secure Stripe Checkout link via SMS. They can pay directly on their phone. You can choose whether payment is required upfront (before the order is placed) or sent as a follow-up after the order is confirmed. Configure this in <strong>Settings &rarr; Payments</strong>.</p>
          </FAQ>

          <FAQ question="What happens if a payment link expires?">
            <p>Payment links expire after 30 minutes. If a customer doesn&apos;t complete payment in time, they receive an SMS letting them know the link expired. They can text back to start a new order. If upfront payment was required, no order is created until they pay.</p>
          </FAQ>

          <FAQ question="Can I import my menu from Square or another POS?">
            <p>Yes. Go to <strong>Integrations</strong> and connect your POS system. We support Square, Clover, Toast, and Shopify. Your menu syncs automatically. POS integrations require the Scale plan or above.</p>
          </FAQ>

          <FAQ question="What if my area code has no available phone numbers?">
            <p>When you search for a number and your area code is exhausted, we automatically search for nearby numbers in the same geographic area. You&apos;ll see alternatives from neighboring area codes that serve your location.</p>
          </FAQ>

          <FAQ question="Is my data secure?">
            <p>Yes. We use enterprise-grade encryption for sensitive credentials, row-level data isolation between businesses, and secure Twilio sub-accounts per tenant. Your customer data is never shared between businesses. See our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link> for details.</p>
          </FAQ>

          <FAQ question="How do I cancel my subscription?">
            <p>Go to <strong>Billing &rarr; Manage Billing</strong> to access the Stripe customer portal. You can cancel anytime — your account stays active until the end of the billing period, then downgrades to the free Starter plan.</p>
          </FAQ>

          <FAQ question="Can I use RingBackSMS for multiple businesses?">
            <p>Yes, with agency access enabled. RingBackSMS supports multiple organizations per login — use the organization switcher in the sidebar to switch between businesses. Each business gets its own phone number, menu, settings, and conversations. By default an account owns one organization; email <strong>info@ringbacksms.com</strong> to enable agency access.</p>
          </FAQ>

          <FAQ question="Can agencies resell RingBackSMS to their clients?">
            <p>Yes. With agency access enabled, you can manage every client from a single login. Each client is a fully isolated organization with its own phone number, data, team members, and Stripe subscription. Invoice your clients directly or roll the subscription cost into your managed-service fee.</p>
          </FAQ>

          <FAQ question="How do I get agency access?">
            <p>Email <strong>info@ringbacksms.com</strong> with a brief description of your agency and the number of clients you plan to manage. We&apos;ll enable agency access on your account while we finalize agency-tier pricing. There&apos;s no additional cost to enable the capability today.</p>
          </FAQ>

          <FAQ question="How does billing work when I manage multiple clients?">
            <p>Each client organization carries its own Stripe subscription — there&apos;s no combined bill. You&apos;ll see a separate subscription per client in the Billing tab of that client&apos;s dashboard. Agencies typically either point the subscription directly at the client&apos;s card, or pay it themselves and bill the client as part of a managed-service retainer.</p>
          </FAQ>

          <FAQ question="Can I grant a client access to only their own organization?">
            <p>Yes. Open the organization switcher, choose <strong>Manage organization</strong> on the client&apos;s org, and invite their staff as members of just that organization. They&apos;ll only see their own business — your other clients stay fully private.</p>
          </FAQ>

          <FAQ question="Why is my voicemail transcript blank or marked Failed?">
            <p>Transcripts come from Twilio&apos;s built-in transcription, which struggles with very noisy environments (busy kitchens, road noise) or extremely short recordings. When that happens the row is marked <strong>Failed</strong> — the audio is still playable, you just won&apos;t see text. We&apos;re working on a Whisper-based upgrade that will dramatically improve accuracy.</p>
          </FAQ>

          <FAQ question="How accurate is the intent tag on voicemails?">
            <p>The intent tag (ORDER, BOOKING, QUESTION, COMPLAINT, SPAM, OTHER) is generated by our AI from the transcript. It&apos;s very accurate when the transcript is clean. If the AI can&apos;t classify confidently — or if it errors out — it falls back to <strong>OTHER</strong> rather than guessing wrong, so you can still see and review the voicemail.</p>
          </FAQ>

          <FAQ question="Can I edit or add reply templates?">
            <p>Yes. Go to <strong>Settings &rarr; Reply Templates</strong> to create, rename, or delete templates. Each template has a short label (the chip text) and a longer body (what actually gets sent). Templates appear inside the Reply popover on every voicemail and conversation row.</p>
          </FAQ>

          <FAQ question="How do after-hours greetings decide what counts as &ldquo;after hours&rdquo;?">
            <p>RingBackSMS uses your <strong>Business Schedule</strong> and <strong>Timezone</strong> settings on the Settings page. If a call arrives outside those hours, the after-hours SMS and voice greetings are used. Closed dates (holidays) also count as after-hours. If either after-hours field is left blank, your normal greeting is used as the fallback.</p>
          </FAQ>

          <FAQ question="What does &ldquo;Owner responded&rdquo; mean in the recovery funnel?">
            <p>It&apos;s the first time you (or anyone on your team) sent an outbound message to the caller — either by clicking Reply on a voicemail/conversation in the dashboard, or by replying directly from your phone via SMS. We stamp it the moment that message goes out so the funnel reflects real human response times.</p>
          </FAQ>

          <FAQ question="Why isn&apos;t my VIP badge showing on a contact&apos;s voicemails?">
            <p>The VIP badge only appears when the linked contact&apos;s <strong>status</strong> is set to <strong>VIP</strong>. Open the contact from <strong>Contacts</strong>, change their status, and the badge will appear on every future voicemail row from that number (and on existing ones the next time you load the page).</p>
          </FAQ>

          <FAQ question="How do I get support?">
            <p>Email us at <strong>info@ringbacksms.com</strong> and we&apos;ll get back to you as soon as possible.</p>
          </FAQ>

        </Section>

      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Agape Technology Solutions. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
            <Link href="/help" className="hover:text-gray-900 font-medium">Help</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
