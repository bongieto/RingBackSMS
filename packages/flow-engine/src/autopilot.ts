import { FlowType } from '@ringback/shared-types';
import { getVerticalProfile, type VerticalKey } from './verticals';

export const AUTOPILOT_VERSION = 'service-agent-v2.1';

export interface AutopilotKnowledgeRequirement {
  key: string;
  category: string;
  question: string;
  aliases: string[];
  why: string;
}

export interface AutopilotPlanInput {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
  configuredFlowTypes?: Array<string | FlowType>;
  verifiedKnowledgeKeys?: string[];
  unverifiedKnowledgeKeys?: string[];
  catalogItemCount?: number;
  hasBusinessAddress?: boolean;
  hasWebsite?: boolean;
  hasBookingCalendar?: boolean;
  previousVersion?: string | null;
}

export interface AutopilotPlan {
  version: string;
  verticalKey: VerticalKey;
  verticalLabel: string;
  enabledFlows: FlowType[];
  flowsToEnable: FlowType[];
  automaticCapabilities: string[];
  ownerQuestions: AutopilotKnowledgeRequirement[];
  setupWarnings: string[];
  completionRate: number;
  needsApply: boolean;
}

const FACTS = {
  serviceArea: {
    key: 'policy.service_area',
    category: 'SERVICE_AREA',
    question: 'What cities, ZIP codes, or distance does your team serve?',
    aliases: ['service area', 'do you come to', 'travel area', 'coverage area'],
    why: 'Prevents the agent from promising service outside your coverage area.',
  },
  estimatePolicy: {
    key: 'policy.estimates',
    category: 'PRICING',
    question: 'Are estimates free, paid, or determined after an inspection?',
    aliases: ['estimate', 'quote', 'diagnostic fee', 'service call fee'],
    why: 'Lets the agent answer pricing questions without inventing a fee.',
  },
  urgentAvailability: {
    key: 'policy.urgent_availability',
    category: 'AVAILABILITY',
    question: 'Do you offer emergency, same-day, or after-hours service?',
    aliases: ['emergency service', 'same day', 'after hours', 'urgent service'],
    why: 'Keeps urgent requests accurate and routes true emergencies safely.',
  },
  cancellation: {
    key: 'policy.cancellation',
    category: 'POLICY',
    question: 'What is your cancellation, rescheduling, or no-show policy?',
    aliases: ['cancel', 'reschedule', 'no show', 'cancellation fee'],
    why: 'Prevents unsupported promises about fees or refunds.',
  },
  paymentInsurance: {
    key: 'policy.payment_insurance',
    category: 'PAYMENT',
    question: 'Which payment methods, insurance plans, or benefits do you accept?',
    aliases: ['insurance', 'medicare', 'medicaid', 'payment methods', 'financing'],
    why: 'Lets the agent answer eligibility and payment questions from an approved source.',
  },
  newClient: {
    key: 'policy.new_client',
    category: 'BOOKING',
    question: 'Are you accepting new clients or patients, and what should they prepare?',
    aliases: ['new patient', 'new client', 'first appointment', 'what to bring'],
    why: 'Qualifies new inquiries before staff follow-up.',
  },
  walkInsDeposits: {
    key: 'policy.walkins_deposits',
    category: 'BOOKING',
    question: 'Do you accept walk-ins or require appointment deposits?',
    aliases: ['walk in', 'deposit', 'appointment deposit', 'booking fee'],
    why: 'Keeps booking expectations and deposit language accurate.',
  },
  diagnostics: {
    key: 'policy.diagnostics',
    category: 'PRICING',
    question: 'How do diagnostic fees, inspections, and repair estimates work?',
    aliases: ['diagnostic', 'inspection', 'repair estimate', 'shop fee'],
    why: 'Prevents the agent from quoting an unsupported repair price.',
  },
  towingWarranty: {
    key: 'policy.towing_warranty',
    category: 'SERVICE',
    question: 'Do you arrange towing, and what repair warranty do you provide?',
    aliases: ['tow', 'towing', 'warranty', 'guarantee'],
    why: 'Answers two common auto-service questions without guessing.',
  },
  returnsHolds: {
    key: 'policy.returns_holds',
    category: 'POLICY',
    question: 'What are your return, exchange, and product-hold policies?',
    aliases: ['return', 'exchange', 'hold item', 'reservation expiration'],
    why: 'Keeps retail reservations and returns aligned with store policy.',
  },
  shipping: {
    key: 'policy.shipping',
    category: 'FULFILLMENT',
    question: 'Do you offer shipping, delivery, or pickup, and what areas or fees apply?',
    aliases: ['shipping', 'delivery', 'pickup', 'delivery fee'],
    why: 'Prevents unsupported fulfillment promises.',
  },
  consultation: {
    key: 'policy.consultation',
    category: 'PRICING',
    question: 'Is the initial consultation free or paid, and how long is it?',
    aliases: ['consultation fee', 'initial call', 'discovery call', 'consultation length'],
    why: 'Lets the agent qualify and schedule prospects accurately.',
  },
  largeOrders: {
    key: 'policy.large_orders',
    category: 'ORDERING',
    question: 'How much notice is required for catering, bulk, or large orders?',
    aliases: ['catering', 'large order', 'bulk order', 'advance notice'],
    why: 'Routes valuable large orders without inventing lead times.',
  },
} satisfies Record<string, AutopilotKnowledgeRequirement>;

