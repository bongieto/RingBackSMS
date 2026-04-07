import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Clock,
  MessageCircle,
  PhoneOff,
  ShieldCheck,
  TrendingUp,
  Zap,
  Store,
  UtensilsCrossed,
  Wrench,
  Scissors,
  Truck,
  Sparkles,
  Calendar,
  DollarSign,
  Package,
} from 'lucide-react';
import { BusinessType } from '@ringback/shared-types';

export type HubSlug = 'restaurants' | 'service-businesses' | 'retail';

export interface IndustryLandingContent {
  slug: string;                       // 'restaurants' or 'service-businesses/plumbing'
  kind: 'hub' | 'niche';
  parent?: HubSlug;
  businessType: BusinessType;
  hubIcon: LucideIcon;
  seo: {
    title: string;
    description: string;
    keywords: string[];
    ogImage?: string;
  };
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    primaryCta: { label: string; href: string };
    smsMockup: {
      businessName: string;
      messages: Array<{ from: 'caller' | 'bot'; text: string }>;
    };
  };
  painPoints: Array<{ title: string; body: string }>;
  benefits: Array<{ icon: LucideIcon; title: string; body: string }>;
  howItWorks: Array<{ step: string; title: string; body: string }>;
  testimonials: Array<{ quote: string; name: string; role: string }>;
  faqs: Array<{ q: string; a: string }>;
  statBar: Array<{ value: string; label: string }>;
  relatedNiches?: string[];
}

const COMMON_STATS = [
  { value: '62%', label: 'of calls to small businesses go unanswered' },
  { value: '85%', label: "of callers won't call back if you miss them" },
  { value: '<3s', label: 'RingBackSMS average response time' },
  { value: '24/7', label: 'AI coverage including after hours' },
];

const ctaHref = (hub: HubSlug) => `/sign-up?industry=${hub}`;

/* ─── HUBS ──────────────────────────────────────────────────────────────── */

