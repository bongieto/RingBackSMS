import { BusinessType, FlowType } from '@ringback/shared-types';

type BusinessTypeLike = BusinessType | `${BusinessType}` | string;

/**
 * Business-type profile — the single source of truth for how the product
 * adapts per vertical. Onboarding, sidebar, dashboard, AI prompts, tasks
 * digest all read from here. Add a new vertical = add one entry.
 *
 * Decision: CONSULTANT and MEDICAL share the SERVICE profile in v1.
 */

export type CatalogNoun = 'menu' | 'services' | 'products';

export type DashboardCardKey =
  | 'missedCalls'
  | 'conversations'
  | 'orders'
  | 'revenue'
  | 'meetings'
  | 'inquiries';

export interface BusinessTypeProfile {
  label: string;
  emoji: string;
  catalogNoun: CatalogNoun;
  /** Flows enabled by default at tenant creation (FALLBACK always on). */
  enabledFlows: FlowType[];
  defaultGreeting: (businessName: string) => string;
  defaultHours: { start: string; end: string; days: number[] };
  nav: {
    showMenu: boolean;
    showServices: boolean;
    showOrders: boolean;
    showMeetings: boolean;
    showLocation?: boolean;
    showPrepTime?: boolean;
    menuLabel?: string;
  };
  dashboardCards: DashboardCardKey[];
  aiPersonalityHint: string;
  taskCopy: {
    orderConfirm: string;
    meetingConfirm: string;
    inquiryReply?: string;
  };
  onboardingNextSteps: Array<{ title: string; description: string; href: string; emoji: string }>;
}

const RESTAURANT: BusinessTypeProfile = {
  label: 'Restaurant',
  emoji: '🍽️',
  catalogNoun: 'menu',
  enabledFlows: [FlowType.ORDER, FlowType.FALLBACK],
  defaultGreeting: (name) =>
    `Hi! Sorry we missed your call at ${name}. Reply ORDER to place a pickup order or just tell us what you need — we'll get right back to you!`,
  defaultHours: { start: '11:00', end: '21:00', days: [1, 2, 3, 4, 5, 6] },
  nav: { showMenu: true, showServices: false, showOrders: true, showMeetings: false, showPrepTime: true },
  dashboardCards: ['missedCalls', 'conversations', 'orders', 'revenue'],
  aiPersonalityHint:
    "You're the friendly host of a casual restaurant. Help customers place pickup/delivery orders, answer menu questions, and keep replies warm and quick.",
  taskCopy: {
    orderConfirm: 'Confirm pickup order',
    meetingConfirm: 'Confirm reservation',
  },
  onboardingNextSteps: [
    { emoji: '📱', title: 'Provision your number', description: 'Settings → Phone', href: '/dashboard/settings/phone' },
    { emoji: '📞', title: 'Forward unanswered calls', description: 'So missed calls reach RingbackSMS', href: '/help' },
    { emoji: '🍜', title: 'Add menu items', description: 'So customers can order via SMS', href: '/dashboard/menu' },
    { emoji: '🟦', title: 'Connect Square', description: 'Sync your POS catalog', href: '/dashboard/integrations' },
  ],
};

const FOOD_TRUCK: BusinessTypeProfile = {
  label: 'Food Truck',
  emoji: '🚚',
  catalogNoun: 'menu',
  enabledFlows: [FlowType.ORDER, FlowType.FALLBACK],
  defaultGreeting: (name) =>
    `Hi! Sorry we missed your call at ${name}. Text WHERE to see today's location, or ORDER to start a pickup order.`,
  defaultHours: { start: '11:00', end: '20:00', days: [1, 2, 3, 4, 5, 6] },
  nav: { showMenu: true, showServices: false, showOrders: true, showMeetings: false, showLocation: true, showPrepTime: true },
  dashboardCards: ['missedCalls', 'conversations', 'orders', 'revenue'],
  aiPersonalityHint:
    "You're the friendly voice of a mobile food truck. Help customers find today's spot, place pickup orders, and answer menu questions. Keep replies warm, quick, and casual.",
  taskCopy: {
    orderConfirm: 'Confirm pickup order',
    meetingConfirm: 'Confirm reservation',
  },
  onboardingNextSteps: [
    { emoji: '📱', title: 'Provision your number', description: 'Settings → Phone', href: '/dashboard/settings/phone' },
    { emoji: '📍', title: 'Set weekly schedule', description: "So customers can text 'where' to find you", href: '/dashboard/location' },
    { emoji: '🍜', title: 'Add menu items', description: 'So customers can order via SMS', href: '/dashboard/menu' },
    { emoji: '🟦', title: 'Connect Square', description: 'Sync your POS catalog', href: '/dashboard/integrations' },
  ],
};

