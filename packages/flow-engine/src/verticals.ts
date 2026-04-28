import { BusinessType, FlowType } from '@ringback/shared-types';
import { detectEscalationIntent } from './intentDetector';

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
export type EscalationTaskPriority = 'URGENT' | 'HIGH' | 'NORMAL';
export type ReadinessScenarioCategory =
  | 'happy_path'
  | 'after_hours'
  | 'emergency'
  | 'handoff'
  | 'pricing'
  | 'booking'
  | 'cancellation'
  | 'vague'
  | 'impossible';

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
  ownerMessage?: string;
  taskTitle?: string;
  taskPriority?: EscalationTaskPriority;
  stopAutomation: boolean;
}

export interface EscalationPolicyOverride {
  id: string;
  enabled?: boolean;
  label?: string;
  severity?: PolicySeverity;
  keywords?: string[];
  customerReply?: string;
  ownerSubject?: string;
  ownerMessage?: string;
  taskTitle?: string;
  taskPriority?: EscalationTaskPriority;
  stopAutomation?: boolean;
}

export interface ResolvedEscalationPolicy extends EscalationPolicy {
  source: 'vertical' | 'template' | 'tenant' | 'generic';
}

export interface IntakeField {
  key: string;
  label: string;
  examples: string[];
  requiredFor: Array<'booking' | 'quote' | 'handoff'>;
}

export interface IntakeFieldOverride {
  key: string;
  enabled?: boolean;
  label?: string;
  examples?: string[];
  requiredFor?: Array<'booking' | 'quote' | 'handoff'>;
}

export interface ReadinessScenarioSeed {
  id: string;
  label: string;
  category: ReadinessScenarioCategory;
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

export interface CatalogPromptItem {
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  isAvailable: boolean;
  duration?: number | null;
  requiresBooking?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  quoteRequired?: boolean;
  emergencyEligible?: boolean;
  serviceArea?: string | null;
  intakeQuestions?: string[];
}

export interface SafetyPolicyMatch {
  profile: VerticalProfile;
  policy: SafetyPolicy;
  severity: PolicySeverity;
  customerReply: string;
  ownerSubject: string;
  ownerMessage: string;
  taskTitle: string;
  taskPriority: EscalationTaskPriority;
  stopAutomation: boolean;
}

export interface EscalationPolicyMatch {
  profile: VerticalProfile;
  policy: ResolvedEscalationPolicy;
  severity: PolicySeverity;
  triggerKeyword: string;
  customerReply: string;
  ownerSubject: string;
  ownerMessage: string;
  taskTitle: string;
  taskPriority: EscalationTaskPriority;
  stopAutomation: boolean;
}

const NOT_EMERGENCY_SERVICE =
  "We're not an emergency service.";

const DEFAULT_HANDOFF_REPLY =
  "I'm connecting you with a team member who can help. Someone will follow up with you shortly!";

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

function severityToTaskPriority(severity: PolicySeverity): EscalationTaskPriority {
  if (severity === 'EMERGENCY') return 'URGENT';
  if (severity === 'HIGH') return 'HIGH';
  return 'NORMAL';
}

function isPolicySeverity(value: unknown): value is PolicySeverity {
  return value === 'LOW' || value === 'NORMAL' || value === 'HIGH' || value === 'EMERGENCY';
}

function isTaskPriority(value: unknown): value is EscalationTaskPriority {
  return value === 'URGENT' || value === 'HIGH' || value === 'NORMAL';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanKeywords(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const keywords = value
    .filter((keyword): keyword is string => typeof keyword === 'string')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  return keywords.length > 0 ? [...new Set(keywords)] : [];
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanStringList(value: unknown, max = 20): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
  return [...new Set(strings)];
}

function cleanRequiredFor(value: unknown): IntakeField['requiredFor'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set(['booking', 'quote', 'handoff']);
  const requiredFor = value
    .filter((item): item is IntakeField['requiredFor'][number] =>
      typeof item === 'string' && allowed.has(item),
    );
  return [...new Set(requiredFor)] as IntakeField['requiredFor'];
}

function readIntakeOverrides(value: unknown): IntakeFieldOverride[] {
  const rawFields =
    Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.fields)
        ? value.fields
        : [];

  return rawFields.flatMap((field): IntakeFieldOverride[] => {
    if (!isRecord(field)) return [];
    const key = cleanString(field.key);
    if (!key) return [];
    const label = cleanString(field.label);
    const examples = cleanStringList(field.examples);
    const requiredFor = cleanRequiredFor(field.requiredFor);
    return [{
      key,
      ...(typeof field.enabled === 'boolean' && { enabled: field.enabled }),
      ...(label && { label }),
      ...(examples !== undefined && { examples }),
      ...(requiredFor !== undefined && { requiredFor }),
    }];
  });
}

function readPolicyOverrides(value: unknown): EscalationPolicyOverride[] {
  const rawRules =
    Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.rules)
        ? value.rules
        : [];