const RESTAURANTS: IndustryLandingContent = {
  slug: 'restaurants',
  kind: 'hub',
  businessType: BusinessType.RESTAURANT,
  hubIcon: UtensilsCrossed,
  seo: {
    title: 'SMS for Restaurants — Text-Back Missed Calls | RingBackSMS',
    description:
      'Turn missed dinner-rush calls into pickup orders. AI texts back every caller in under 3 seconds, takes orders, and syncs to your POS. Built for restaurants & food trucks.',
    keywords: [
      'restaurant missed call text back',
      'SMS ordering for restaurants',
      'text to order food',
      'restaurant auto reply SMS',
      'pizza shop SMS ordering',
      'food truck text ordering',
      'restaurant AI phone assistant',
      'missed call software restaurant',
      'restaurant POS SMS integration',
      'Square SMS ordering',
      'Toast POS text ordering',
      'bakery SMS preorder',
    ],
  },
  hero: {
    eyebrow: 'For restaurants & food trucks',
    headline: 'Turn missed dinner-rush calls into pickup orders',
    subheadline:
      'When the kitchen is slammed and the phone keeps ringing, RingBackSMS texts every missed caller in under 3 seconds, takes their order, and sends it straight to your POS.',
    primaryCta: { label: 'Start Free Today', href: ctaHref('restaurants') },
    smsMockup: {
      businessName: "Tony's Pizzeria",
      messages: [
        { from: 'bot', text: "Hi! Sorry we missed your call at Tony's. Reply ORDER to start a pickup order or MENU to browse." },
        { from: 'caller', text: 'order' },
        { from: 'bot', text: 'Great! What would you like? (e.g. "1 large pepperoni, 1 caesar")' },
        { from: 'caller', text: '1 large pepperoni, 2 cokes' },
        { from: 'bot', text: 'Got it — 1 Large Pepperoni ($18) + 2 Cokes ($6) = $24. Pickup in 25 min? Reply YES to confirm.' },
      ],
    },
  },
  painPoints: [
    { title: 'The dinner rush kills your pickups', body: "62% of calls during peak hours go unanswered. Every missed call is a customer who ordered from the place that picked up." },
    { title: "Your staff can't juggle the phone", body: "Your line cooks and servers shouldn't be order-takers. The phone pulls them off tables and slows the kitchen." },
    { title: 'Voicemails get answered too late', body: 'By the time you call back, the customer already ate somewhere else. The average callback takes 47 minutes — dinner is over.' },
  ],
  benefits: [
    { icon: Bot, title: 'AI order-taker 24/7', body: 'Claude-powered AI reads your menu, answers questions, and walks the customer through an order in natural conversation.' },
    { icon: Zap, title: '<3 second response', body: 'Every missed call gets a personalized SMS within 3 seconds. Customers know you heard them before they call the next restaurant.' },
    { icon: Package, title: 'POS sync included', body: 'Works with Square, Clover, Toast, and Shopify. Menu imports automatically; orders appear in your POS as if they came from the register.' },
    { icon: DollarSign, title: 'Payment by text', body: 'Send a Stripe payment link in the same conversation. Orders come in paid, pickup is contactless.' },
    { icon: Clock, title: 'After-hours capture', body: "Closed Sunday? The AI still takes preorders for Monday. Your competitors are asleep; you're booking revenue." },
    { icon: ShieldCheck, title: 'Human handoff on urgency', body: 'Allergies, complaints, or weird requests escalate to you instantly via push or Slack. The AI knows when to hand off.' },
  ],
  howItWorks: [
    { step: '01', title: 'Connect your POS', body: 'One click to sync your menu from Square, Clover, or Toast. New items and 86-list updates flow automatically.' },
    { step: '02', title: 'Customer calls, you miss it', body: 'A hungry caller rings during the rush. Twilio detects the missed call and fires the flow within 3 seconds.' },
    { step: '03', title: 'Order lands in your POS', body: 'The AI takes the order by text, sends a payment link, and drops the confirmed ticket in your POS queue.' },
  ],
  testimonials: [
    { quote: "We used to lose 15-20 pickup orders every Friday to missed calls. Now they all come in as texts. Paid itself back in the first weekend.", name: 'Marco D.', role: 'Owner, Marco\'s Trattoria' },
    { quote: 'Our food truck moves every day and customers can never reach us. The SMS ordering is the single best thing we\'ve added.', name: 'Priya S.', role: 'Owner, Masala on Wheels' },
    { quote: "I was spending an hour every day returning missed-call voicemails. Now I spend zero. The AI does it better than I did.", name: 'James R.', role: 'Manager, The Corner Café' },
  ],
  faqs: [
    { q: 'Does it work with my POS?', a: 'Yes — we support Square, Clover, Toast, and Shopify out of the box. Your menu syncs automatically and orders post back into your POS as regular tickets. No new device, no counter clutter.' },
    { q: 'What if a customer wants something custom or weird?', a: "The AI handles normal modifiers ('no onions', 'extra cheese') natively. For unusual requests or complaints it escalates to you via push notification so you can take over the thread personally." },
    { q: 'Can it take orders after hours?', a: 'Yes. You set your business hours and an after-hours greeting. The AI can either take preorders for your next open slot or politely collect a callback request — your choice per tenant.' },
    { q: 'How do customers pay?', a: "Optional. You can enable Stripe payment links so orders arrive paid, or leave payment for pickup. Both work; most restaurants start with pay-at-pickup and switch on Stripe once they see the volume." },
    { q: 'Do I need a new phone number?', a: 'No. We provision a Twilio number that forwards to your existing line, or you can port your existing number. Either way, nothing changes for the customer.' },
  ],
  statBar: COMMON_STATS,
  relatedNiches: ['full-service', 'food-trucks', 'pizzerias', 'cafes-bakeries'],
};