const SERVICE: BusinessTypeProfile = {
  label: 'Service business',
  emoji: '🔧',
  catalogNoun: 'services',
  enabledFlows: [FlowType.MEETING, FlowType.FALLBACK],
  defaultGreeting: (name) =>
    `Hi! Sorry we missed your call at ${name}. Reply with what you need and we'll get back to you — or say BOOK to schedule an appointment.`,
  defaultHours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  nav: { showMenu: false, showServices: true, showOrders: false, showMeetings: true },
  dashboardCards: ['missedCalls', 'conversations', 'meetings'],
  aiPersonalityHint:
    "You're a professional receptionist for a service business. Help callers describe their need, book appointments, and triage urgency. Keep replies polished and concise.",
  taskCopy: {
    orderConfirm: 'Confirm service request',
    meetingConfirm: 'Confirm appointment',
  },
  onboardingNextSteps: [
    { emoji: '📱', title: 'Provision your number', description: 'Settings → Phone', href: '/dashboard/settings/phone' },
    { emoji: '📞', title: 'Forward unanswered calls', description: 'So missed calls reach RingbackSMS', href: '/help' },
    { emoji: '📅', title: 'List your services', description: 'So customers know what you offer', href: '/dashboard/services' },
    { emoji: '🗓️', title: 'Connect your calendar', description: 'Automate booking confirmations', href: '/dashboard/integrations' },
  ],
};

const RETAIL: BusinessTypeProfile = {
  label: 'Retail shop',
  emoji: '🛍️',
  catalogNoun: 'products',
  enabledFlows: [FlowType.INQUIRY, FlowType.ORDER, FlowType.FALLBACK],
  defaultGreeting: (name) =>
    `Hi! Sorry we missed your call at ${name}. Ask us about any product — we'll check availability and can hold one for you.`,
  defaultHours: { start: '10:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] },
  nav: { showMenu: true, showServices: false, showOrders: true, showMeetings: false, menuLabel: 'Products' },
  dashboardCards: ['missedCalls', 'conversations', 'orders', 'revenue'],
  aiPersonalityHint:
    "You're a friendly boutique shop clerk. When customers ask about a product, check the catalog, share price + availability, and offer to hold one. Keep replies warm and personal.",
  taskCopy: {
    orderConfirm: 'Confirm reservation',
    meetingConfirm: 'Confirm appointment',
    inquiryReply: 'Reply to product inquiry',
  },
  onboardingNextSteps: [
    { emoji: '📱', title: 'Provision your number', description: 'Settings → Phone', href: '/dashboard/settings/phone' },
    { emoji: '📞', title: 'Forward unanswered calls', description: 'So missed calls reach RingbackSMS', href: '/help' },
    { emoji: '🛍️', title: 'Add your products', description: 'With photos and prices', href: '/dashboard/menu' },
    { emoji: '🟦', title: 'Connect Square', description: 'Sync your POS catalog', href: '/dashboard/integrations' },
  ],
};

const OTHER: BusinessTypeProfile = {
  label: 'Other',
  emoji: '✨',
  catalogNoun: 'services',
  enabledFlows: [FlowType.FALLBACK],
  defaultGreeting: (name) =>
    `Hi! Sorry we missed your call from ${name}. How can we help you today?`,
  defaultHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
  nav: { showMenu: true, showServices: true, showOrders: true, showMeetings: true },
  dashboardCards: ['missedCalls', 'conversations', 'orders', 'revenue', 'meetings'],
  aiPersonalityHint:
    "You're a helpful, friendly, and professional assistant representing the business.",
  taskCopy: {
    orderConfirm: 'Confirm order',
    meetingConfirm: 'Confirm meeting',
  },
  onboardingNextSteps: [
    { emoji: '📱', title: 'Provision your number', description: 'Settings → Phone', href: '/dashboard/settings/phone' },
    { emoji: '📞', title: 'Forward unanswered calls', description: 'So missed calls reach RingbackSMS', href: '/help' },
    { emoji: '⚡', title: 'Configure flows', description: 'Enable the automations you need', href: '/dashboard/flows' },
  ],
};

export const PROFILES: Record<BusinessType, BusinessTypeProfile> = {
  [BusinessType.RESTAURANT]: RESTAURANT,
  [BusinessType.FOOD_TRUCK]: FOOD_TRUCK,
  [BusinessType.SERVICE]: SERVICE,
  [BusinessType.CONSULTANT]: SERVICE,
  [BusinessType.MEDICAL]: SERVICE,
  [BusinessType.RETAIL]: RETAIL,
  [BusinessType.OTHER]: OTHER,
};

export function getProfile(type: BusinessTypeLike | null | undefined): BusinessTypeProfile {
  if (!type) return OTHER;
  return (PROFILES as Record<string, BusinessTypeProfile>)[type] ?? OTHER;
}