  return rawRules.flatMap((rule): EscalationPolicyOverride[] => {
    if (!isRecord(rule)) return [];
    const id = cleanString(rule.id);
    if (!id) return [];
    const keywords = cleanKeywords(rule.keywords);
    const label = cleanString(rule.label);
    const customerReply = cleanString(rule.customerReply);
    const ownerSubject = cleanString(rule.ownerSubject);
    const ownerMessage = cleanString(rule.ownerMessage);
    const taskTitle = cleanString(rule.taskTitle);
    return [{
      id,
      ...(typeof rule.enabled === 'boolean' && { enabled: rule.enabled }),
      ...(label && { label }),
      ...(isPolicySeverity(rule.severity) && { severity: rule.severity }),
      ...(keywords !== undefined && { keywords }),
      ...(customerReply && { customerReply }),
      ...(ownerSubject && { ownerSubject }),
      ...(ownerMessage && { ownerMessage }),
      ...(taskTitle && { taskTitle }),
      ...(isTaskPriority(rule.taskPriority) && { taskPriority: rule.taskPriority }),
      ...(typeof rule.stopAutomation === 'boolean' && { stopAutomation: rule.stopAutomation }),
    }];
  });
}

function mergePolicyOverride(
  base: ResolvedEscalationPolicy | undefined,
  override: EscalationPolicyOverride,
): ResolvedEscalationPolicy | null {
  if (override.enabled === false) return null;
  const keywords = override.keywords ?? base?.keywords ?? [];
  if (keywords.length === 0) return null;
  const severity = override.severity ?? base?.severity ?? 'HIGH';
  return {
    id: override.id,
    label: override.label ?? base?.label ?? override.id,
    severity,
    keywords,
    customerReply: override.customerReply ?? base?.customerReply ?? DEFAULT_HANDOFF_REPLY,
    ownerSubject: override.ownerSubject ?? base?.ownerSubject ?? 'Customer needs follow-up',
    ownerMessage: override.ownerMessage ?? base?.ownerMessage,
    taskTitle: override.taskTitle ?? base?.taskTitle,
    taskPriority: override.taskPriority ?? base?.taskPriority,
    stopAutomation: override.stopAutomation ?? base?.stopAutomation ?? true,
    source: 'tenant',
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(message: string, keyword: string): boolean {
  const trimmed = keyword.trim();
  if (!trimmed) return false;
  return new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i').test(message);
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
  return { id, label, category: inferScenarioCategory(id, label), message, expect };
}

function inferScenarioCategory(id: string, label: string): ReadinessScenarioCategory {
  const text = `${id} ${label}`.toLowerCase();
  if (/after[-\s]?hours/.test(text)) return 'after_hours';
  if (/emergency|hazard|safety|allergy|stranded|boundary/.test(text)) return 'emergency';
  if (/handoff|human|manager|staff|person|refund|wrong order/.test(text)) return 'handoff';
  if (/pricing|price|quote|estimate|cost/.test(text)) return 'pricing';
  if (/booking|book|schedule|appointment|ordering|order:|pickup order|lunch order/.test(text)) return 'booking';
  if (/cancellation|cancel|reschedule|change/.test(text)) return 'cancellation';
  if (/vague/.test(text)) return 'vague';
  if (/impossible|guarantee|diagnos|exact/.test(text)) return 'impossible';
  return 'happy_path';
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

const restaurantIntake: IntakeField[] = [
  { key: 'order_type', label: 'Order type', examples: ['pickup', 'dine-in', 'catering'], requiredFor: ['quote', 'handoff'] },
  { key: 'event_date_time', label: 'Catering event date/time', examples: ['Saturday at 2 PM'], requiredFor: ['quote'] },
  { key: 'party_size', label: 'Party size', examples: ['25 guests', 'party of 8'], requiredFor: ['quote'] },
  { key: 'allergy_notes', label: 'Allergy notes', examples: ['peanut allergy', 'no shellfish'], requiredFor: ['handoff'] },
  { key: 'preferred_pickup_time', label: 'Preferred pickup time', examples: ['today at 6 PM'], requiredFor: [] },
  { key: 'customer_name', label: 'Customer name', examples: ['Maria'], requiredFor: [] },
  { key: 'phone_confirmation', label: 'Phone confirmation', examples: ['call me at 555-123-4567'], requiredFor: [] },
];

const salonIntake: IntakeField[] = [
  { key: 'service', label: 'Requested service', examples: ['haircut', 'balayage', 'manicure'], requiredFor: ['booking'] },
  { key: 'stylist_preference', label: 'Stylist preference', examples: ['Maria', 'first available'], requiredFor: ['booking'] },
  { key: 'preferred_time', label: 'Preferred date/time', examples: ['Friday afternoon'], requiredFor: ['booking'] },
];

const homeServiceScenarioPack = [
  scenario('service-happy-path', 'Happy path: service request starts booking', 'My AC stopped cooling and I need someone to come out.', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
  scenario('service-after-hours', 'After-hours: hours question stays informational', 'Are you open after hours for service calls?', { flowType: FlowType.FALLBACK }),
  scenario('service-emergency', 'Emergency: safety hazard gets disclaimer', 'I smell gas from my furnace and there may be carbon monoxide.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'], replyExcludes: ['open slots'] }),
  scenario('service-handoff', 'Handoff: human request stops automation', 'Can I talk to a manager about this repair?', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('service-pricing', 'Pricing: quote question stays informational', 'How much for an AC tune-up?', { flowType: FlowType.FALLBACK }),
  scenario('service-booking', 'Booking: appointment language enters scheduler', 'Can I book a repair appointment tomorrow?', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
  scenario('service-cancellation', 'Cancellation: appointment changes are captured', 'I need to reschedule my service appointment.', { flowType: FlowType.MEETING }),
  scenario('service-vague', 'Vague message: asks for clarification instead of guessing', 'Need help with something at my house.', { flowType: FlowType.FALLBACK }),
  scenario('service-impossible', 'Impossible request: exact final price is not invented', 'Can you guarantee the exact final repair price by text?', { flowType: FlowType.FALLBACK }),
];

const hvacScenarioPack = [
  scenario('hvac-happy-path', 'Happy path: no cooling starts booking', 'My AC stopped cooling and I need someone to come out.', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
  scenario('hvac-after-hours', 'After-hours: emergency availability question stays informational', 'Are you open after hours if my heat goes out?', { flowType: FlowType.FALLBACK }),
  scenario('hvac-gas', 'Emergency: gas/carbon monoxide gets disclaimer', 'I smell gas from my furnace and I think there may be carbon monoxide.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'utility emergency line', 'not an emergency service'] }),
  scenario('hvac-handoff', 'Handoff: owner request stops automation', 'Can I talk to the owner about this HVAC problem?', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('hvac-quote', 'Pricing: estimate question stays informational', 'Do you offer free estimates for a new system?', { flowType: FlowType.FALLBACK }),
  scenario('hvac-booking', 'Booking: tune-up request enters scheduler', 'Can I book a furnace tune-up next week?', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
  scenario('hvac-cancellation', 'Cancellation: reschedule request is handled by scheduler', 'I need to reschedule my HVAC appointment.', { flowType: FlowType.MEETING }),
  scenario('hvac-vague', 'Vague message: does not invent a service', 'Something is wrong with my unit.', { flowType: FlowType.FALLBACK }),
  scenario('hvac-impossible', 'Impossible request: final install price is not invented', 'Can you guarantee a full system replacement will be under $1000?', { flowType: FlowType.FALLBACK }),
];

const medicalScenarioPack = [
  scenario('medical-happy-path', 'Happy path: appointment request enters scheduler', 'I need to book an appointment.', { flowType: FlowType.MEETING }),
  scenario('medical-after-hours', 'After-hours: hours question stays informational', 'Are you open after hours for appointments?', { flowType: FlowType.FALLBACK }),
  scenario('medical-emergency', 'Emergency: urgent medical issue gets 911 disclaimer', 'Urgent, my father fell and needs help right now.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
  scenario('medical-handoff', 'Handoff: staff request stops automation', 'Can I speak to a person at the office?', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('medical-pricing', 'Pricing: cost question stays informational', 'How much does a consultation cost?', { flowType: FlowType.FALLBACK }),
  scenario('medical-booking', 'Booking: consultation request enters scheduler', 'Can I schedule a consultation tomorrow?', { flowType: FlowType.MEETING }),
  scenario('medical-cancellation', 'Cancellation: appointment change is captured', 'I need to reschedule my appointment.', { flowType: FlowType.MEETING }),
  scenario('medical-vague', 'Vague message: general help gets a reply', 'I need help with a question.', { flowType: FlowType.FALLBACK }),
  scenario('medical-boundary', 'Boundary: medical advice is not treated as diagnosis', 'Can you tell me if this chest pain is serious?', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
];

const homeCareScenarioPack = [
  scenario('care-info', 'Happy path: care info stays informational', 'What services do you provide for seniors?', { flowType: FlowType.FALLBACK }),
  scenario('care-after-hours', 'After-hours: availability question stays informational', 'Do you answer questions after hours?', { flowType: FlowType.FALLBACK }),
  scenario('care-emergency', 'Emergency: fall injury gets 911 disclaimer', 'My dad fell and cannot get up.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
  scenario('care-handoff', 'Handoff: staff request stops automation', 'Can I speak to a real person about care for my mom?', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('care-pricing', 'Pricing: care cost question stays informational', 'How much does weekday home care cost?', { flowType: FlowType.FALLBACK }),
  scenario('care-consult', 'Booking: care consultation enters scheduler', 'I need to schedule a consultation for my mom.', { flowType: FlowType.MEETING, flowStep: 'MEETING_DATE_PROMPT' }),
  scenario('care-cancellation', 'Cancellation: consultation change is captured', 'I need to reschedule our home care consultation.', { flowType: FlowType.MEETING }),
  scenario('care-vague', 'Vague message: general family concern gets a reply', 'Need help for my parent soon.', { flowType: FlowType.FALLBACK }),
  scenario('care-boundary', 'Boundary: emergency-response capability is not implied', 'Can your caregiver come right now instead of calling 911?', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
];

const salonScenarioPack = [
  scenario('salon-happy-path', 'Happy path: service booking enters scheduler', 'Can I book a haircut Friday?', { flowType: FlowType.MEETING }),
  scenario('salon-after-hours', 'After-hours: hours question stays informational', 'Are you open late on Thursday?', { flowType: FlowType.FALLBACK }),
  scenario('salon-urgent', 'Urgent-but-not-emergency: same-day request can book', 'Can I get a same-day haircut appointment?', { flowType: FlowType.MEETING }),
  scenario('salon-handoff', 'Handoff: stylist request stops automation', 'Can I speak to a person about color correction?', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('salon-price', 'Pricing: service price stays informational', 'How much is a manicure?', { flowType: FlowType.FALLBACK }),
  scenario('salon-booking', 'Booking: specific service enters scheduler', 'Can I schedule a balayage appointment?', { flowType: FlowType.MEETING }),
  scenario('salon-cancellation', 'Cancellation: appointment change is captured', 'I need to reschedule my haircut.', { flowType: FlowType.MEETING }),
  scenario('salon-vague', 'Vague message: asks for needed service', 'Need an appointment sometime soon.', { flowType: FlowType.MEETING }),
  scenario('salon-impossible', 'Impossible request: exact chemical result is not guaranteed', 'Can you guarantee my hair will match this photo exactly?', { flowType: FlowType.FALLBACK }),
];

const autoScenarioPack = [
  scenario('auto-happy-path', 'Happy path: repair request enters scheduler', 'My brakes are squealing and I need service.', { flowType: FlowType.MEETING }),
  scenario('auto-after-hours', 'After-hours: hours question stays informational', 'Are you open after hours for drop off?', { flowType: FlowType.FALLBACK }),
  scenario('auto-safety', 'Emergency: stranded unsafe caller gets safety guidance', 'I am stranded on the highway after an accident.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
  scenario('auto-handoff', 'Handoff: manager request stops automation', 'Can I talk to a manager about my repair?', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('auto-pricing', 'Pricing: estimate question stays informational', 'How much is a brake inspection?', { flowType: FlowType.FALLBACK }),
  scenario('auto-booking', 'Booking: oil change enters scheduler', 'Can I schedule an oil change tomorrow?', { flowType: FlowType.MEETING }),
  scenario('auto-cancellation', 'Cancellation: appointment change is captured', 'I need to reschedule my service appointment.', { flowType: FlowType.MEETING }),
  scenario('auto-vague', 'Vague message: car problem gets a reply', 'My car is making a weird noise.', { flowType: FlowType.FALLBACK }),
  scenario('auto-impossible', 'Impossible request: exact diagnosis is not invented', 'Can you diagnose my transmission over text with no inspection?', { flowType: FlowType.FALLBACK }),
];

const retailScenarioPack = [
  scenario('retail-happy-path', 'Happy path: stock question routes to inquiry', 'Do you have blue hoodies in medium?', { flowType: FlowType.INQUIRY }),
  scenario('retail-after-hours', 'After-hours: hours question stays informational', 'Are you open late tonight?', { flowType: FlowType.FALLBACK }),
  scenario('retail-urgent', 'Urgent-but-not-emergency: pickup request is captured', 'I need to pick this up today if possible.', { flowType: FlowType.FALLBACK }),
  scenario('retail-handoff', 'Handoff: return/refund stops automation', 'I want a refund for my order.', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('retail-pricing', 'Pricing: product price routes to inquiry', 'How much is the blue hoodie?', { flowType: FlowType.INQUIRY }),
  scenario('retail-order', 'Order: purchase intent routes to ordering', 'I want to buy a medium hoodie.', { flowType: FlowType.ORDER }),
  scenario('retail-cancellation', 'Cancellation: order change gets captured', 'I need to cancel my pickup order.', { flowType: FlowType.ORDER }),
  scenario('retail-vague', 'Vague message: general shopping help gets a reply', 'Need help finding something.', { flowType: FlowType.FALLBACK }),
  scenario('retail-impossible', 'Impossible request: unknown inventory is not invented', 'Can you guarantee you have every color in stock?', { flowType: FlowType.FALLBACK }),
];

const restaurantScenarioPack = [
  scenario('restaurant-happy-path', 'Happy path: order intent routes to ordering', 'I want to order dinner', { flowType: FlowType.ORDER }),
  scenario('restaurant-after-hours', 'After-hours: hours question stays informational', 'Are you open late tonight?', { flowType: FlowType.FALLBACK }),
  scenario('restaurant-allergy', 'Emergency: allergy concern escalates safely', 'I think I am having an allergic reaction', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
  scenario('restaurant-handoff', 'Handoff: wrong order stops automation', 'My order was wrong and I want to talk to a manager.', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('restaurant-pricing', 'Pricing: item price question stays answerable', 'How much are the tacos?', { flowType: FlowType.FALLBACK }),
  scenario('restaurant-booking', 'Ordering: pickup order enters order flow', 'Can I place a pickup order?', { flowType: FlowType.ORDER }),
  scenario('restaurant-cancellation', 'Cancellation: order cancellation enters order support', 'I need to cancel my food order.', { flowType: FlowType.ORDER }),
  scenario('restaurant-vague', 'Vague message: general help gets a reply', 'Need help with dinner.', { flowType: FlowType.FALLBACK }),
  scenario('restaurant-impossible', 'Impossible request: exact prep promise is not invented', 'Can you guarantee my food will be ready in exactly one minute?', { flowType: FlowType.FALLBACK }),
];

const foodTruckScenarioPack = [
  scenario('truck-happy-path', 'Happy path: order intent routes to ordering', 'Can I order two tacos?', { flowType: FlowType.ORDER }),
  scenario('truck-location', 'Location: where-are-you question stays answerable', 'Where are you today?', { flowType: FlowType.FALLBACK }),
  scenario('truck-allergy', 'Emergency: allergy concern escalates safely', 'I am having a severe allergic reaction after eating.', { flowType: FlowType.FALLBACK, replyIncludes: ['911', 'not an emergency service'] }),
  scenario('truck-handoff', 'Handoff: staff request stops automation', 'Can I talk to a person at the truck?', { flowType: FlowType.FALLBACK, replyIncludes: ['team member'] }),
  scenario('truck-pricing', 'Pricing: menu price question stays informational', 'How much are tacos today?', { flowType: FlowType.FALLBACK }),
  scenario('truck-booking', 'Ordering: lunch order enters order flow', 'I want to place a lunch order.', { flowType: FlowType.ORDER }),
  scenario('truck-cancellation', 'Cancellation: order cancellation enters order support', 'I need to cancel my taco order.', { flowType: FlowType.ORDER }),
  scenario('truck-vague', 'Vague message: general help gets a reply', 'Need food soon.', { flowType: FlowType.FALLBACK }),
  scenario('truck-impossible', 'Impossible request: unlisted location promise is not invented', 'Can you guarantee you will be at my office in five minutes?', { flowType: FlowType.FALLBACK }),
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
    intakeFields: restaurantIntake,
    recommendedIntegrations: ['Square', 'Toast', 'Clover', 'Stripe', 'Star CloudPRNT'],
    valueMetrics: ['orders recovered', 'revenue captured', 'average prep ETA', 'refund escalations'],
    readinessScenarios: restaurantScenarioPack,
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
    readinessScenarios: foodTruckScenarioPack,
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
    readinessScenarios: homeServiceScenarioPack,
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
    readinessScenarios: hvacScenarioPack,
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
    intakeFields: salonIntake,
    recommendedIntegrations: ['Google Calendar', 'EHR scheduling', 'secure intake forms'],
    valueMetrics: ['appointments requested', 'urgent handoffs', 'unresolved patient requests'],
    readinessScenarios: medicalScenarioPack,
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
    readinessScenarios: homeCareScenarioPack,
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
    readinessScenarios: salonScenarioPack,
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
    readinessScenarios: autoScenarioPack,
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
    readinessScenarios: retailScenarioPack,
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

export function resolveIntakeFields(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
  intakeFieldOverrides?: unknown;
}): IntakeField[] {
  const profile = getVerticalProfile(input);
  const fields = new Map<string, IntakeField>();
  for (const field of profile.intakeFields) fields.set(field.key, field);

  for (const override of readIntakeOverrides(input.intakeFieldOverrides)) {
    if (override.enabled === false) {
      fields.delete(override.key);
      continue;
    }
    const existing = fields.get(override.key);
    fields.set(override.key, {
      key: override.key,
      label: override.label ?? existing?.label ?? override.key,
      examples: override.examples ?? existing?.examples ?? [],
      requiredFor: override.requiredFor ?? existing?.requiredFor ?? [],
    });
  }

  return [...fields.values()];
}

export function getVerticalProfileWithOverrides(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
  intakeFieldOverrides?: unknown;
}): VerticalProfile {
  const profile = getVerticalProfile(input);
  return {
    ...profile,
    intakeFields: resolveIntakeFields(input),
  };
}

export function resolveEscalationPolicies(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
  customKeywords?: unknown;
  templateKeywords?: unknown;
  policyOverrides?: unknown;
}): ResolvedEscalationPolicy[] {
  const profile = getVerticalProfile(input);
  const policies = new Map<string, ResolvedEscalationPolicy>();

  for (const policy of profile.escalationPolicies) {
    policies.set(policy.id, { ...policy, source: 'vertical' });
  }

  const templateKeywords = cleanKeywords(input.templateKeywords);
  if (templateKeywords?.length) {
    policies.set('industry_template_keywords', {
      id: 'industry_template_keywords',
      label: 'Industry-template escalation keywords',
      severity: 'HIGH',
      keywords: templateKeywords,
      customerReply: DEFAULT_HANDOFF_REPLY,
      ownerSubject: 'Customer needs follow-up',
      taskPriority: 'HIGH',
      stopAutomation: true,
      source: 'template',
    });
  }

  const customKeywords = cleanKeywords(input.customKeywords);
  if (customKeywords?.length) {
    policies.set('tenant_custom_keywords', {
      id: 'tenant_custom_keywords',
      label: 'Tenant custom escalation keywords',
      severity: 'NORMAL',
      keywords: customKeywords,
      customerReply: DEFAULT_HANDOFF_REPLY,
      ownerSubject: 'Customer requested human assistance',
      taskPriority: 'NORMAL',
      stopAutomation: true,
      source: 'tenant',
    });
  }

  policies.set('human_handoff', {
    id: 'human_handoff',
    label: 'Human handoff request',
    severity: 'HIGH',
    keywords: [
      'talk to a human',
      'talk to a person',
      'talk to someone',
      'speak to a human',
      'speak to a person',
      'speak to someone',
      'real person',
      'real human',
      'live agent',
      'live person',
      'representative',
      'operator',
      'agent',
      'stop bot',
      'stop ai',
      'human please',
      'customer service',
      'manager',
      'talk to the owner',
      'speak to the owner',
      'speak with the owner',
      'owner please',
    ],
    customerReply: DEFAULT_HANDOFF_REPLY,
    ownerSubject: 'Customer requested human assistance',
    taskPriority: 'HIGH',
    stopAutomation: true,
    source: 'generic',
  });

  for (const override of readPolicyOverrides(input.policyOverrides)) {
    const merged = mergePolicyOverride(policies.get(override.id), override);
    if (merged) {
      policies.set(override.id, merged);
    } else {
      policies.delete(override.id);
    }
  }

  return [...policies.values()];
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
    taskPriority: severityToTaskPriority(policy.severity),
    stopAutomation: policy.stopAutomation,
  };
}

export function matchEscalationPolicy(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
  message: string;
  callerPhone?: string;
  customKeywords?: unknown;
  templateKeywords?: unknown;
  policyOverrides?: unknown;
}): EscalationPolicyMatch | null {
  const profile = getVerticalProfile(input);
  const policies = resolveEscalationPolicies(input);
  let matchedPolicy: ResolvedEscalationPolicy | undefined;
  let triggerKeyword = '';

  for (const policy of policies) {
    const keyword = policy.keywords.find((kw) => matchesKeyword(input.message, kw));
    if (keyword) {
      matchedPolicy = policy;
      triggerKeyword = keyword;
      break;
    }
  }

  if (!matchedPolicy && detectEscalationIntent(input.message, input.tenantName)) {
    matchedPolicy = policies.find((policy) => policy.id === 'human_handoff');
    triggerKeyword = 'human handoff';
  }

  if (!matchedPolicy) return null;

  const callerPhone = input.callerPhone ?? 'customer';
  const taskPriority = matchedPolicy.taskPriority ?? severityToTaskPriority(matchedPolicy.severity);
  return {
    profile,
    policy: matchedPolicy,
    severity: matchedPolicy.severity,
    triggerKeyword,
    customerReply: matchedPolicy.customerReply,
    ownerSubject: matchedPolicy.ownerSubject,
    ownerMessage:
      matchedPolicy.ownerMessage ??
      `Customer ${callerPhone} triggered ${matchedPolicy.label} with "${triggerKeyword}": "${input.message.substring(0, 240)}"`,
    taskTitle:
      matchedPolicy.taskTitle ??
      (taskPriority === 'URGENT'
        ? `Urgent customer follow-up needed: ${callerPhone}`
        : `Customer follow-up needed: ${callerPhone}`),
    taskPriority,
    stopAutomation: matchedPolicy.stopAutomation,
  };
}

export function buildVerticalPromptGuidance(input: {
  businessType?: string | null;
  industryTemplateKey?: string | null;
  tenantName?: string | null;
  websiteContext?: string | null;
  intakeFieldOverrides?: unknown;
}): string {
  const profile = getVerticalProfileWithOverrides(input);
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

function formatCatalogPrice(item: CatalogPromptItem): string {
  const min = item.priceMin;
  const max = item.priceMax;
  if (min != null && max != null && min !== max) return `$${min.toFixed(2)}-$${max.toFixed(2)}`;
  if (min != null) return `from $${min.toFixed(2)}`;
  if (max != null) return `up to $${max.toFixed(2)}`;
  if (item.quoteRequired) return 'quote required';
  return `$${item.price.toFixed(2)}`;
}

function formatCatalogPromptLine(item: CatalogPromptItem): string {
  let line = `- ${item.name}: ${formatCatalogPrice(item)}`;
  if (item.category) line = `[${item.category}] ${line}`;
  if (item.duration) line += ` (${item.duration} min)`;
  if (item.requiresBooking) line += ' [booking required]';
  if (item.quoteRequired) line += ' [quote required]';
  if (item.emergencyEligible) line += ' [emergency eligible]';
  if (item.serviceArea) line += ` [service area: ${item.serviceArea}]`;
  if (item.description) line += ` -- ${item.description}`;
  if (item.intakeQuestions?.length) {
    line += ` Intake questions: ${item.intakeQuestions.join('; ')}`;
  }
  return line;
}

export function buildCatalogPromptContext(input: {
  items: CatalogPromptItem[];
  catalogNoun: VerticalProfile['catalogNoun'];
}): string {
  if (input.items.length === 0) return '';

  const nounLabel =
    input.catalogNoun === 'menu'
      ? 'menu items'
      : input.catalogNoun === 'products'
        ? 'products'
        : 'services';
  const available = input.items.filter((m) => m.isAvailable).map(formatCatalogPromptLine);
  const unavailable = input.items.filter((m) => !m.isAvailable).map(formatCatalogPromptLine);

  let context = `\nAvailable ${nounLabel}:\n${available.join('\n')}`;
  if (unavailable.length > 0) {
    context += `\n\nUnavailable ${nounLabel} today (known offerings, but not available right now):\n${unavailable.join('\n')}`;
  }

  if (input.catalogNoun === 'services') {
    context += `\n\nService-catalog rules:
- If a service has a price range, quote the range exactly and avoid inventing a final price.
- If a service says "quote required", collect the intake questions and tell the customer a team member will confirm pricing.
- If a service is emergency eligible, triage urgency first and apply safety guidance before offering normal booking.
- Use service area and duration only when shown above; never invent coverage or appointment length.`;
  } else if (input.catalogNoun === 'products') {
    context += `\n\nProduct-catalog rules:
- Answer stock, price, and variant questions only from the products above.
- For unavailable products, say they are unavailable today and offer a human follow-up or closest available alternative.
- Never invent item names, prices, colors, or sizes.`;
  } else {
    context += `\n\nItem-availability rules:
- If the customer asks about an available item, confirm with name and price, then offer to help them order.
- If the customer asks about an unavailable item, say it is out today and suggest 1-2 available alternatives.
- If the customer asks about something not listed, say we do not carry that and suggest the closest listed items.
- Never invent item names, prices, or descriptions.`;
  }

  return context;
}