const SERVICE_BUSINESSES: IndustryLandingContent = {
  slug: 'service-businesses',
  kind: 'hub',
  businessType: BusinessType.SERVICE,
  hubIcon: Wrench,
  seo: {
    title: 'SMS for Service Businesses — Book Jobs by Text | RingBackSMS',
    description:
      "Book appointments while you're on the job. AI texts every missed caller, quotes services, and schedules visits automatically. Built for salons, trades, cleaners & more.",
    keywords: [
      'appointment booking SMS',
      'service business missed call auto reply',
      'salon missed call text back',
      'plumber text back service',
      'cleaning company SMS booking',
      'HVAC SMS auto reply',
      'electrician missed call',
      'trade business SMS',
      'home services missed call',
      'service business AI receptionist',
      'auto reply for tradespeople',
      'SMS appointment scheduling',
    ],
  },
  hero: {
    eyebrow: 'For salons, trades, cleaners, and home-services',
    headline: "Book appointments while you're on the job",
    subheadline:
      "You can't answer the phone mid-haircut or mid-pipe-repair. RingBackSMS texts every missed caller within 3 seconds, quotes the service, and drops the booking onto your calendar.",
    primaryCta: { label: 'Start Free Today', href: ctaHref('service-businesses') },
    smsMockup: {
      businessName: 'Hendricks Plumbing',
      messages: [
        { from: 'bot', text: 'Hi! Sorry we missed your call at Hendricks Plumbing. What\'s going on? We\'ll text you a quote and book a visit.' },
        { from: 'caller', text: 'kitchen sink is leaking pretty bad' },
        { from: 'bot', text: 'Sounds urgent — sorry about that. We can come out today between 2–4 PM for an $89 diagnostic visit. Reply YES to book.' },
        { from: 'caller', text: 'yes please' },
        { from: 'bot', text: "You're on the calendar for today 2–4 PM. Mike will call 15 min before he arrives. Thanks!" },
      ],
    },
  },
  painPoints: [
    { title: "You can't take the call with gloves on", body: "Hands full with a client, under a sink, up a ladder — every ring goes to voicemail. And 85% of those callers never call back." },
    { title: 'Voicemail tag kills the lead', body: "You call them back after the job. They called three other plumbers. The fastest reply wins — and you weren't it." },
    { title: 'No-shows cost you a half-day', body: 'When you finally do book, you have no automated reminders and people ghost. One no-show = two hours of lost billable time.' },
  ],
  benefits: [
    { icon: Bot, title: 'AI receptionist 24/7', body: "Sounds like a professional front-desk person. Quotes your standard services, asks qualifying questions, and only escalates the weird stuff." },
    { icon: Calendar, title: 'Drops jobs on your calendar', body: "Integrates with Cal.com or your existing scheduler. The customer picks a slot via text and it's on your calendar before you finish the current job." },
    { icon: Zap, title: 'Replies in under 3 seconds', body: "Your customer gets a real reply before they can dial the next business on their list. The race to respond is over." },
    { icon: MessageCircle, title: 'Auto reminders & confirmations', body: 'Reduces no-shows by ~50% with 24-hour and 2-hour SMS reminders, and a "Running late?" check-in 10 min before.' },
    { icon: TrendingUp, title: 'Lead quality scoring', body: 'Tags every inbound by intent (urgent/quote/question/spam) so you know which leads to call personally and which the AI can close.' },
    { icon: ShieldCheck, title: 'Escalates real emergencies', body: 'Flood? Gas smell? Power out? The AI recognizes urgency keywords and pings you immediately via push or Slack.' },
  ],
  howItWorks: [
    { step: '01', title: 'Tell the AI about your services', body: "2-minute setup — type in your service list and prices, or let the AI scrape them from your website automatically." },
    { step: '02', title: 'Work the job, ignore the phone', body: "Calls come in while you're on a job. You don't touch your phone. The AI handles the conversation from first text." },
    { step: '03', title: 'Walk off the job with bookings waiting', body: "Check your phone between jobs and find a calendar full of confirmed appointments. That's it." },
  ],
  testimonials: [
    { quote: "I'm a solo electrician. Before this I'd lose 3-4 leads a day to voicemail. Now every one of them gets a text back and I book half of them without lifting a finger.", name: 'Derek M.', role: 'Master Electrician, Bright Spark' },
    { quote: "I run a salon with 4 stylists. We stopped missing client bookings completely. The AI re-books regulars, answers 'do you have an opening?' 100 times a day — and my front desk can finally check people out.", name: 'Alicia T.', role: 'Owner, Olive Branch Salon' },
    { quote: "Home health is relationship-driven and families panic when nobody picks up. Now they get a warm response immediately and a real human follows up within the hour.", name: 'Robert K.', role: 'Director, Sunrise Home Care' },
  ],
  faqs: [
    { q: 'Does it integrate with my scheduling software?', a: 'Yes — Cal.com is built in. Google Calendar, Square Appointments, and Acuity work via standard integrations. If you use a niche scheduler we can add a webhook in minutes.' },
    { q: 'Will the AI sound like a robot?', a: 'No. Every tenant gets a custom personality tuned to their business — friendly salon, no-nonsense trades, warm caregiving. Most customers assume they\'re texting your front desk.' },
    { q: 'Can it handle emergencies?', a: 'Yes. You define urgency keywords (flood, no power, elderly fall, etc.) and the AI escalates those directly to your phone as a push notification instead of handling them via text.' },
    { q: "Do I need a new phone number?", a: "No. Keep your existing number or port it to us. Either way, customers see your business name — not 'Unknown.'" },
    { q: 'How much does it cost?', a: 'Free Starter plan up to 25 SMS/month. Growth at $49/mo covers up to 500 SMS which is enough for most solo operators. Scale at $99/mo for busy multi-tech shops.' },
  ],
  statBar: COMMON_STATS,
  relatedNiches: ['beauty-salons', 'cleaning-services', 'caregiving-home-health', 'plumbing', 'electrical', 'hvac'],
};