const REQUIREMENTS: Record<VerticalKey, AutopilotKnowledgeRequirement[]> = {
  restaurant: [FACTS.largeOrders, FACTS.cancellation],
  food_truck: [FACTS.largeOrders, FACTS.cancellation],
  home_services: [FACTS.serviceArea, FACTS.estimatePolicy, FACTS.urgentAvailability],
  hvac: [FACTS.serviceArea, FACTS.estimatePolicy, FACTS.urgentAvailability],
  plumbing: [FACTS.serviceArea, FACTS.estimatePolicy, FACTS.urgentAvailability],
  electrical: [FACTS.serviceArea, FACTS.estimatePolicy, FACTS.urgentAvailability],
  medical: [FACTS.paymentInsurance, FACTS.newClient, FACTS.cancellation],
  home_care: [FACTS.serviceArea, FACTS.paymentInsurance, FACTS.newClient],
  hospice: [FACTS.serviceArea, FACTS.paymentInsurance, FACTS.newClient],
  salon: [FACTS.walkInsDeposits, FACTS.cancellation],
  auto_shop: [FACTS.diagnostics, FACTS.towingWarranty, FACTS.cancellation],
  retail: [FACTS.returnsHolds, FACTS.shipping],
  consultant: [FACTS.consultation, FACTS.cancellation],
  generic_service: [FACTS.serviceArea, FACTS.estimatePolicy, FACTS.cancellation],
  other: [FACTS.serviceArea, FACTS.estimatePolicy, FACTS.cancellation],
};

function uniqueFlows(flows: FlowType[]): FlowType[] {
  return [...new Set([...flows, FlowType.FALLBACK])];
}

export function getAutopilotKnowledgeRequirements(
  verticalKey: VerticalKey
): AutopilotKnowledgeRequirement[] {
  return REQUIREMENTS[verticalKey];
}

export function buildAutopilotPlan(input: AutopilotPlanInput): AutopilotPlan {
  const profile = getVerticalProfile({
    businessType: input.businessType,
    industryTemplateKey: input.industryTemplateKey,
    tenantName: input.tenantName,
    websiteContext: input.websiteContext,
  });
  const enabledFlows = uniqueFlows(profile.defaultFlows);
  const configured = new Set(input.configuredFlowTypes ?? []);
  const verifiedKeys = new Set(input.verifiedKnowledgeKeys ?? []);
  const unverifiedKeys = new Set(input.unverifiedKnowledgeKeys ?? []);
  const requirements = getAutopilotKnowledgeRequirements(profile.key);
  const ownerQuestions = requirements.filter((requirement) => !verifiedKeys.has(requirement.key));
  const setupWarnings: string[] = [];

  if (
    (profile.catalogNoun === 'menu' || profile.catalogNoun === 'products') &&
    (input.catalogItemCount ?? 0) === 0
  ) {
    setupWarnings.push(
      `Add at least one ${profile.catalogNoun === 'menu' ? 'menu item' : 'product'} so the agent can complete customer requests.`
    );
  }
  if (
    !input.hasBusinessAddress &&
    ['home_services', 'hvac', 'plumbing', 'electrical', 'auto_shop', 'retail'].includes(profile.key)
  ) {
    setupWarnings.push('Add the business address so location and directions answers are grounded.');
  }
  if (enabledFlows.includes(FlowType.MEETING) && !input.hasBookingCalendar) {
    setupWarnings.push(
      'Turn on the built-in calendar or connect Cal.com to confirm appointments automatically.'
    );
  }
  if (!input.hasWebsite) {
    setupWarnings.push(
      'Add a website when available so Autopilot can prepare owner-reviewable business facts.'
    );
  } else if (unverifiedKeys.has('website.summary')) {
    setupWarnings.push(
      'Review the imported website summary before the agent is allowed to quote it.'
    );
  }

  const automaticCapabilities = [
    'Business hours and contact details from saved settings',
    `${profile.label} intent routing and safety rules`,
    `${profile.intakeFields.length} industry-specific intake field${profile.intakeFields.length === 1 ? '' : 's'}`,
    `${profile.readinessScenarios.length} readiness scenarios`,
  ];
  if ((input.catalogItemCount ?? 0) > 0) {
    automaticCapabilities.push(`Live ${profile.catalogNoun} names, prices, and availability`);
  }
  if (input.hasBookingCalendar && enabledFlows.includes(FlowType.MEETING)) {
    automaticCapabilities.push('Appointment availability and booking');
  }

  const totalChecks = requirements.length + enabledFlows.length + 1;
  const completeChecks =
    requirements.length -
    ownerQuestions.length +
    enabledFlows.filter((flow) => configured.has(flow)).length +
    (input.previousVersion === AUTOPILOT_VERSION ? 1 : 0);

  return {
    version: AUTOPILOT_VERSION,
    verticalKey: profile.key,
    verticalLabel: profile.label,
    enabledFlows,
    flowsToEnable: enabledFlows.filter((flow) => !configured.has(flow)),
    automaticCapabilities,
    ownerQuestions,
    setupWarnings,
    completionRate: totalChecks === 0 ? 1 : completeChecks / totalChecks,
    needsApply:
      input.previousVersion !== AUTOPILOT_VERSION ||
      enabledFlows.some((flow) => !configured.has(flow)),
  };
}
