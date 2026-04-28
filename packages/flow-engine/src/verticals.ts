import { BusinessType, FlowType } from '@ringback/shared-types';

export type VerticalKey =
  | 'restaurant'
  | 'food_truck'
  | 'home_services'
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'medical'
  | 'home_care'
  | 'hospice'
  | 'salon'
  | 'auto_shop'
  | 'retail'
  | 'consultant'
  | 'generic_service'
  | 'other';

export type PolicySeverity = 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';

export interface SafetyPolicy {
  id: string;
  label: string;
  severity: PolicySeverity;
  pattern: RegExp;
  customerReply: string;
  ownerSubject: string;
  taskTitle: (callerPhone: string) => string;
  stopAutomation: boolean;
}

export interface EscalationPolicy {
  id: string;
  label: string;
  severity: PolicySeverity;
  keywords: string[];
  customerReply: string;
  ownerSubject: string;
  stopAutomation: boolean;
}

export interface IntakeField {
  key: string;
  label: string;
  examples: string[];
  requiredFor: Array<'booking' | 'quote' | 'handoff'>;
}

export interface ReadinessScenarioSeed {
  id: string;
  label: string;
  message: string;
  expect: {
    flowType?: FlowType;
    flowStep?: string;
    replyIncludes?: string[];
    replyExcludes?: string[];
  };
}

export interface VerticalProfile {
  key: VerticalKey;
  label: string;
  businessType: BusinessType;
  catalogNoun: 'menu' | 'services' | 'products';
  defaultFlows: FlowType[];
  safetyPolicies: SafetyPolicy[];
  escalationPolicies: EscalationPolicy[];
  intakeFields: IntakeField[];
  recommendedIntegrations: string[];
  valueMetrics: string[];
  readinessScenarios: ReadinessScenarioSeed[];
  promptGuidance: string[];
}

export interface SafetyPolicyMatch {
  profile: VerticalProfile;
  policy: SafetyPolicy;
  severity: PolicySeverity;
  customerReply: string;
  ownerSubject: string;
  ownerMessage: string;
  taskTitle: string;
  taskPriority: 'URGENT' | 'HIGH' | 'NORMAL';
  stopAutomation: boolean;
}

const NOT_EMERGENCY_SERVICE =
  "We're not an emergency service.";

const HOME_SERVICE_SAFETY_REPLY =
  `If there is immediate danger, a gas smell or leak, carbon monoxide alarm, fire, smoke, flooding, sewage backup, or an electrical hazard, please call 911 or your utility emergency line now. ${NOT_EMERGENCY_SERVICE} I'm also connecting you with a team member who can help, and someone will follow up with you shortly.`;

const MEDICAL_SAFETY_REPLY =
  `If this is a medical emergency, someone is in immediate danger, or symptoms may be life-threatening, please call 911 now. ${NOT_EMERGENCY_SERVICE} I'm also connecting you with a team member who can help, and someone will follow up with you shortly.`;

const FOOD_ALLERGY_REPLY =
  `For allergy or severe reaction concerns, please call 911 if anyone is having trouble breathing or needs urgent help. ${NOT_EMERGENCY_SERVICE} I'll connect you with a team member so they can follow up directly.`;

const AUTO_SAFETY_REPLY =
  `If there is immediate danger, an accident injury, fire, smoke, fuel leak, or you are stranded in an unsafe location, please call 911 or roadside assistance now. ${NOT_EMERGENCY_SERVICE} I'm also connecting you with a team member who can help.`;