const RETAIL: IndustryLandingContent = {
  slug: 'retail',
  kind: 'hub',
  businessType: BusinessType.RETAIL,
  hubIcon: Store,
  seo: {
    title: 'SMS for Retail Shops — Answer "Do You Have It?" by Text | RingBackSMS',
    description:
      'Small retailers lose customers to "do you have it in stock?" calls. RingBackSMS texts back instantly, checks your catalog, and holds items for pickup. Built for boutiques, florists, cake shops & more.',
    keywords: [
      'boutique SMS auto reply',
      'shop product availability text',
      'florist missed call text back',
      'retail missed call software',
      'small shop SMS ordering',
      'cake shop SMS order',
      'wedding photographer lead SMS',
      'boutique product inquiry text',
      'retail AI assistant',
      'retail text back service',
      'product availability SMS',
      'shop reservation text',
    ],
  },
  hero: {
    eyebrow: 'For boutiques, florists, cake shops & specialty retail',
    headline: "Answer 'do you have it?' in 3 seconds — even when the shop's closed",
    subheadline:
      "Your callers want to know if you carry something before they drive over. RingBackSMS checks your catalog, answers instantly by text, and holds the item for pickup.",
    primaryCta: { label: 'Start Free Today', href: ctaHref('retail') },
    smsMockup: {
      businessName: 'Petal & Stem',
      messages: [
        { from: 'bot', text: 'Hi! Sorry we missed your call at Petal & Stem. What are you looking for?' },
        { from: 'caller', text: 'do you have the large white rose bouquet' },
        { from: 'bot', text: 'Yes! White rose bouquet (large) is $65. In stock now. Want us to hold one for you? Reply YES to reserve.' },
        { from: 'caller', text: 'yes please' },
        { from: 'bot', text: "Reserved! We'll hold your white rose bouquet. See you at pickup — text STOP anytime." },
      ],
    },
  },
  painPoints: [
    { title: 'Phone rings while you\'re with a customer', body: "You can't leave a customer at the counter to answer. The caller hangs up and drives to the next shop." },
    { title: '"Do you have it?" calls drown you', body: 'Same 3 questions all day — in stock? how much? hours? — and each one pulls you off the floor for 2 minutes.' },
    { title: 'Closed hours = zero inquiries captured', body: 'Brides browse on Sunday. Parents plan birthdays at midnight. Your competitors\' websites capture those leads; your voicemail buries them.' },
  ],
  benefits: [
    { icon: Package, title: 'Catalog-aware replies', body: 'The AI matches customer questions against your product catalog in real time. "Any blue scarves?" → photo + price + in-stock status in 3 seconds.' },
    { icon: Sparkles, title: 'Reserve by text', body: 'Customers can reserve an item via text with a single "YES". The reservation shows up on your action-items inbox for pickup confirmation.' },
    { icon: Zap, title: 'Under-3-second replies', body: 'Callers get a real answer before they dial the next shop. No more "let me check and call you back."' },
    { icon: Clock, title: '24/7 coverage', body: "Answer 'are you open?' and 'do you have it?' inquiries overnight, on Sundays, and during holidays — even when the shop is dark." },
    { icon: MessageCircle, title: 'Human handoff for custom', body: 'Custom-cake sizing, wedding consultations, and bespoke orders escalate to you via push so you can take over personally.' },
    { icon: ShieldCheck, title: 'Inventory toggle, not inventory hell', body: 'Mark items "in stock" / "out of stock" with a toggle. No SKUs, no barcodes, no Shopify migration. Built for shops with <500 items.' },
  ],
  howItWorks: [
    { step: '01', title: 'Add your products', body: 'Paste in a product list with prices, or let the AI pull them from your Instagram / website. Toggle each one "in stock" when you get it.' },
    { step: '02', title: 'Customer texts "do you have…?"', body: "The AI searches your catalog, finds the match, and replies with name + price + photo + in-stock status — in under 3 seconds." },
    { step: '03', title: 'They reserve, you fulfill', body: "Reply YES and the item is on hold for pickup. You get a task in your inbox; they get a confirmation text." },
  ],
  testimonials: [
    { quote: "I run a 200-sq-ft flower shop solo. The phone used to be my biggest stressor. Now customers text me and I don't even look at my phone until I'm done arranging.", name: 'Elena V.', role: 'Owner, Petal & Stem' },
    { quote: "Custom cake inquiries used to come in by phone and I'd miss half of them. Now every bride gets an immediate reply, and I close them at like 3x the rate.", name: 'Danielle P.', role: 'Owner, Sugar & Spice Bakery' },
    { quote: "Wedding photographers live and die by lead response time. I book about 70% of the inquiries that hit within 5 minutes — RingBackSMS gets me there every time.", name: 'Marcus L.', role: 'Owner, Lune Photography' },
  ],
  faqs: [
    { q: 'Do I need real inventory software?', a: "No — that's exactly what RingBackSMS is designed to avoid. Each product has a simple in-stock toggle. No SKUs, no barcodes, no reorder points. If you need real inventory, use Shopify; if you need fast replies to 'do you have it?', use us." },
    { q: 'How does the AI know my products?', a: "You add products through a simple form (name, price, description, photo URL, in-stock toggle). The AI matches inbound questions against the catalog via token and description match. Typical setup takes 20 minutes." },
    { q: 'Can customers reserve items?', a: 'Yes. When there\'s a match, the AI offers to hold the item and creates a reservation task in your dashboard when the customer replies YES. No payment required at reservation time.' },
    { q: 'What about custom orders?', a: 'Custom cakes, bouquets, and bespoke items escalate to you via push notification. The AI collects the basic info first (size, date, budget, photo references) so you have everything you need when you take over the conversation.' },
    { q: 'Will this replace my Instagram DMs?', a: "No. Customers reach you wherever they already call. RingBackSMS only handles the SMS/voice channel — your Insta DMs stay where they are." },
  ],
  statBar: COMMON_STATS,
  relatedNiches: ['florists', 'cake-shops', 'wedding-photographers', 'boutiques'],
};

