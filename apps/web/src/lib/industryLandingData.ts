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

/* ─── Hero background images (Unsplash, hot-linked like homepage) ─── */
const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2000&q=80`;

const HERO_IMAGE_HUB: Record<HubSlug, string> = {
  restaurants: UNSPLASH('photo-1517248135467-4c7edcad34c4'),
  'service-businesses': UNSPLASH('photo-1581578731548-c64695cc6952'),
  retail: UNSPLASH('photo-1441986300917-64674bd600d8'),
};

const HERO_IMAGE_NICHE: Record<string, string> = {
  'restaurants/full-service': UNSPLASH('photo-1414235077428-338989a2e8c0'),
  'restaurants/food-trucks': UNSPLASH('photo-1565299585323-38d6b0865b47'),
  'restaurants/pizzerias': UNSPLASH('photo-1513104890138-7c749659a591'),
  'restaurants/cafes-bakeries': UNSPLASH('photo-1509440159596-0249088772ff'),
  'service-businesses/beauty-salons': UNSPLASH('photo-1560066984-138dadb4c035'),
  'service-businesses/cleaning-services': UNSPLASH('photo-1527515637462-cff94eecc1ac'),
  'service-businesses/caregiving-home-health': UNSPLASH('photo-1576765608535-5f04d1e3f289'),
  'service-businesses/plumbing': UNSPLASH('photo-1585704032915-c3400ca199e7'),
  'service-businesses/electrical': UNSPLASH('photo-1565608087341-404b25492fee'),
  'service-businesses/hvac': UNSPLASH('photo-1631545806609-19c0caa75bd0'),
  'retail/florists': UNSPLASH('photo-1490750967868-88aa4486c946'),
  'retail/cake-shops': UNSPLASH('photo-1535254973040-607b474cb50d'),
  'retail/wedding-photographers': UNSPLASH('photo-1519741497674-611481863552'),
  'retail/boutiques': UNSPLASH('photo-1567401893414-76b7b1e5a7a5'),
};

export function getHeroImage(entry: IndustryLandingContent): string {
  const override = HERO_IMAGE_NICHE[entry.slug];
  if (override) return override;
  if (entry.kind === 'hub') return HERO_IMAGE_HUB[entry.slug as HubSlug];
  return HERO_IMAGE_HUB[entry.parent!];
}

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
    { icon: Calendar, title: 'Drops jobs on your calendar', body: "The AI sends a Cal.com booking link right in the conversation — or hands the request off to your existing scheduler. The customer picks a slot via text and it's on your calendar before you finish the current job." },
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
    { q: 'Does it integrate with my scheduling software?', a: 'Yes — drop your Cal.com booking link into Settings and the AI sends it to the customer in the conversation. Google Calendar, Square Appointments, and Acuity work the same way. If you use a niche scheduler we can add a webhook in minutes.' },
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

/* ─── NICHE helper ──────────────────────────────────────────────────── */

interface NicheConfig {
  parent: HubSlug;
  slug: string;
  businessType: BusinessType;
  hubIcon: LucideIcon;
  eyebrow: string;
  title: string;
  headline: string;
  subheadline: string;
  keywords: string[];
  mockup: { businessName: string; messages: Array<{ from: 'caller' | 'bot'; text: string }> };
  painPoints: Array<{ title: string; body: string }>;
  benefits: Array<{ icon: LucideIcon; title: string; body: string }>;
  howItWorks: Array<{ step: string; title: string; body: string }>;
  testimonials: Array<{ quote: string; name: string; role: string }>;
  faqs: Array<{ q: string; a: string }>;
}

const niche = (c: NicheConfig): IndustryLandingContent => ({
  slug: `${c.parent}/${c.slug}`,
  kind: 'niche',
  parent: c.parent,
  businessType: c.businessType,
  hubIcon: c.hubIcon,
  seo: { title: c.title, description: c.subheadline, keywords: c.keywords },
  hero: {
    eyebrow: c.eyebrow,
    headline: c.headline,
    subheadline: c.subheadline,
    primaryCta: { label: 'Start Free Today', href: ctaHref(c.parent) },
    smsMockup: c.mockup,
  },
  painPoints: c.painPoints,
  benefits: c.benefits,
  howItWorks: c.howItWorks,
  testimonials: c.testimonials,
  faqs: c.faqs,
  statBar: COMMON_STATS,
});

/* ─── Shared niche pieces ──────────────────────────────────────────── */

const commonServiceBenefits = (verb: string, thing: string): NicheConfig['benefits'] => [
  { icon: Bot, title: 'AI receptionist 24/7', body: `Sounds like your front-desk person — quotes ${thing}, answers common questions, and only escalates the weird stuff.` },
  { icon: Zap, title: '<3 second replies', body: 'Customers get a real answer before they dial the next business on the list.' },
  { icon: Calendar, title: 'Books into your calendar', body: `${verb} confirmed appointments via a Cal.com booking link sent right in the conversation — works with Google Calendar, Square Appointments, and Acuity too.` },
  { icon: MessageCircle, title: 'Reminders + no-show defense', body: '24-hour and 2-hour SMS reminders cut no-shows by ~50%. Customers can reschedule by text in one tap.' },
  { icon: ShieldCheck, title: 'Emergency escalation', body: 'Real urgencies ping your phone immediately via push or Slack — the AI knows when to back off.' },
  { icon: TrendingUp, title: 'Rapid-redial detection', body: 'NEW / RAPID_REDIAL / RETURNING caller tags surface urgency instantly — real emergencies jump the queue.' },
];

const commonRestaurantBenefits = (): NicheConfig['benefits'] => [
  { icon: Bot, title: 'AI order-taker with modifiers', body: 'Handles half-and-half pizzas, size upcharges, and allergy notes in natural conversation.' },
  { icon: Zap, title: '<3 second reply', body: 'First response in under 3 seconds — before the caller hits the next shop.' },
  { icon: Package, title: 'Two-way POS sync', body: 'Square, Clover, Toast, Shopify. Import your menu or push RingBackSMS items back to POS, with full sync history.' },
  { icon: DollarSign, title: 'Reorder memory', body: '"Last time you got the large pepperoni — reply SAME to reorder." Regulars checkout in two taps.' },
  { icon: Clock, title: 'Holiday-aware hours', body: 'Per-day business hours plus closed-date calendar — the AI knows when you\'re actually open.' },
  { icon: ShieldCheck, title: 'Escalates the weird stuff', body: 'Allergies, complaints, big-party asks → push notification so you can take over in one tap.' },
];

const commonRetailBenefits = (): NicheConfig['benefits'] => [
  { icon: Package, title: 'Catalog-aware replies', body: 'Matches customer questions against your catalog in real time — name, price, photo, stock status.' },
  { icon: Sparkles, title: 'Reserve by text', body: 'Customer replies YES and the item is on hold — reservation task appears in your inbox.' },
  { icon: Zap, title: 'Remembers every caller', body: 'Returning shoppers are recognized instantly, past conversations summarized into the AI prompt.' },
  { icon: Clock, title: 'Holiday-aware hours', body: 'Per-day schedules plus closed-date calendar — the AI honors your actual calendar.' },
  { icon: MessageCircle, title: 'AI ↔ human handoff', body: 'One-tap take-over — AI steps back, you finish the chat with full context pre-collected.' },
  { icon: ShieldCheck, title: 'Reply templates', body: 'Save your most-used responses as one-tap snippets for the moments you take over.' },
];

/* ─── Niches ───────────────────────────────────────────────────────── */

const RESTAURANT_NICHES: IndustryLandingContent[] = [
  niche({
    parent: 'restaurants',
    slug: 'full-service',
    businessType: BusinessType.RESTAURANT,
    hubIcon: UtensilsCrossed,
    eyebrow: 'For full-service restaurants',
    title: 'SMS for Full-Service Restaurants | RingBackSMS',
    headline: 'Never miss a reservation call during the rush',
    subheadline: "The host stand can't answer when every table wants a check. RingBackSMS texts back every missed caller, takes reservations, and answers menu questions so your team can work the floor.",
    keywords: ['full service restaurant missed calls', 'restaurant reservation SMS', 'SMS for restaurants', 'restaurant text back service', 'dining reservation auto reply'],
    mockup: {
      businessName: 'The Olive Tree',
      messages: [
        { from: 'bot', text: 'Hi! Sorry we missed your call at The Olive Tree. Looking for a reservation or have a menu question?' },
        { from: 'caller', text: 'table for 4 tonight 7pm' },
        { from: 'bot', text: 'We have 7:15 or 8:00 tonight for 4 — which works? (Name and phone please)' },
        { from: 'caller', text: '7:15 works, Maria 555-2211' },
        { from: 'bot', text: "Booked! Table for 4 at 7:15 tonight under Maria. See you soon — reply CANCEL if plans change." },
      ],
    },
    painPoints: [
      { title: 'Host stand is slammed at 6:45', body: 'Every ring goes to voicemail while your host seats parties. Reservation callers give up and book your competitor.' },
      { title: 'Callback tag is useless', body: 'By the time you call back at 10 PM, the party ate somewhere else. Missed reservations = empty tables.' },
      { title: 'Menu questions eat your evening', body: '"Do you have gluten-free?" "Is the salmon wild?" 40 times a night — the AI answers before your host picks up.' },
    ],
    benefits: commonRestaurantBenefits(),
    howItWorks: [
      { step: '01', title: 'Connect your POS or import menu', body: 'One click from Square, Clover, Toast, or paste your menu in manually.' },
      { step: '02', title: 'Caller pings during the rush', body: 'Missed call triggers the AI within 3 seconds. Reservation or menu question — handled.' },
      { step: '03', title: 'Reservation on the book', body: 'Confirmed bookings flow to your reservation system or get SMSed to your host stand.' },
    ],
    testimonials: [
      { quote: 'We\'d lose a dozen reservations every Saturday to voicemail. Not anymore. The host team actually gets to seat tables.', name: 'Luca M.', role: 'Owner, Trattoria Amorino' },
      { quote: 'It answers the same 5 menu questions 50 times a night so my host doesn\'t have to. Worth every penny.', name: 'Rachel K.', role: 'GM, Harbor Grill' },
      { quote: 'Late-night callback requests killed my evenings. Now the AI books them on the spot.', name: 'Chef André B.', role: 'Owner, Bistro 8' },
    ],
    faqs: [
      { q: 'Does it integrate with OpenTable / Resy / SevenRooms?', a: 'We integrate with the platforms that expose a public API — currently OpenTable and SevenRooms. For Resy and legacy systems we SMS the confirmed booking to your host stand for manual entry, which takes under 30 seconds per reservation.' },
      { q: 'Can it quote the menu?', a: 'Yes. Import your menu from your POS and the AI answers ingredient, allergen, and price questions directly. Specials can be added in a single text field that updates in real time.' },
      { q: 'What about large parties?', a: 'Parties above a threshold you set (e.g. 8+) escalate directly to you via push notification so you can quote private dining or special menus yourself.' },
      { q: 'Will it replace my host?', a: "No — it backs up your host during the rush. Most restaurants use it as a 'second host' that handles the phone while the human works the door." },
      { q: 'Do I need new hardware?', a: 'No. We provision a Twilio number that forwards to your existing line or port your number. Zero counter footprint.' },
    ],
  }),
  niche({
    parent: 'restaurants',
    slug: 'food-trucks',
    businessType: BusinessType.RESTAURANT,
    hubIcon: Truck,
    eyebrow: 'For food trucks & pop-ups',
    title: 'SMS Ordering for Food Trucks | RingBackSMS',
    headline: 'Let hungry customers text-order before they get in line',
    subheadline: "Your truck moves every day and the line is 30-deep. RingBackSMS tells callers where you are, takes preorders by text, and holds them hot for pickup when the customer shows up.",
    keywords: ['food truck SMS ordering', 'food truck text to order', 'food truck missed call', 'mobile food SMS', 'food truck preorder system'],
    mockup: {
      businessName: 'Masala on Wheels',
      messages: [
        { from: 'bot', text: "Hi! Masala on Wheels here. Today we're parked at 5th & Main until 3 PM. Want to preorder?" },
        { from: 'caller', text: 'yes 2 chicken tikka wraps and a mango lassi' },
        { from: 'bot', text: 'Got it — 2 Chicken Tikka Wraps ($22) + Mango Lassi ($5) = $27. Pickup in 12 min? Reply YES to confirm.' },
        { from: 'caller', text: 'yes' },
        { from: 'bot', text: "Order #042 confirmed. Skip the line — show this text at the window." },
      ],
    },
    painPoints: [
      { title: 'Customers can\'t find you', body: "You move every day — customers call asking where you're parked. That's 20 calls a day you can't answer while cooking." },
      { title: 'The line kills repeat business', body: 'A 30-minute wait sends hungry customers to the taco truck two blocks over. Preorders beat the line.' },
      { title: 'No phone staff, period', body: "It's literally just you and a grill. There's no one to pick up the phone, ever." },
    ],
    benefits: [
      ...commonRestaurantBenefits().slice(0, 4),
      { icon: Clock, title: 'Auto-updates location', body: "The AI tells callers where you're parked today — set it once in the morning, forget it." },
      { icon: ShieldCheck, title: 'Skip-the-line tickets', body: 'Preorders get a skip-the-line number so customers walk up to the window instead of waiting.' },
    ],
    howItWorks: [
      { step: '01', title: 'Set today\'s location', body: 'Text your location to RingBackSMS in the morning. The AI tells every caller where to find you.' },
      { step: '02', title: 'Customers preorder by text', body: 'They call, can\'t reach you, get the menu + location by SMS, and preorder in 30 seconds.' },
      { step: '03', title: 'They skip the line', body: 'Order number appears on your prep screen. Customer walks up, shows the text, you hand over food.' },
    ],
    testimonials: [
      { quote: 'Preorders are now 40% of my daily sales. Before RingBackSMS they were zero because I couldn\'t answer the phone.', name: 'Priya S.', role: 'Owner, Masala on Wheels' },
      { quote: 'Customers used to drive to where we were yesterday. The AI tells them where we are today.', name: 'Danny T.', role: 'Owner, Taco Libre Truck' },
      { quote: 'Festivals used to break my phone with calls. Now they all text-order and I cook.', name: 'Maya L.', role: 'Owner, Sweet Rolls Truck' },
    ],
    faqs: [
      { q: 'How does it know where I\'m parked?', a: "You tell it — a 10-second text to the dashboard each morning sets your location for the day. Or connect your truck's GPS for automatic updates." },
      { q: 'Can it handle festival rush?', a: "Yes. Scale up your plan for festival days; the AI handles hundreds of preorders in parallel. Most owners switch to Scale on Fridays." },
      { q: 'What about cash customers?', a: 'Stripe link is optional. You can take preorders without payment and collect cash at pickup — most trucks start this way.' },
      { q: 'Can I pause it when I\'m closed?', a: 'Yes. Set your operating hours and the AI responds with "back tomorrow at 11 AM" after close.' },
      { q: 'Do I need a POS?', a: "No. Food trucks work fine without POS integration — just paste your menu into the dashboard. Connect Square later if you want register sync." },
    ],
  }),
  niche({
    parent: 'restaurants',
    slug: 'pizzerias',
    businessType: BusinessType.RESTAURANT,
    hubIcon: UtensilsCrossed,
    eyebrow: 'For pizzerias',
    title: 'SMS Ordering for Pizzerias | RingBackSMS',
    headline: "Take pizza orders by text — even when the phone's on fire",
    subheadline: 'Friday night your phone is ringing off the hook and your line cook is making a pie with their shoulder. RingBackSMS takes pizza orders by text, sends them to your POS, and quotes pickup times.',
    keywords: ['pizzeria missed call text back', 'pizza shop SMS ordering', 'pizzeria auto reply', 'pizza text order system', 'pizza shop POS SMS'],
    mockup: {
      businessName: "Tony's Pizza",
      messages: [
        { from: 'bot', text: "Hi! Tony's Pizza here. Want to order? Reply MENU or just tell me what you want." },
        { from: 'caller', text: '1 large pepperoni 1 large margherita 2 cokes' },
        { from: 'bot', text: "Got it — 1 LG Pepperoni ($18), 1 LG Margherita ($19), 2 Cokes ($6) = $43. Pickup in 25 min? Reply YES." },
        { from: 'caller', text: 'yes' },
        { from: 'bot', text: 'Order #312 in the oven. Pay at pickup or tap to pay: stripe.com/tonys/312' },
      ],
    },
    painPoints: [
      { title: 'Friday night nobody can pick up', body: 'Kitchen is slammed, line cooks are shoulder-dialing the phone. Every missed call is $25-40 walking out the door.' },
      { title: 'Voicemail is useless for pizza', body: 'Pizza is an impulse buy. If you call back in 20 minutes they already ordered from the chain down the street.' },
      { title: 'Order-taking pulls cooks off the line', body: "Every phone order your cook takes is 3 minutes they're not making pies. Throughput tanks during the rush." },
    ],
    benefits: commonRestaurantBenefits(),
    howItWorks: [
      { step: '01', title: 'Sync your menu from Square / Toast', body: 'One-click import, modifiers included. Takes 90 seconds.' },
      { step: '02', title: 'Caller orders by text', body: "They call, can't reach you, order by text in the same time it took to dial." },
      { step: '03', title: 'Ticket prints in the kitchen', body: 'Confirmed orders post to your POS and print like any other register ticket.' },
    ],
    testimonials: [
      { quote: 'Friday revenue is up 22% since we started. The AI handles 3x the calls we used to.', name: 'Tony D.', role: 'Owner, Tony\'s Pizza' },
      { quote: 'My kitchen staff stopped yelling at the phone. That alone is worth it.', name: 'Frank R.', role: 'Owner, Corner Slice' },
      { quote: 'We had customers who would just text-order. The AI handles them perfectly and they never call back live.', name: 'Sal B.', role: 'Owner, Sal\'s Pies' },
    ],
    faqs: [
      { q: 'Does it handle pizza modifiers?', a: 'Yes — half-and-half, toppings, crust, size, and special instructions all work natively. The AI clarifies ambiguity ("extra cheese on the whole pie or just half?") and confirms before sending to POS.' },
      { q: 'Can it read specials?', a: 'Yes. Update specials from your dashboard and the AI quotes them in every conversation until they expire.' },
      { q: 'What about delivery?', a: 'If you use Uber Eats / DoorDash, the AI routes delivery requests there. For in-house delivery we\'ll collect address and hand off to your dispatcher.' },
      { q: 'What if someone orders 30 pies for an event?', a: 'Large orders escalate to you via push so you can quote the right lead time.' },
      { q: 'Does it work with Toast?', a: 'Yes, along with Square, Clover, and Shopify. Toast orders appear as native kitchen tickets.' },
    ],
  }),
  niche({
    parent: 'restaurants',
    slug: 'cafes-bakeries',
    businessType: BusinessType.RESTAURANT,
    hubIcon: UtensilsCrossed,
    eyebrow: 'For cafés & bakeries',
    title: 'SMS Preorders for Cafés & Bakeries | RingBackSMS',
    headline: 'Turn morning-rush missed calls into preorders',
    subheadline: 'The 7-9 AM rush makes your phone useless. RingBackSMS takes coffee and pastry preorders overnight and during the rush so customers skip the line.',
    keywords: ['cafe SMS preorder', 'bakery missed call text back', 'coffee shop text ordering', 'cafe auto reply', 'bakery SMS'],
    mockup: {
      businessName: 'Morning Glory Café',
      messages: [
        { from: 'bot', text: 'Hi! Morning Glory here. Preorder your coffee and breakfast? Reply with your order.' },
        { from: 'caller', text: '1 oat latte, 1 almond croissant, ready at 8:15' },
        { from: 'bot', text: 'Got it — 1 Oat Latte ($5.50), 1 Almond Croissant ($4.25) = $9.75, ready 8:15. Reply YES to confirm.' },
        { from: 'caller', text: 'yes' },
        { from: 'bot', text: 'Ready 8:15 under your name. Skip the line — pickup counter on the right.' },
      ],
    },
    painPoints: [
      { title: 'The 8 AM line is out the door', body: 'Customers give up when they see the line. Preorders = served revenue.' },
      { title: 'Phone is impossible during the rush', body: 'Barista has 8 drinks on deck. Picking up the phone adds 2 minutes to every queue. Baseline: zero calls answered.' },
      { title: 'Night-before preorders lost', body: 'Regulars want to preorder tonight for tomorrow morning. Your voicemail doesn\'t cut it.' },
    ],
    benefits: commonRestaurantBenefits(),
    howItWorks: [
      { step: '01', title: 'Import your menu', body: '5-minute setup — paste in drinks and pastries with prices, or sync from Square.' },
      { step: '02', title: 'Customers preorder by text', body: 'Night before or during the rush — the AI takes the order and queues it.' },
      { step: '03', title: 'Order ready on time', body: 'Ticket hits the counter with pickup time. Customer walks in, grabs bag, leaves.' },
    ],
    testimonials: [
      { quote: 'Preorders are 30% of our 7-9 AM revenue now. The line is still long but it moves twice as fast.', name: 'Alice P.', role: 'Owner, Morning Glory' },
      { quote: 'My regulars text-order their usual before they even wake up. I make it when they walk in.', name: 'Sam K.', role: 'Barista, Third Wave Coffee' },
      { quote: 'Custom cake inquiries used to die in voicemail. Now every one gets a quote within minutes.', name: 'Nadia R.', role: 'Owner, Crumb & Kin Bakery' },
    ],
    faqs: [
      { q: 'Can it take custom cake orders?', a: 'Yes. The AI collects size, date, flavors, reference photos, and budget, then hands the thread to you for pricing. You see the full inquiry in one message.' },
      { q: 'What about allergy questions?', a: 'The AI answers ingredient and allergen questions from your menu data. For anything uncertain it defers to you.' },
      { q: 'Will it work for wholesale accounts?', a: 'Recurring wholesale orders escalate to you so you can handle them personally — the AI handles retail walk-in preorders.' },
      { q: 'Does it sync to Square for Retail?', a: 'Yes. Menu sync and order push work for Square for Restaurants and Square for Retail.' },
      { q: 'Can I set daily 86-list?', a: "Yes. Mark items sold-out from your phone in 2 taps — the AI stops offering them instantly." },
    ],
  }),
];

const SERVICE_NICHES: IndustryLandingContent[] = [
  niche({
    parent: 'service-businesses',
    slug: 'beauty-salons',
    businessType: BusinessType.SERVICE,
    hubIcon: Scissors,
    eyebrow: 'For beauty salons & barbershops',
    title: 'SMS Booking for Beauty Salons & Barbershops | RingBackSMS',
    headline: "Book blowouts while you're holding scissors",
    subheadline: "You can't answer mid-haircut. RingBackSMS books appointments, answers 'do you have an opening?', and rebooks regulars automatically so your stylists can focus on the chair.",
    keywords: ['salon missed call text back', 'hair salon booking SMS', 'barber shop SMS auto reply', 'salon appointment text', 'beauty salon scheduling SMS'],
    mockup: {
      businessName: 'Olive Branch Salon',
      messages: [
        { from: 'bot', text: "Hi! Olive Branch Salon here. What service are you looking for and when?" },
        { from: 'caller', text: 'balayage this saturday if possible' },
        { from: 'bot', text: "Balayage with Mia this Sat at 11 AM or 2 PM ($185, 2.5 hr). Which works?" },
        { from: 'caller', text: '2pm please, Kim' },
        { from: 'bot', text: "Booked! Sat 2 PM balayage with Mia. Reply CANCEL to cancel or we'll remind you 24 hr prior." },
      ],
    },
    painPoints: [
      { title: 'Hands are literally in someone\'s hair', body: "You can't answer between cuts. Every ring is a client booking with a competitor." },
      { title: 'Front desk is constantly re-answering the same 3 questions', body: '"Do you have an opening?" "How much is a balayage?" "Do you take walk-ins?" — 50 times a day.' },
      { title: 'Regulars forget to rebook', body: 'They walk out without scheduling the next appointment. By the time they remember, a new client has their slot.' },
    ],
    benefits: commonServiceBenefits('Booked', 'your service menu'),
    howItWorks: [
      { step: '01', title: 'Import your service menu', body: 'Type in services and prices, or sync from Square Appointments / Vagaro.' },
      { step: '02', title: 'Clients text during your cuts', body: 'The AI quotes the service, checks your stylists\' availability, and books on the spot.' },
      { step: '03', title: 'Walk into a packed book', body: 'Finish a cut, check your phone, find 4 new bookings. That\'s it.' },
    ],
    testimonials: [
      { quote: "We stopped losing bookings to voicemail. My stylists get 3-4 new appointments per shift without picking up the phone once.", name: 'Alicia T.', role: 'Owner, Olive Branch Salon' },
      { quote: "The re-book reminders alone paid for it. Regulars get a 'time for a trim?' text at week 5 and half of them rebook.", name: 'Chris V.', role: 'Owner, Crown & Blade Barber' },
      { quote: 'My front desk can actually check people out now instead of answering "do you have an opening?" all day.', name: 'Sara B.', role: 'GM, Atelier Hair' },
    ],
    faqs: [
      { q: 'Does it integrate with Square Appointments / Vagaro / Booker?', a: 'Square Appointments and Acuity are built-in. Vagaro and Booker work via webhook — we\'ll set it up for you during onboarding.' },
      { q: 'Can it handle stylist-specific bookings?', a: 'Yes. Clients can request a specific stylist and the AI checks their individual calendar. If they\'re unavailable it offers alternatives.' },
      { q: 'What about color corrections and long appointments?', a: 'Complex color services escalate to you for a consultation first — you review photos before the booking is confirmed.' },
      { q: 'Can it re-book regulars?', a: 'Yes. Set a rebook window per service (e.g. "balayage every 8 weeks") and the AI nudges regulars automatically.' },
      { q: 'Will it send reminders?', a: 'Yes — 24-hour and 2-hour SMS reminders with a one-tap "running late?" button cut no-shows dramatically.' },
    ],
  }),
  niche({
    parent: 'service-businesses',
    slug: 'cleaning-services',
    businessType: BusinessType.SERVICE,
    hubIcon: Sparkles,
    eyebrow: 'For residential & commercial cleaners',
    title: 'SMS for Cleaning Services | RingBackSMS',
    headline: 'Quote cleanings by text between jobs',
    subheadline: "You're driving between houses; the phone keeps ringing. RingBackSMS collects square footage, frequency, and date preferences so you walk into every break with booked jobs.",
    keywords: ['cleaning company missed call', 'house cleaner SMS booking', 'cleaning service auto reply', 'cleaning SMS quote', 'maid service text back'],
    mockup: {
      businessName: 'Spotless Home',
      messages: [
        { from: 'bot', text: 'Hi! Spotless Home here. Looking for a cleaning? Reply with square footage and frequency (weekly / biweekly / one-time).' },
        { from: 'caller', text: '2500 sqft biweekly' },
        { from: 'bot', text: "Biweekly 2500 sqft ≈ $140/visit. Want to book a first cleaning? Reply with a date + your ZIP." },
        { from: 'caller', text: 'next tuesday afternoon, 60123' },
        { from: 'bot', text: "We have Tue 1 PM or 3 PM open. Which works? Once you confirm, you'll get a full quote + contract to sign." },
      ],
    },
    painPoints: [
      { title: 'You\'re in someone\'s house all day', body: "Answering the phone while cleaning is rude to the current client and impossible with gloves on." },
      { title: 'Same 4 questions every time', body: '"How much?" "Do you bring supplies?" "What\'s your ZIP range?" — the AI answers them so you don\'t.' },
      { title: 'Quote requests die without follow-up', body: "Competing cleaners call back in 2 hours. Whoever responds first books the job." },
    ],
    benefits: commonServiceBenefits('Confirmed', 'your cleaning packages'),
    howItWorks: [
      { step: '01', title: 'Set your pricing tiers', body: 'Tell the AI your rate per sqft, frequency discounts, ZIP range.' },
      { step: '02', title: 'Caller texts during your shift', body: "The AI collects sqft, frequency, ZIP, and date preferences — everything you need to quote." },
      { step: '03', title: 'Walk into booked jobs', body: 'Finish today\'s house, check your phone, find 2-3 confirmed bookings for next week.' },
    ],
    testimonials: [
      { quote: "I book 30% more first-time clients now. Before, half of them went to whoever called back first — which wasn't me.", name: 'Rosa M.', role: 'Owner, Spotless Home' },
      { quote: "I hated doing quotes over the phone. The AI collects everything I need and I just review and approve.", name: 'Derek W.', role: 'Owner, Fresh Start Cleaning' },
      { quote: "My commercial clients all text now — they love that they don't have to play voicemail tag.", name: 'Angela P.', role: 'Owner, Pristine Office' },
    ],
    faqs: [
      { q: 'Can it give an exact price?', a: 'It gives a ballpark from sqft + frequency. For final pricing it collects the info and escalates to you for a one-tap approval.' },
      { q: 'What about commercial cleaning?', a: 'Commercial inquiries (offices, restaurants, Airbnb turnovers) escalate to you for a custom quote — the AI pre-collects scope and frequency so you have what you need.' },
      { q: 'Does it handle cancellations?', a: 'Yes. Clients can cancel or reschedule by text. Cancellations within your window trigger your cancellation policy automatically.' },
      { q: 'Will it handle my regular routes?', a: "Regulars are tagged — the AI greets them by name, asks if they want their usual service, and rebooks without re-collecting details." },
      { q: 'Can it collect a deposit?', a: 'Optional Stripe link for deposits on first-time bookings. Most cleaners skip it and collect on-site.' },
    ],
  }),
  niche({
    parent: 'service-businesses',
    slug: 'caregiving-home-health',
    businessType: BusinessType.SERVICE,
    hubIcon: ShieldCheck,
    eyebrow: 'For caregiving & home-health agencies',
    title: 'SMS for Caregiving & Home Health Agencies | RingBackSMS',
    headline: "Answer every family's call — even during a shift",
    subheadline: "Families panic when nobody picks up. RingBackSMS gives them an immediate warm reply, collects the care situation, and escalates urgent requests to your on-call coordinator.",
    keywords: ['home health missed call text back', 'caregiver agency SMS', 'home care SMS auto reply', 'senior care text back', 'in-home care SMS booking'],
    mockup: {
      businessName: 'Sunrise Home Care',
      messages: [
        { from: 'bot', text: "Hi, you've reached Sunrise Home Care. We're so sorry we missed your call. Can you tell us a little about the care you're looking for?" },
        { from: 'caller', text: 'my mom needs help 4 hrs a day after her hip surgery' },
        { from: 'bot', text: "Thank you for reaching out. Post-surgical support is something we do often. I'm flagging this to our care coordinator who will call you within the hour. Can I get your name and your mom's ZIP?" },
        { from: 'caller', text: 'Dana, 94080' },
        { from: 'bot', text: "Got it, Dana. Our coordinator Susan will call you shortly. You're in good hands." },
      ],
    },
    painPoints: [
      { title: 'Families call in crisis', body: 'A voicemail feels cold when a parent just fell. Every unanswered call is a family that goes to the next agency.' },
      { title: 'Coordinators can\'t man the phone 24/7', body: "Your office is small. Nights and weekends, calls go to voicemail — right when families need you most." },
      { title: 'Compliance-sensitive intake', body: "You can't just ask anything. The AI gathers basic info without crossing HIPAA lines." },
    ],
    benefits: [
      { icon: Bot, title: 'Warm, compassionate AI', body: "Tuned to caregiving tone — empathetic, unhurried, never transactional." },
      { icon: Zap, title: '<3 second reply', body: 'Families panic when the phone goes silent. The AI reassures them in seconds.' },
      { icon: ShieldCheck, title: 'HIPAA-aware intake', body: "Collects only non-PHI info up front — name, ZIP, general care need. The rest is handled by your human coordinator." },
      { icon: MessageCircle, title: 'Escalation within the hour', body: 'Every inquiry flags your on-call coordinator with full context so they can make a warm callback.' },
      { icon: Calendar, title: 'Consultation scheduling', body: 'Books in-home assessments with your nurse/coordinator calendar.' },
      { icon: TrendingUp, title: 'Full inquiry log', body: "Every conversation is logged for compliance and quality review." },
    ],
    howItWorks: [
      { step: '01', title: 'Set your tone & intake questions', body: "We tune the AI to your agency's voice and the basic questions you want collected." },
      { step: '02', title: 'Families call, AI responds warmly', body: 'Every missed call gets a compassionate, immediate text.' },
      { step: '03', title: 'Coordinator makes the warm callback', body: 'Human follow-up within the hour with full context. No cold-call tag.' },
    ],
    testimonials: [
      { quote: "Home health is relationship-driven. Families panic when nobody picks up. Now they get a warm response immediately and a real human within the hour.", name: 'Robert K.', role: 'Director, Sunrise Home Care' },
      { quote: "We stopped losing referrals to voicemail. The coordinator used to return 20 voicemails a day; now she gets pre-qualified threads.", name: 'Linda F.', role: 'Owner, Gentle Hands Home Care' },
      { quote: "Adult children call on lunch breaks. If we don't reply in 10 minutes, they move on. The AI keeps us in the game.", name: 'Marcus D.', role: 'Admin, Daybreak Senior Care' },
    ],
    faqs: [
      { q: 'Is this HIPAA-compliant?', a: "The inbound SMS intake collects only non-PHI basics (name, ZIP, general care need). Detailed health info is only collected via your human coordinator on the callback. We sign BAAs with agencies on request." },
      { q: 'Can it book in-home assessments?', a: 'Yes — it can hold a slot on your coordinator\'s calendar pending the callback, or book the assessment directly if you prefer.' },
      { q: 'What about after-hours emergencies?', a: "Urgent-keyword detection (fall, chest pain, ER, hospital) instantly pages your on-call coordinator instead of handling via text." },
      { q: 'Can the AI differentiate lead types?', a: 'Yes — private pay, long-term care insurance, Medicaid, and VA benefits are all tagged so your coordinator can prioritize accordingly.' },
      { q: 'Will it work for facility agencies too?', a: 'Yes, though it\'s optimized for in-home care. Facility placements usually require human-led intake from the start.' },
    ],
  }),
  niche({
    parent: 'service-businesses',
    slug: 'plumbing',
    businessType: BusinessType.SERVICE,
    hubIcon: Wrench,
    eyebrow: 'For plumbers',
    title: 'SMS for Plumbers | RingBackSMS',
    headline: 'Capture every leak before it calls the next plumber',
    subheadline: "You can't answer the phone with your hands in a drain. RingBackSMS quotes diagnostic visits, detects emergency keywords, and books jobs on your calendar — so you walk off every job to new bookings.",
    keywords: ['plumber missed call text back', 'plumbing SMS dispatch', 'plumber auto reply', 'plumbing service text booking', 'emergency plumber SMS'],
    mockup: {
      businessName: 'Hendricks Plumbing',
      messages: [
        { from: 'bot', text: "Hi! Hendricks Plumbing. What's going on? We'll text you a quote and book a visit." },
        { from: 'caller', text: 'kitchen sink is leaking under the cabinet pretty bad' },
        { from: 'bot', text: "Sounds urgent. We can come today 2-4 PM for an $89 diagnostic visit. Reply YES to book or call 555-2211 for immediate help." },
        { from: 'caller', text: 'yes please book it' },
        { from: 'bot', text: "You're on the calendar for today 2-4 PM. Mike will call 15 min before arrival. Put a bucket under the leak in the meantime." },
      ],
    },
    painPoints: [
      { title: 'Gloves on, phone unanswered', body: "You're elbow-deep in a toilet flange. You physically cannot pick up. 85% of missed callers don't call back." },
      { title: 'Emergency calls get lost', body: "Real emergencies — floods, burst pipes — go to voicemail and get called back an hour later. You lose the job and the customer gets water damage." },
      { title: 'Lead-response time = booked jobs', body: 'Whoever calls back first wins. If you\'re still under a sink, another plumber is quoting already.' },
    ],
    benefits: [
      ...commonServiceBenefits('Booked', 'diagnostic and service visits').slice(0, 4),
      { icon: ShieldCheck, title: 'Emergency keyword detection', body: '"Flood", "burst pipe", "no water" → instant push notification so you can call back immediately.' },
      { icon: DollarSign, title: 'Quote diagnostic fees upfront', body: 'Sets expectations before the visit so there are no "but I thought it was free" moments.' },
    ],
    howItWorks: [
      { step: '01', title: 'Set your service area & rates', body: 'ZIP ranges, diagnostic fee, standard job pricing. 10-minute setup.' },
      { step: '02', title: 'Caller describes the problem', body: 'The AI classifies urgency, quotes the diagnostic visit, and books on your calendar.' },
      { step: '03', title: 'You show up to a paying job', body: 'All the context, address, and emergency tags are on your phone before you arrive.' },
    ],
    testimonials: [
      { quote: 'I\'m a solo plumber. Before RingBackSMS I lost 4-5 leads a day to voicemail. Now every one gets a text back and I book about half.', name: 'Mike H.', role: 'Owner, Hendricks Plumbing' },
      { quote: 'Emergency flags saved me a customer last week. Call came in at 6 PM, AI flagged "burst pipe" and pinged me — I called back in 90 seconds.', name: 'Dave B.', role: 'Owner, B&B Plumbing' },
      { quote: 'My truck days got 20% longer because I stopped spending evenings returning voicemails.', name: 'Ryan T.', role: 'Owner, Tight Seal Plumbing' },
    ],
    faqs: [
      { q: 'Does it know what\'s an emergency?', a: 'Yes. You define urgency keywords (flood, burst, no water, sewage, gas smell) and those calls bypass the AI and page you directly.' },
      { q: 'Can it quote flat-rate jobs?', a: 'Yes. Enter your flat-rate price book and the AI quotes common jobs directly. Unknown jobs get the diagnostic fee quoted instead.' },
      { q: 'Does it dispatch to multiple trucks?', a: 'Yes. If you have a team, the AI routes by ZIP and availability and sends the job to the right truck.' },
      { q: 'Will it handle commercial calls?', a: 'Commercial property calls escalate to you directly for custom quoting — the AI handles residential day-to-day.' },
      { q: 'What if customer is already in a flood?', a: "The AI tells them to shut the main water valve, call 911 if electrical risk, and pages you for an emergency callback." },
    ],
  }),
  niche({
    parent: 'service-businesses',
    slug: 'electrical',
    businessType: BusinessType.SERVICE,
    hubIcon: Zap,
    eyebrow: 'For electricians',
    title: 'SMS for Electricians | RingBackSMS',
    headline: "Quote jobs by text while you're on a ladder",
    subheadline: 'You can\'t answer mid-install. RingBackSMS collects scope, urgency, and location, books the estimate visit, and escalates panel-fire emergencies to your phone immediately.',
    keywords: ['electrician missed call text back', 'electrical contractor SMS', 'electrician auto reply', 'electrical service text booking', 'emergency electrician SMS'],
    mockup: {
      businessName: 'Bright Spark Electric',
      messages: [
        { from: 'bot', text: "Hi! Bright Spark Electric. What's the electrical issue and your ZIP?" },
        { from: 'caller', text: 'half my kitchen outlets stopped working 94110' },
        { from: 'bot', text: "Sounds like a tripped breaker or GFCI. We can come out tomorrow 9-11 AM for an $95 diagnostic, or walk you through a GFCI reset right now. Which do you prefer?" },
        { from: 'caller', text: "try the reset first" },
        { from: 'bot', text: "Great — check GFCI outlets in your kitchen, bathrooms, and garage. Press RESET on each. Reply back if that fixes it or if you still need a visit." },
      ],
    },
    painPoints: [
      { title: 'Hands on live wires', body: "You literally cannot take the call. One missed ring = one lost customer." },
      { title: 'DIY questions eat your day', body: '"My breaker keeps tripping, is that bad?" The AI answers the easy stuff and books the real jobs.' },
      { title: 'Fire risks need immediate attention', body: 'Burning smells, smoke, sparking — these can\'t wait for a callback tomorrow.' },
    ],
    benefits: [
      ...commonServiceBenefits('Booked', 'estimate and service visits').slice(0, 4),
      { icon: ShieldCheck, title: 'Fire-risk escalation', body: 'Smoke, sparks, burning smells → immediate push notification. You call back in under 2 minutes.' },
      { icon: Bot, title: 'DIY triage built in', body: 'Simple tripped-breaker and GFCI issues get walked through — only real jobs become bookings.' },
    ],
    howItWorks: [
      { step: '01', title: 'Set your service area & rates', body: 'ZIPs, diagnostic fee, common job pricing. Done in 10 minutes.' },
      { step: '02', title: 'Caller describes the problem', body: "AI triages DIY vs real, quotes the visit, books the estimate." },
      { step: '03', title: 'You arrive to a qualified job', body: 'Scope, address, risk tags all in your phone before you park.' },
    ],
    testimonials: [
      { quote: "I stopped doing free phone diagnostics for strangers. The AI handles the 'is this normal?' calls so I only talk to paying customers.", name: 'Derek M.', role: 'Master Electrician, Bright Spark' },
      { quote: "Burning-smell call came in while I was on a ladder — AI flagged it, I got down, called back in 60 seconds. Saved the customer a fire.", name: 'Kevin L.', role: 'Owner, Volt Electric' },
      { quote: 'I book 3x more estimates. Same phone number, zero extra work.', name: 'Tom R.', role: 'Owner, Spark Pro Electric' },
    ],
    faqs: [
      { q: 'How does it know what\'s an emergency?', a: 'Keyword detection — burning smell, smoke, sparks, shock, power out to whole house. You can add custom triggers during setup.' },
      { q: 'Can it quote panel upgrades?', a: 'Panel upgrades and large jobs escalate to you for custom quoting — the AI pre-collects panel size, amp service, and age so you have what you need.' },
      { q: 'Does it handle permit-required work?', a: 'Yes — the AI asks basic scope questions and flags permit-required work. You handle permits on the callback.' },
      { q: 'Will it work for commercial?', a: 'Commercial calls route straight to you with the AI gathering scope and timeline context beforehand.' },
      { q: 'Can it quote flat-rate jobs?', a: 'Yes. Enter your flat-rate price book and common items (receptacle install, ceiling fan, etc.) get quoted instantly.' },
    ],
  }),
  niche({
    parent: 'service-businesses',
    slug: 'hvac',
    businessType: BusinessType.SERVICE,
    hubIcon: Wrench,
    eyebrow: 'For HVAC contractors',
    title: 'SMS for HVAC Contractors | RingBackSMS',
    headline: "Book service calls while you're on a rooftop",
    subheadline: 'Peak-season no-AC calls overwhelm your phone. RingBackSMS triages, quotes, and books service visits so you walk off every rooftop to a packed schedule.',
    keywords: ['HVAC missed call auto reply', 'HVAC SMS booking', 'HVAC contractor text back', 'heating and cooling SMS', 'AC repair text service'],
    mockup: {
      businessName: 'Cool Air HVAC',
      messages: [
        { from: 'bot', text: "Hi! Cool Air HVAC. What's the issue — heating, cooling, or maintenance?" },
        { from: 'caller', text: 'AC stopped working, 90 degrees in here' },
        { from: 'bot', text: "Ugh, sorry! We can come today 3-5 PM for a $95 diagnostic. Quick check — is your outdoor unit running? If not, check the breaker." },
        { from: 'caller', text: "breaker is fine, unit not running" },
        { from: 'bot', text: "Booked for today 3-5 PM, tech Carlos will text 20 min before arrival. In the meantime close blinds and run fans." },
      ],
    },
    painPoints: [
      { title: 'Heat wave = phone meltdown', body: 'On a 100° day you get 50 calls in an hour. One human can\'t answer that. Nine go to voicemail.' },
      { title: 'Rooftops are not phone-friendly', body: "You're 20 feet up with a recovery machine running. Every ring is a lost lead." },
      { title: 'Maintenance plans need constant follow-up', body: "Annual tune-up reminders fall through the cracks. Customers let their plans lapse and go to competitors." },
    ],
    benefits: [
      ...commonServiceBenefits('Booked', 'service and install visits').slice(0, 4),
      { icon: Clock, title: 'Maintenance reminders', body: "Auto-nudges customers at 6/12 months for tune-ups. Keeps your service plan revenue sticky." },
      { icon: ShieldCheck, title: 'Peak-season scale', body: 'Heat wave or cold snap? The AI handles 50 simultaneous threads without breaking a sweat.' },
    ],
    howItWorks: [
      { step: '01', title: 'Set zones, rates, and tech availability', body: 'ZIP ranges, diagnostic fees, truck count. 15-minute setup.' },
      { step: '02', title: 'Caller describes the issue', body: 'AI triages (no-cool, no-heat, maintenance, install), quotes the visit, and dispatches by availability.' },
      { step: '03', title: 'Your techs arrive to paid jobs', body: 'Dispatch notes, priority flags, and history all on their phones.' },
    ],
    testimonials: [
      { quote: "Last heat wave we booked 40 service calls in one day without my dispatcher lifting a finger. Before, we'd have burned out on the phone.", name: 'Tony F.', role: 'Owner, Cool Air HVAC' },
      { quote: "Maintenance plan renewals are up 35% since the AI started nudging customers at the 12-month mark.", name: 'Marcus B.', role: 'GM, All Seasons Heating' },
      { quote: "My techs can actually focus on the job because dispatch runs itself now.", name: 'Javier P.', role: 'Owner, Summit HVAC' },
    ],
    faqs: [
      { q: 'Can it handle no-cool emergencies in a heat wave?', a: 'Yes — "no AC", "no cool", "100 degrees" all trigger high-priority routing and same-day booking if you have availability.' },
      { q: 'Does it dispatch by tech / zone?', a: 'Yes. Set your techs\' service areas and availability, and the AI routes each booking to the right truck automatically.' },
      { q: 'Can it upsell maintenance plans?', a: 'Yes. After a diagnostic visit, the AI can offer your maintenance plan via SMS with one-tap signup.' },
      { q: 'What about install quotes?', a: 'New system install requires an in-home visit — the AI collects the basics (home size, existing system age, fuel type) and books the sales visit.' },
      { q: 'Does it work with dispatch software?', a: 'Integrates with ServiceTitan, Housecall Pro, and Jobber via webhook. Custom dispatch software works via API.' },
    ],
  }),
];

const RETAIL_NICHES: IndustryLandingContent[] = [
  niche({
    parent: 'retail',
    slug: 'florists',
    businessType: BusinessType.RETAIL,
    hubIcon: Sparkles,
    eyebrow: 'For florists',
    title: 'SMS for Florists | RingBackSMS',
    headline: 'Send last-minute bouquets without losing the call',
    subheadline: 'Funeral, birthday, anniversary — florist calls are urgent. RingBackSMS checks your arrangements, quotes delivery, and holds stems for pickup so you can keep arranging.',
    keywords: ['florist missed call text back', 'florist SMS order', 'flower shop auto reply', 'florist text back service', 'last minute flower SMS'],
    mockup: {
      businessName: 'Petal & Stem',
      messages: [
        { from: 'bot', text: 'Hi! Petal & Stem here. What are you looking for?' },
        { from: 'caller', text: 'need a sympathy arrangement delivered today if possible' },
        { from: 'bot', text: 'We have our "White Lily Sympathy" ($65) and "Peaceful Garden" ($95) ready for same-day delivery in 94110. Which one, and what\'s the delivery address?' },
        { from: 'caller', text: "peaceful garden, 123 Oak St 94110" },
        { from: 'bot', text: "Beautiful choice. $95 + $12 delivery = $107. Card message? We'll deliver this afternoon." },
      ],
    },
    painPoints: [
      { title: 'Funeral calls can\'t wait', body: 'Sympathy orders are emotional and urgent. A voicemail feels like a failure on your worst day.' },
      { title: 'Arranging doesn\'t pause', body: "You're mid-bouquet with wet stems. You can't wipe off and grab the phone." },
      { title: 'Same-day questions eat your day', body: '"Do you deliver to X?" "How much is sympathy?" "Open today?" — 20 calls, 20 interruptions.' },
    ],
    benefits: commonRetailBenefits(),
    howItWorks: [
      { step: '01', title: 'Add your signature arrangements', body: 'Name, price, occasion, and a photo URL. 20-minute setup.' },
      { step: '02', title: 'Caller texts an inquiry', body: 'The AI matches their need to your catalog, quotes delivery, takes the address.' },
      { step: '03', title: 'You arrange, not answer', body: 'Order lands in your inbox with all details. You focus on the flowers.' },
    ],
    testimonials: [
      { quote: "I run a 200-sq-ft flower shop solo. The phone used to be my biggest stressor. Now customers text me and I don't look at my phone until I'm done arranging.", name: 'Elena V.', role: 'Owner, Petal & Stem' },
      { quote: "Sympathy orders used to take 3-4 callbacks and I'd lose half of them. Now every one gets an immediate warm reply and I close most of them.", name: 'Grace R.', role: 'Owner, Whispering Petals' },
      { quote: "Last Valentine's Day the AI handled 60 orders in a day without me touching the phone once.", name: 'Priya K.', role: 'Owner, Rose & Bloom' },
    ],
    faqs: [
      { q: 'Can it handle same-day delivery?', a: 'Yes. Set your same-day cutoff time and delivery ZIPs — the AI quotes delivery fees and confirms cutoff windows automatically.' },
      { q: 'What about custom bouquets?', a: 'Custom orders (weddings, big events, specialty arrangements) escalate to you via push so you can quote personally. The AI pre-collects colors, flowers, occasion, and budget.' },
      { q: 'Does it handle card messages?', a: 'Yes — the AI asks for the card message and delivery instructions as part of the order flow.' },
      { q: 'Can it sell signature arrangements?', a: 'Yes. Mark your top 5-10 arrangements with photo URLs and the AI quotes them instantly. Walk-in customers can see them on your storefront, phone customers get them via text.' },
      { q: 'What about wire service (FTD / Teleflora) orders?', a: 'Wire orders still come through your wire service as usual. RingBackSMS handles direct phone inquiries — the majority of your local business.' },
    ],
  }),
  niche({
    parent: 'retail',
    slug: 'cake-shops',
    businessType: BusinessType.RETAIL,
    hubIcon: Sparkles,
    eyebrow: 'For cake shops & custom bakers',
    title: 'SMS for Cake Shops & Custom Bakers | RingBackSMS',
    headline: 'Take custom-cake inquiries by text 24/7',
    subheadline: 'Brides and parents plan at midnight. RingBackSMS collects size, date, flavors, and reference photos so every inquiry lands in your inbox ready to quote.',
    keywords: ['cake shop SMS order', 'custom cake inquiry text', 'bakery text back service', 'wedding cake SMS inquiry', 'custom bakery auto reply'],
    mockup: {
      businessName: 'Sugar & Spice',
      messages: [
        { from: 'bot', text: "Hi! Sugar & Spice here. Custom cake inquiry? I can collect the details and our baker will quote you." },
        { from: 'caller', text: 'wedding cake for aug 15, 100 guests, 3 tiers' },
        { from: 'bot', text: 'Congrats! For 100 guests, 3-tier works great. What flavors are you thinking? And do you have a style/photo reference?' },
        { from: 'caller', text: 'vanilla and raspberry, minimalist with fresh flowers' },
        { from: 'bot', text: "Beautiful combo. I'll send this over to our head baker for a quote — you'll hear from her within 24 hrs. Photo reference if you have one?" },
      ],
    },
    painPoints: [
      { title: 'Brides plan at midnight', body: "You're asleep; they're on Pinterest. By the time you return the voicemail, they've emailed 3 other bakers." },
      { title: 'Custom cake intake is tedious', body: "Size, date, flavors, dietary restrictions, photos — the back-and-forth takes 5 messages before you can even quote." },
      { title: 'Piping doesn\'t pause', body: "You can't stop mid-buttercream to pick up the phone. Every ring is a lost inquiry." },
    ],
    benefits: [
      { icon: Package, title: 'Catalog + custom', body: 'Signature cakes are quoted instantly. Custom orders trigger a structured intake that collects everything you need upfront.' },
      { icon: Sparkles, title: '24/7 custom intake', body: 'Midnight brides get a warm reply and finish the intake. You wake up to booked inquiries.' },
      { icon: Zap, title: '<3 second replies', body: 'Every inquiry gets an immediate response. No more "we heard back from another baker first."' },
      { icon: MessageCircle, title: 'Photo-ready handoff', body: 'AI collects reference photos and passes the thread to you with one tap to quote.' },
      { icon: Clock, title: 'After-hours = your edge', body: "Other bakers go home at 6 PM. Your AI is still booking inquiries until 1 AM." },
      { icon: ShieldCheck, title: 'Allergy flags', body: 'Gluten-free, dairy-free, nut-allergy requests tagged so you never miss a special request.' },
    ],
    howItWorks: [
      { step: '01', title: 'List your standard cakes + intake fields', body: 'Signature cakes with prices, custom intake template (size, date, flavors, allergies, reference photo).' },
      { step: '02', title: 'Inquiry comes in', body: 'AI quotes signature cakes instantly. Custom requests get a structured intake that collects everything you need.' },
      { step: '03', title: 'You quote with full context', body: 'Open your inbox, see a complete brief, send a quote in 2 minutes instead of 10.' },
    ],
    testimonials: [
      { quote: "Custom cake inquiries used to come in by phone and I'd miss half of them. Now every bride gets an immediate reply and I close them at about 3x the rate.", name: 'Danielle P.', role: 'Owner, Sugar & Spice' },
      { quote: "The intake template alone saved me hours a week. I used to go back and forth 5 times per inquiry; now I get everything upfront.", name: 'Mei L.', role: 'Owner, Sweet Lotus Cakery' },
      { quote: "I book 70% of weekend inquiries from the AI. Before, most of them went to voicemail and I never heard back.", name: 'Jamal B.', role: 'Owner, Crown Cakes' },
    ],
    faqs: [
      { q: 'Can it actually quote a wedding cake?', a: "It quotes your standard pricing per tier / serving. For custom designs, it collects all the details and hands the thread to you for a personal quote. Saves the back-and-forth, not the creative decision." },
      { q: 'What about dietary restrictions?', a: 'Allergy and dietary intake is built-in — gluten-free, dairy-free, nut-free, and vegan are all flagged in the thread.' },
      { q: 'Can customers send photos?', a: 'Yes. MMS support lets customers attach reference photos which land directly in the thread.' },
      { q: 'Can it take deposits?', a: 'Optional Stripe integration for non-refundable deposits. Most custom bakers take deposits only after quoting.' },
      { q: 'Does it work for walk-in cakes too?', a: 'Yes — case cakes and signature items are quoted instantly for phone customers who want to pre-order a pickup.' },
    ],
  }),
  niche({
    parent: 'retail',
    slug: 'wedding-photographers',
    businessType: BusinessType.RETAIL,
    hubIcon: Sparkles,
    eyebrow: 'For wedding photographers',
    title: 'SMS for Wedding Photographers | RingBackSMS',
    headline: 'Reply to every bride in under a minute',
    subheadline: 'Lead response time decides who gets booked. RingBackSMS replies instantly, collects date + venue + package interest, and hands hot leads to you with full context.',
    keywords: ['wedding photographer lead SMS', 'photographer missed call text back', 'wedding photography lead response', 'photographer auto reply', 'photography studio SMS'],
    mockup: {
      businessName: 'Lune Photography',
      messages: [
        { from: 'bot', text: "Hi! Lune Photography here — congrats on the engagement! When's your date and where?" },
        { from: 'caller', text: 'june 8 2026 at napa valley' },
        { from: 'bot', text: "Napa in June is stunning. We have 3 packages: Essential ($3,500), Classic ($5,500), Full Day ($8,500). Any favorite?" },
        { from: 'caller', text: 'full day, can we see recent work?' },
        { from: 'bot', text: "Here's our portfolio: lunephoto.com. Marcus will text you personally within the hour with availability for June 8." },
      ],
    },
    painPoints: [
      { title: 'Lead response time = booked weddings', body: "Studies show photographers who reply in under 5 minutes book 3x more. Most of us reply in 3+ hours." },
      { title: 'You\'re shooting when brides call', body: "Saturdays you're at a wedding. Every inquiry that rings during a shoot goes to voicemail — and another photographer." },
      { title: 'Back-and-forth kills momentum', body: '"When\'s your date? Venue? Budget?" takes 3 days and 10 emails. The AI collects it in one thread.' },
    ],
    benefits: [
      { icon: Zap, title: 'Under-1-minute reply', body: "Brides get a warm, personalized reply while you're mid-shoot. Lead-response time is your new weapon." },
      { icon: Sparkles, title: 'Package quoting', body: 'Your packages and starting prices are quoted instantly so brides know fit before the thread heats up.' },
      { icon: MessageCircle, title: 'Structured intake', body: 'Date, venue, guest count, package interest — all collected before you touch the thread.' },
      { icon: Clock, title: 'Weekend coverage', body: "You're at a wedding Saturday. The AI fields inquiries from the next month's brides while you shoot." },
      { icon: TrendingUp, title: 'Hot-lead flagging', body: "High-budget, prime-date inquiries get flagged in red so you know where to focus." },
      { icon: ShieldCheck, title: 'Your voice, not a robot', body: "Tuned to your brand tone — warm, creative, personal. Brides assume they're texting you." },
    ],
    howItWorks: [
      { step: '01', title: 'Tell the AI about your packages', body: 'Name, price, what\'s included. Link to your portfolio.' },
      { step: '02', title: 'Bride inquires by phone', body: "AI replies in under a minute, quotes starting prices, collects date and venue." },
      { step: '03', title: 'You close the deal personally', body: 'Thread lands in your inbox, ready for the human touch. You reply to a qualified lead.' },
    ],
    testimonials: [
      { quote: "Wedding photographers live and die by lead response time. I book about 70% of inquiries that hit within 5 minutes — RingBackSMS gets me there every time.", name: 'Marcus L.', role: 'Owner, Lune Photography' },
      { quote: "I shoot every Saturday. Before this I lost inquiries all weekend. Now I come home to 3-4 qualified leads with full context.", name: 'Olivia T.', role: 'Owner, Silver Arrow Studio' },
      { quote: "The AI matches my brand voice so well that brides don't realize it's automated until I tell them.", name: 'Jackson R.', role: 'Owner, Copper Lens Photo' },
    ],
    faqs: [
      { q: 'Will it sound generic?', a: "No — we tune the AI to your brand voice during setup. Most photographers say it sounds like their studio manager. Customers almost never realize it's an AI." },
      { q: 'Can it check my availability?', a: 'Yes — connect your booking calendar (Honeybook, Dubsado, Google Calendar) and the AI checks dates before quoting.' },
      { q: 'What about engagement sessions and elopements?', a: 'Any package you list can be quoted. The AI also handles follow-up products like albums and prints.' },
      { q: 'Does it work for videographers too?', a: 'Yes — same template, just swap "photo" for "video" in your package descriptions.' },
      { q: 'Can it take a retainer deposit?', a: 'Optional Stripe link for retainers. Most photographers collect deposits only after a signed contract.' },
    ],
  }),
  niche({
    parent: 'retail',
    slug: 'boutiques',
    businessType: BusinessType.RETAIL,
    hubIcon: Store,
    eyebrow: 'For boutiques',
    title: 'SMS for Boutiques | RingBackSMS',
    headline: "Answer 'do you have it in my size?' instantly",
    subheadline: "Your regulars text you from the parking lot. RingBackSMS checks your catalog, answers size and stock questions, and holds items for pickup so you can stay on the floor.",
    keywords: ['boutique SMS auto reply', 'boutique product availability text', 'boutique text back service', 'clothing store SMS', 'retail boutique missed call'],
    mockup: {
      businessName: 'Linen & Stone',
      messages: [
        { from: 'bot', text: 'Hi! Linen & Stone here. What are you looking for?' },
        { from: 'caller', text: 'do you have the olive linen dress in a medium' },
        { from: 'bot', text: "The Vera Olive Linen Dress in medium is $128 and in stock. Want us to hold one for you? Reply YES to reserve." },
        { from: 'caller', text: 'yes please' },
        { from: 'bot', text: "Held! We'll have it at the counter. Come by anytime today — we close at 7 PM." },
      ],
    },
    painPoints: [
      { title: 'Floor customers come first', body: "You can't leave a customer trying on 4 tops to go answer the phone." },
      { title: 'Same 3 questions all day', body: '"Do you have it?" "What size?" "Open today?" — each call is a 2-minute interruption.' },
      { title: 'Closed hours = lost sales', body: "Sunday evening browsers are your best leads. Your voicemail buries them." },
    ],
    benefits: commonRetailBenefits(),
    howItWorks: [
      { step: '01', title: 'Add your products', body: 'Paste in 50-300 items with prices, sizes, and photo URLs. The AI pulls the rest from descriptions.' },
      { step: '02', title: 'Customer texts "do you have…?"', body: 'AI matches the item, confirms size and stock, offers to hold it for pickup.' },
      { step: '03', title: 'They pick up; you never leave the floor', body: 'Reservation task in your inbox. They walk in, grab the item, pay.' },
    ],
    testimonials: [
      { quote: "Regulars used to call 10 times a day asking if I had stuff. Now they text and the AI answers instantly. My floor time went up by 2 hours a day.", name: 'Sophie K.', role: 'Owner, Linen & Stone' },
      { quote: "I got a reservation from a customer who texted us at 11 PM on Sunday. Never would have happened on voicemail.", name: 'Zoe R.', role: 'Owner, Wren & Willow' },
      { quote: "My regulars reserve items from the parking lot before they even walk in. It's like magic.", name: 'Chloe V.', role: 'Owner, Marigold Boutique' },
    ],
    faqs: [
      { q: 'How do I keep inventory accurate without a POS?', a: "Mark items 'in stock' / 'out of stock' with a toggle from your phone. For most small boutiques that's enough — you're not running Zara." },
      { q: 'Can it handle sizes and colors?', a: 'Yes — products can have size and color variants, and the AI checks specific variant availability.' },
      { q: 'What about new arrivals?', a: "Add new items from your phone in 30 seconds. The AI picks them up immediately for the next inquiry." },
      { q: 'Can customers reserve items?', a: "Yes. Single 'YES' reply reserves the item; you see a reservation task in your dashboard inbox. No payment required to reserve." },
      { q: 'Does it work with Shopify?', a: 'Shopify integration is on the roadmap. For now, small boutiques find the simple toggle faster than maintaining a full catalog.' },
    ],
  }),
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