const HOME_SERVICE_HAZARD_RE =
  /\b(?:gas\s+(?:smell|odor|leak)|smell(?:s|ing)?\s+(?:gas|natural\s+gas)|natural\s+gas|carbon\s+monoxide|\bco\s+(?:alarm|detector)\b|on\s+fire|fire\s+(?:in|from|near)|there(?:'s| is)\s+(?:a\s+)?fire|smoke|sparks?|electrical\s+(?:hazard|fire|shock)|burning\s+smell|furnace\s+(?:leak|leaking)|flood(?:ed|ing)?|burst\s+pipe|sewage|sewer\s+backup|standing\s+water\s+near\s+(?:outlet|panel|breaker))\b/i;

const MEDICAL_EMERGENCY_RE =
  /\b(?:medical\s+emergency|call\s+911|911|urgent|right\s+now|immediately|asap|fell|fallen|fall|hurt|injured|injury|severe\s+pain|chest\s+pain|can't\s+(?:get\s+)?up|cannot\s+(?:get\s+)?up|trouble\s+breathing|shortness\s+of\s+breath|stroke|unconscious|bleeding|suicidal|self[-\s]?harm|need\s+help\s+now)\b/i;

const FOOD_ALLERGY_RE =
  /\b(?:allerg(?:y|ic|ies)|anaphylaxis|epi\s*pen|trouble\s+breathing|throat\s+(?:closing|swelling)|severe\s+reaction)\b/i;

const AUTO_SAFETY_RE =
  /\b(?:accident|crash|stranded|tow|towing|on\s+the\s+highway|fuel\s+leak|gasoline\s+leak|car\s+fire|smoke\s+from\s+(?:car|engine)|brakes?\s+(?:failed|not\s+working)|unsafe\s+location)\b/i;

function safetyPolicy(
  id: string,
  label: string,
  severity: PolicySeverity,
  pattern: RegExp,
  customerReply: string,
  ownerSubject: string,
): SafetyPolicy {
  return {
    id,
    label,
    severity,
    pattern,
    customerReply,
    ownerSubject,
    taskTitle: (callerPhone) =>
      severity === 'EMERGENCY'
        ? `Emergency follow-up needed: ${callerPhone}`
        : `Urgent follow-up needed: ${callerPhone}`,
    stopAutomation: true,
  };
}

const homeServiceSafety = safetyPolicy(
  'home_service_emergency',
  'Home-service safety hazard',
  'EMERGENCY',
  HOME_SERVICE_HAZARD_RE,
  HOME_SERVICE_SAFETY_REPLY,
  'Customer reported a possible safety hazard',
);

const medicalSafety = safetyPolicy(
  'medical_emergency',
  'Medical emergency boundary',
  'EMERGENCY',
  MEDICAL_EMERGENCY_RE,
  MEDICAL_SAFETY_REPLY,
  'Customer reported an urgent medical situation',
);

const foodSafety = safetyPolicy(
  'food_allergy',
  'Food allergy or reaction',
  'EMERGENCY',
  FOOD_ALLERGY_RE,
  FOOD_ALLERGY_REPLY,
  'Customer reported an allergy or reaction concern',
);

const autoSafety = safetyPolicy(
  'auto_safety',
  'Auto safety or roadside hazard',
  'HIGH',
  AUTO_SAFETY_RE,
  AUTO_SAFETY_REPLY,
  'Customer reported an auto safety issue',
);

function scenario(
  id: string,
  label: string,
  message: string,
  expect: ReadinessScenarioSeed['expect'],
): ReadinessScenarioSeed {
  return { id, label, message, expect };
}

const serviceIntake: IntakeField[] = [
  { key: 'issue', label: 'Issue or service needed', examples: ['AC not cooling', 'leaking pipe'], requiredFor: ['booking', 'quote'] },
  { key: 'urgency', label: 'Urgency', examples: ['today', 'this week', 'emergency'], requiredFor: ['booking', 'handoff'] },
  { key: 'address', label: 'Service address', examples: ['123 Main St'], requiredFor: ['booking', 'quote'] },
  { key: 'preferred_time', label: 'Preferred time', examples: ['tomorrow morning'], requiredFor: ['booking'] },
];

const appointmentIntake: IntakeField[] = [
  { key: 'service', label: 'Requested service', examples: ['consultation', 'haircut', 'estimate'], requiredFor: ['booking'] },
  { key: 'preferred_time', label: 'Preferred date/time', examples: ['Friday afternoon'], requiredFor: ['booking'] },
  { key: 'name', label: 'Customer name', examples: ['Jordan'], requiredFor: ['booking'] },
];

export const VERTICAL_PROFILES: Record<VerticalKey, VerticalProfile> = {
  restaurant: {
    key: 'restaurant',
    label: 'Restaurant',
    businessType: BusinessType.RESTAURANT,
    catalogNoun: 'menu',
    defaultFlows: [FlowType.ORDER, FlowType.FALLBACK],
    safetyPolicies: [foodSafety],
    escalationPolicies: [
      { id: 'refund', label: 'Refund request', severity: 'HIGH', keywords: ['refund', 'wrong order', 'complaint'], customerReply: "I'll connect you with a team member who can help with that.", ownerSubject: 'Customer needs order help', stopAutomation: true },
    ],
    intakeFields: [],
    recommendedIntegrations: ['Square', 'Toast', 'Clover', 'Stripe', 'Star CloudPRNT'],
    valueMetrics: ['orders recovered', 'revenue captured', 'average prep ETA', 'refund escalations'],
    readinessScenarios: [
      scenario('restaurant-order', 'Order intent routes to ordering', 'I want to order dinner', { flowType: FlowType.ORDER }),
      scenario('restaurant-allergy', 'Allergy concern escalates safely', 'I think I am having an allergic reaction', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
    ],
    promptGuidance: ['Never invent menu items, prices, availability, or refund outcomes.', 'Allergy and severe reaction messages must escalate to a human and mention 911.'],
  },
  food_truck: {
    key: 'food_truck',
    label: 'Food truck',
    businessType: BusinessType.FOOD_TRUCK,
    catalogNoun: 'menu',
    defaultFlows: [FlowType.ORDER, FlowType.FALLBACK],
    safetyPolicies: [foodSafety],
    escalationPolicies: [],
    intakeFields: [],
    recommendedIntegrations: ['Square', 'location schedule', 'Stripe', 'Star CloudPRNT'],
    valueMetrics: ['where-are-you answers', 'orders recovered', 'sold-out deflections'],
    readinessScenarios: [
      scenario('truck-location', 'Location questions stay answerable', 'Where are you today?', { flowType: FlowType.FALLBACK }),
      scenario('truck-order', 'Order intent routes to ordering', 'Can I order two tacos?', { flowType: FlowType.ORDER }),
    ],
    promptGuidance: ['Location questions are high value; answer from the configured schedule when available.'],
  },
  home_services: {
    key: 'home_services',
    label: 'Home services',
    businessType: BusinessType.SERVICE,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [homeServiceSafety],
    escalationPolicies: [
      { id: 'urgent_service', label: 'Urgent service request', severity: 'HIGH', keywords: ['urgent', 'emergency', 'asap', 'right now'], customerReply: "I'm connecting you with a team member who can help. Someone will follow up shortly.", ownerSubject: 'Urgent service request', stopAutomation: true },
    ],
    intakeFields: serviceIntake,
    recommendedIntegrations: ['Google Calendar', 'Jobber', 'Housecall Pro', 'ServiceTitan', 'Stripe'],
    valueMetrics: ['appointments booked', 'quote requests captured', 'urgent hazards escalated', 'unanswered leads recovered'],
    readinessScenarios: [
      scenario('service-booking', 'Service request enters scheduler', 'My AC stopped cooling and I need someone to come out.', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
      scenario('service-hazard', 'Hazard gets emergency disclaimer', 'I smell gas from my furnace and there may be carbon monoxide.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'], replyExcludes: ['open slots'] }),
      scenario('service-price', 'Pricing question does not force booking', 'How much for an AC tune-up?', { flowType: FlowType.FALLBACK }),
    ],
    promptGuidance: ['Collect issue, urgency, address, and preferred time for service requests.', 'Safety hazards must not be booked before emergency guidance is given.'],
  },
  hvac: {
    key: 'hvac',
    label: 'HVAC',
    businessType: BusinessType.SERVICE,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [homeServiceSafety],
    escalationPolicies: [],
    intakeFields: [
      ...serviceIntake,
      { key: 'system_type', label: 'System type', examples: ['central AC', 'furnace', 'heat pump'], requiredFor: ['quote', 'booking'] },
    ],
    recommendedIntegrations: ['Google Calendar', 'Jobber', 'Housecall Pro', 'ServiceTitan'],
    valueMetrics: ['service calls booked', 'estimate requests', 'emergency hazards escalated'],
    readinessScenarios: [
      scenario('hvac-no-cooling', 'No cooling routes to booking', 'My AC stopped cooling and I need someone to come out.', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
      scenario('hvac-gas', 'Gas/carbon monoxide gets emergency disclaimer', 'I smell gas from my furnace and I think there may be carbon monoxide.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'utility emergency line', 'not an emergency service'] }),
      scenario('hvac-quote', 'Quote question stays informational', 'Do you offer free estimates for a new system?', { flowType: FlowType.FALLBACK }),
    ],
    promptGuidance: ['Treat no heat/no cooling as service-booking intent unless safety hazards are mentioned.', 'Ask for system type when useful, but keep SMS concise.'],
  },
  plumbing: {
    key: 'plumbing',
    label: 'Plumbing',
    businessType: BusinessType.SERVICE,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [homeServiceSafety],
    escalationPolicies: [],
    intakeFields: serviceIntake,
    recommendedIntegrations: ['Google Calendar', 'Jobber', 'Housecall Pro'],
    valueMetrics: ['service calls booked', 'urgent leaks escalated', 'quote requests'],
    readinessScenarios: [
      scenario('plumbing-leak', 'Leak routes to booking', 'My sink is leaking and I need a plumber.', { flowType: FlowType.MEETING }),
      scenario('plumbing-flood', 'Flooding gets emergency disclaimer', 'My basement is flooding and there is standing water near the breaker.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
    ],
    promptGuidance: ['For active flooding, give emergency guidance and hand off.'],
  },
  electrical: {
    key: 'electrical',
    label: 'Electrical',
    businessType: BusinessType.SERVICE,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [homeServiceSafety],
    escalationPolicies: [],
    intakeFields: serviceIntake,
    recommendedIntegrations: ['Google Calendar', 'Jobber', 'Housecall Pro'],
    valueMetrics: ['service calls booked', 'electrical hazards escalated', 'quote requests'],
    readinessScenarios: [
      scenario('electrical-sparks', 'Sparks get emergency disclaimer', 'There are sparks coming from my breaker panel.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
    ],
    promptGuidance: ['Electrical hazards must escalate before scheduling.'],
  },
  medical: {
    key: 'medical',
    label: 'Medical / health',
    businessType: BusinessType.MEDICAL,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [medicalSafety],
    escalationPolicies: [],
    intakeFields: appointmentIntake,
    recommendedIntegrations: ['Google Calendar', 'EHR scheduling', 'secure intake forms'],
    valueMetrics: ['appointments requested', 'urgent handoffs', 'unresolved patient requests'],
    readinessScenarios: [
      scenario('medical-booking', 'Appointment request enters scheduler', 'I need to book an appointment.', { flowType: FlowType.MEETING }),
      scenario('medical-fall', 'Fall/injury gets emergency disclaimer', 'Urgent, my father fell and needs help right now.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
    ],
    promptGuidance: ['Never provide medical advice. Direct emergencies to 911 and hand off.'],
  },
  home_care: {
    key: 'home_care',
    label: 'Home care',
    businessType: BusinessType.MEDICAL,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [medicalSafety],
    escalationPolicies: [],
    intakeFields: [
      { key: 'relationship', label: 'Relationship to patient/client', examples: ['my mom', 'my father'], requiredFor: ['booking', 'handoff'] },
      { key: 'care_need', label: 'Care need', examples: ['caregiver', 'companionship', 'bathing help'], requiredFor: ['booking', 'quote'] },
      { key: 'start_date', label: 'Desired start date', examples: ['this week'], requiredFor: ['quote'] },
      { key: 'location', label: 'Service location', examples: ['Springfield'], requiredFor: ['quote'] },
    ],
    recommendedIntegrations: ['Google Calendar', 'care intake forms', 'CRM'],
    valueMetrics: ['consultations booked', 'care leads captured', 'urgent care handoffs'],
    readinessScenarios: [
      scenario('care-info', 'Care info stays informational', 'What services do you provide for seniors?', { flowType: FlowType.FALLBACK }),
      scenario('care-consult', 'Care need routes to booking', 'I need to schedule a consultation for my mom.', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
      scenario('care-emergency', 'Fall injury gets emergency disclaimer', 'My dad fell and cannot get up.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
    ],
    promptGuidance: ['Ask relationship, care need, desired start date, and location for new care leads.', 'Never imply emergency response capability.'],
  },
  hospice: {
    key: 'hospice',
    label: 'Hospice',
    businessType: BusinessType.MEDICAL,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [medicalSafety],
    escalationPolicies: [],
    intakeFields: appointmentIntake,
    recommendedIntegrations: ['Google Calendar', 'secure intake forms', 'CRM'],
    valueMetrics: ['consultations booked', 'urgent handoffs', 'family inquiries captured'],
    readinessScenarios: [
      scenario('hospice-info', 'Hospice info can be answered', 'Can you tell me about hospice care?', { flowType: FlowType.FALLBACK }),
      scenario('hospice-urgent', 'Urgent patient concern escalates', 'My mother is having trouble breathing.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
    ],
    promptGuidance: ['Be calm and empathetic. Do not provide medical advice.'],
  },
  salon: {
    key: 'salon',
    label: 'Salon / spa',
    businessType: BusinessType.SERVICE,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [],
    escalationPolicies: [],
    intakeFields: appointmentIntake,
    recommendedIntegrations: ['Google Calendar', 'Cal.com', 'Square Appointments'],
    valueMetrics: ['appointments booked', 'service questions answered', 'missed clients recovered'],
    readinessScenarios: [
      scenario('salon-booking', 'Salon booking routes to scheduler', 'Can I book a haircut Friday?', { flowType: FlowType.MEETING }),
      scenario('salon-price', 'Price question stays informational', 'How much is a manicure?', { flowType: FlowType.FALLBACK }),
    ],
    promptGuidance: ['Ask service, date/time, and stylist preference when useful.'],
  },
  auto_shop: {
    key: 'auto_shop',
    label: 'Auto shop',
    businessType: BusinessType.SERVICE,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [autoSafety],
    escalationPolicies: [],
    intakeFields: [
      { key: 'vehicle', label: 'Vehicle year/make/model', examples: ['2018 Honda Civic'], requiredFor: ['booking', 'quote'] },
      { key: 'issue', label: 'Vehicle issue', examples: ['brakes squealing'], requiredFor: ['booking', 'quote'] },
      { key: 'tow_needed', label: 'Tow needed', examples: ['yes', 'no'], requiredFor: ['handoff'] },
    ],
    recommendedIntegrations: ['Google Calendar', 'shop management system', 'tow provider workflow'],
    valueMetrics: ['appointments booked', 'estimate requests', 'tow/safety handoffs'],
    readinessScenarios: [
      scenario('auto-brakes', 'Repair request routes to booking', 'My brakes are squealing and I need service.', { flowType: FlowType.MEETING }),
      scenario('auto-stranded', 'Stranded unsafe caller gets safety guidance', 'I am stranded on the highway after an accident.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
    ],
    promptGuidance: ['Collect year/make/model and issue for repair requests.'],
  },
  retail: {
    key: 'retail',
    label: 'Retail',
    businessType: BusinessType.RETAIL,
    catalogNoun: 'products',
    defaultFlows: [FlowType.INQUIRY, FlowType.ORDER, FlowType.FALLBACK],
    safetyPolicies: [],
    escalationPolicies: [
      { id: 'return_refund', label: 'Return/refund', severity: 'HIGH', keywords: ['refund', 'return', 'exchange', 'complaint'], customerReply: "I'll connect you with a team member who can help with that.", ownerSubject: 'Customer needs retail support', stopAutomation: true },
    ],
    intakeFields: [
      { key: 'product', label: 'Product', examples: ['blue hoodie'], requiredFor: ['quote'] },
      { key: 'variant', label: 'Size/color/variant', examples: ['medium', 'black'], requiredFor: ['quote'] },
      { key: 'hold_request', label: 'Hold request', examples: ['hold one for pickup'], requiredFor: ['handoff'] },
    ],
    recommendedIntegrations: ['Shopify', 'Square', 'Clover', 'Stripe'],
    valueMetrics: ['product inquiries answered', 'holds requested', 'orders recovered'],
    readinessScenarios: [
      scenario('retail-stock', 'Inventory question routes to inquiry', 'Do you have blue hoodies in medium?', { flowType: FlowType.INQUIRY }),
      scenario('retail-hold', 'Hold request is handled', 'Can you hold one for me?', { flowType: FlowType.FALLBACK }),
    ],
    promptGuidance: ['Never invent inventory. Offer to have staff verify unknown products.'],
  },
  consultant: {
    key: 'consultant',
    label: 'Consultant',
    businessType: BusinessType.CONSULTANT,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [],
    escalationPolicies: [],
    intakeFields: appointmentIntake,
    recommendedIntegrations: ['Google Calendar', 'Cal.com', 'CRM'],
    valueMetrics: ['consultations booked', 'qualified leads captured'],
    readinessScenarios: [
      scenario('consult-book', 'Consultation request routes to scheduler', 'I want to schedule a consultation.', { flowType: FlowType.MEETING }),
    ],
    promptGuidance: ['Qualify the lead briefly, then drive toward a consultation.'],
  },
  generic_service: {
    key: 'generic_service',
    label: 'Service business',
    businessType: BusinessType.SERVICE,
    catalogNoun: 'services',
    defaultFlows: [FlowType.MEETING, FlowType.FALLBACK],
    safetyPolicies: [homeServiceSafety],
    escalationPolicies: [],
    intakeFields: serviceIntake,
    recommendedIntegrations: ['Google Calendar', 'Cal.com', 'CRM'],
    valueMetrics: ['appointments booked', 'quote requests captured', 'urgent handoffs'],
    readinessScenarios: [
      scenario('generic-service-book', 'Service request routes to scheduler', 'I need help with a repair.', { flowType: FlowType.MEETING }),
    ],
    promptGuidance: ['Collect what they need, urgency, and preferred follow-up time.'],
  },
  other: {
    key: 'other',
    label: 'Other',
    businessType: BusinessType.OTHER,
    catalogNoun: 'services',
    defaultFlows: [FlowType.FALLBACK],
    safetyPolicies: [],
    escalationPolicies: [],
    intakeFields: [],
    recommendedIntegrations: ['Google Calendar', 'CRM'],
    valueMetrics: ['missed calls recovered', 'human handoffs'],
    readinessScenarios: [
      scenario('other-help', 'General message gets a reply', 'Can someone help me?', { flowType: FlowType.FALLBACK }),
    ],
    promptGuidance: ['When unsure, capture the request and offer human follow-up.'],
  },
};

const INDUSTRY_ALIASES: Record<string, VerticalKey> = {
  restaurant: 'restaurant',
  food_truck: 'food_truck',
  foodtruck: 'food_truck',
  home_services: 'home_services',
  home_service: 'home_services',
  hvac: 'hvac',
  plumbing: 'plumbing',
  plumber: 'plumbing',
  electrical: 'electrical',
  electrician: 'electrical',
  medical: 'medical',
  healthcare: 'medical',
  health: 'medical',
  home_care: 'home_care',
  home_health: 'home_care',
  senior_care: 'home_care',
  hospice: 'hospice',
  salon: 'salon',
  spa: 'salon',
  auto_shop: 'auto_shop',
  auto: 'auto_shop',
  mechanic: 'auto_shop',
  retail: 'retail',
  consultant: 'consultant',
  consulting: 'consultant',
  service: 'generic_service',
};

export function getVerticalKey(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
}): VerticalKey {
  const key = input.industryTemplateKey?.trim().toLowerCase();
  if (key && INDUSTRY_ALIASES[key]) return INDUSTRY_ALIASES[key];

  const text = `${input.tenantName ?? ''} ${input.websiteContext ?? ''}`.toLowerCase();
  if (/\bhvac\b|heating|cooling|air\s*conditioning|furnace|heat\s*pump/.test(text)) return 'hvac';
  if (/\bplumb(?:er|ing)?\b|drain|sewer|water\s*heater/.test(text)) return 'plumbing';
  if (/\belectric(?:al|ian)?\b|breaker|wiring|panel/.test(text)) return 'electrical';
  if (/\bhospice\b/.test(text)) return 'hospice';
  if (/\bhome\s+(?:care|health)\b|caregiver|senior\s+care/.test(text)) return 'home_care';
  if (/\bauto\b|mechanic|brake|transmission|oil\s+change/.test(text)) return 'auto_shop';
  if (/\bsalon\b|spa|haircut|manicure|stylist/.test(text)) return 'salon';

  switch (input.businessType) {
    case BusinessType.RESTAURANT:
      return 'restaurant';
    case BusinessType.FOOD_TRUCK:
      return 'food_truck';
    case BusinessType.MEDICAL:
      return 'medical';
    case BusinessType.CONSULTANT:
      return 'consultant';
    case BusinessType.RETAIL:
      return 'retail';
    case BusinessType.SERVICE:
      return 'generic_service';
    default:
      return 'other';
  }
}

export function getVerticalProfile(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
}): VerticalProfile {
  return VERTICAL_PROFILES[getVerticalKey(input)];
}

export function matchSafetyPolicy(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
  message: string;
  callerPhone?: string;
}): SafetyPolicyMatch | null {
  const profile = getVerticalProfile(input);
  const policy = profile.safetyPolicies.find((rule) => rule.pattern.test(input.message));
  if (!policy) return null;
  const callerPhone = input.callerPhone ?? 'customer';
  return {
    profile,
    policy,
    severity: policy.severity,
    customerReply: policy.customerReply,
    ownerSubject: policy.ownerSubject,
    ownerMessage: `Customer ${callerPhone} triggered ${policy.label}: "${input.message.substring(0, 240)}"`,
    taskTitle: policy.taskTitle(callerPhone),
    taskPriority: policy.severity === 'EMERGENCY' ? 'URGENT' : policy.severity === 'HIGH' ? 'HIGH' : 'NORMAL',
    stopAutomation: policy.stopAutomation,
  };
}

export function buildVerticalPromptGuidance(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
}): string {
  const profile = getVerticalProfile(input);
  const intake = profile.intakeFields.length
    ? `\nUseful ${profile.catalogNoun} intake fields: ${profile.intakeFields
        .map((field) => `${field.label} (${field.examples.join(' / ')})`)
        .join('; ')}.`
    : '';
  const safety = profile.safetyPolicies.length
    ? `\nSafety boundaries: ${profile.safetyPolicies.map((p) => p.label).join(', ')}. When matched, tell the customer we are not an emergency service and route to human follow-up.`
    : '';
  return `\nIndustry profile: ${profile.label}. Value metrics: ${profile.valueMetrics.join(', ')}.${intake}${safety}\n${profile.promptGuidance.map((line) => `- ${line}`).join('\n')}`;
}