/* ─── NICHES (empty scaffolding — filled in PR 2) ──────────────────────── */

const niche = (
  parent: HubSlug,
  slug: string,
  businessType: BusinessType,
  hubIcon: LucideIcon,
  title: string,
  headline: string,
  description: string
): IndustryLandingContent => ({
  slug: `${parent}/${slug}`,
  kind: 'niche',
  parent,
  businessType,
  hubIcon,
  seo: {
    title,
    description,
    keywords: [headline.toLowerCase(), `${slug.replace(/-/g, ' ')} missed call text back`, `${slug.replace(/-/g, ' ')} SMS auto reply`],
  },
  hero: {
    eyebrow: `For ${slug.replace(/-/g, ' ')}`,
    headline,
    subheadline: description,
    primaryCta: { label: 'Start Free Today', href: ctaHref(parent) },
    smsMockup: { businessName: 'Your Business', messages: [] },
  },
  painPoints: [],
  benefits: [],
  howItWorks: [],
  testimonials: [],
  faqs: [],
  statBar: COMMON_STATS,
});

const RESTAURANT_NICHES: IndustryLandingContent[] = [
  niche('restaurants', 'full-service', BusinessType.RESTAURANT, UtensilsCrossed,
    'SMS for Full-Service Restaurants | RingBackSMS',
    'Never miss a reservation call during the rush',
    'Host stand too busy to pick up? The AI answers calls, takes reservations, and quotes your menu while your team works the floor.'),
  niche('restaurants', 'food-trucks', BusinessType.RESTAURANT, Truck,
    'SMS Ordering for Food Trucks | RingBackSMS',
    'Let hungry customers text-order before they get in line',
    'Your truck moves every day. The AI tells callers where you are, takes preorders, and holds them for pickup when they arrive.'),
  niche('restaurants', 'pizzerias', BusinessType.RESTAURANT, UtensilsCrossed,
    'SMS Ordering for Pizzerias | RingBackSMS',
    "Take pizza orders by text — even when the phone's on fire",
    'Friday night rush too loud to hear the phone? The AI takes pizza orders by text, sends them to your POS, and quotes pickup times.'),
  niche('restaurants', 'cafes-bakeries', BusinessType.RESTAURANT, UtensilsCrossed,
    'SMS Preorders for Cafés & Bakeries | RingBackSMS',
    'Turn morning-rush missed calls into preorders',
    'The 7–9 AM rush makes the phone useless. The AI takes coffee and pastry preorders overnight and during the rush.'),
];

const SERVICE_NICHES: IndustryLandingContent[] = [
  niche('service-businesses', 'beauty-salons', BusinessType.SERVICE, Scissors,
    'SMS Booking for Beauty Salons | RingBackSMS',
    "Book blowouts while you're holding scissors",
    "Hands full with a client? The AI books appointments, answers 'do you have an opening?', and handles rebooking regulars automatically."),
  niche('service-businesses', 'cleaning-services', BusinessType.SERVICE, Sparkles,
    'SMS for Cleaning Services | RingBackSMS',
    'Quote cleanings by text between jobs',
    'Driving between houses? The AI collects square footage, frequency, and date preferences — you walk into every break with booked jobs.'),
  niche('service-businesses', 'caregiving-home-health', BusinessType.SERVICE, ShieldCheck,
    'SMS for Caregiving & Home Health | RingBackSMS',
    "Answer every family's call — even during a shift",
    'Families panic when nobody picks up. The AI gives them an immediate warm reply and escalates urgent requests to your on-call coordinator.'),
  niche('service-businesses', 'plumbing', BusinessType.SERVICE, Wrench,
    'SMS for Plumbers | RingBackSMS',
    'Capture every leak before it calls the next plumber',
    "You can't answer with gloves on. The AI quotes diagnostic visits, detects emergency keywords, and books jobs on your calendar."),
  niche('service-businesses', 'electrical', BusinessType.SERVICE, Zap,
    'SMS for Electricians | RingBackSMS',
    "Quote jobs by text while you're on a ladder",
    "The AI collects scope, urgency, and location, books the estimate visit, and escalates panel-fire emergencies to your phone immediately."),
  niche('service-businesses', 'hvac', BusinessType.SERVICE, Wrench,
    'SMS for HVAC Contractors | RingBackSMS',
    "Book service calls while you're on a rooftop",
    "Peak-season no-AC calls overwhelm your phone. The AI triages, quotes, and books service visits so you walk off every roof to a packed schedule."),
];

const RETAIL_NICHES: IndustryLandingContent[] = [
  niche('retail', 'florists', BusinessType.RETAIL, Sparkles,
    'SMS for Florists | RingBackSMS',
    'Send last-minute bouquets without losing the call',
    'Funeral, birthday, anniversary — florist calls are urgent. The AI checks your arrangements, quotes delivery, and holds stems for pickup.'),
  niche('retail', 'cake-shops', BusinessType.RETAIL, Sparkles,
    'SMS for Cake Shops & Custom Bakers | RingBackSMS',
    'Take custom-cake inquiries by text 24/7',
    'Brides and parents plan at night. The AI collects size, date, flavors, and reference photos so every inquiry lands in your inbox ready to quote.'),
  niche('retail', 'wedding-photographers', BusinessType.RETAIL, Sparkles,
    'SMS for Wedding Photographers | RingBackSMS',
    'Reply to every bride in under a minute',
    'Lead response time decides who gets booked. The AI replies instantly, collects date + venue + package interest, and hands hot leads to you.'),
  niche('retail', 'boutiques', BusinessType.RETAIL, Store,
    'SMS for Boutiques | RingBackSMS',
    "Answer 'do you have it in my size?' instantly",
    "Regulars text you from the parking lot. The AI checks your catalog, answers size and stock questions, and holds items for pickup."),
];

/* ─── Registry ────────────────────────────────────────────────────────── */

const ALL: IndustryLandingContent[] = [
  RESTAURANTS,
  SERVICE_BUSINESSES,
  RETAIL,
  ...RESTAURANT_NICHES,
  ...SERVICE_NICHES,
  ...RETAIL_NICHES,
];

export const INDUSTRY_LANDING: Record<string, IndustryLandingContent> = Object.fromEntries(
  ALL.map((entry) => [entry.slug, entry])
);

export const HUB_SLUGS: HubSlug[] = ['restaurants', 'service-businesses', 'retail'];

export function getIndustryLanding(slug: string): IndustryLandingContent | null {
  return INDUSTRY_LANDING[slug] ?? null;
}

export function getAllIndustrySlugPaths(): string[][] {
  // returns slug arrays for generateStaticParams:
  // [['restaurants'], ['service-businesses','plumbing'], ...]
  return ALL.map((entry) => entry.slug.split('/'));
}

export function getHubs(): IndustryLandingContent[] {
  return ALL.filter((e) => e.kind === 'hub');
}

export function getNichesForHub(hub: HubSlug): IndustryLandingContent[] {
  return ALL.filter((e) => e.kind === 'niche' && e.parent === hub);
}
