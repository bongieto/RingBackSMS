import { BusinessType } from './enums';
import type { BusinessLimits } from './models';

export type BusinessLimitKey = Exclude<keyof BusinessLimits, 'notes'>;

export interface BusinessLimitDefinition {
  key: BusinessLimitKey;
  label: string;
  description: string;
  promptRule: string;
  defaultEnabled: boolean;
}

const rule = (
  key: BusinessLimitKey,
  label: string,
  description: string,
  promptRule: string,
  defaultEnabled: boolean,
): BusinessLimitDefinition => ({ key, label, description, promptRule, defaultEnabled });

const REFUNDS_REQUIRE_STAFF = rule(
  'noRefundsBySms',
  'Refunds require staff',
  'The AI will not promise or confirm refunds.',
  'Do not process, promise, or confirm refunds over SMS. Direct refund requests to a human.',
  true,
);

export const BUSINESS_LIMIT_DEFINITIONS: Record<BusinessType, BusinessLimitDefinition[]> = {
  [BusinessType.RESTAURANT]: [
    rule('noDelivery', 'No delivery by text', 'Pickup only unless staff handles the request.', 'Do not offer delivery. Tell customers pickup is available.', false),
    REFUNDS_REQUIRE_STAFF,
    rule('allergyRequiresHuman', 'Allergies require staff', 'The AI will not confirm allergy safety.', 'Do not confirm allergy safety over SMS. Direct allergy questions to staff.', true),
    rule('noSameDayCatering', 'No same-day catering', 'Same-day catering requests are sent to staff.', 'Do not offer same-day catering. Ask customers to call or request a future date.', false),
    rule('noSubstitutions', 'No substitutions by text', 'The AI will not promise swaps or substitutions.', 'Do not promise substitutions. Say staff will confirm availability.', false),
    rule('noAfterHoursPickup', 'No after-hours pickup', 'Pickup requests outside hours are refused.', 'Do not offer after-hours pickup.', false),
  ],
  [BusinessType.FOOD_TRUCK]: [
    rule('noDelivery', 'No delivery by text', 'Pickup at the truck unless staff handles delivery.', 'Do not offer delivery. Tell customers pickup at the truck is available.', false),
    REFUNDS_REQUIRE_STAFF,
    rule('allergyRequiresHuman', 'Allergies require staff', 'The AI will not confirm allergy safety.', 'Do not confirm allergy safety over SMS. Direct allergy questions to staff.', true),
    rule('noSubstitutions', 'No substitutions by text', 'The AI will not promise swaps or substitutions.', 'Do not promise substitutions. Say staff will confirm availability.', false),
    rule('noAfterHoursPickup', 'No pickup outside service hours', 'Pickup is limited to posted service hours.', 'Do not offer pickup outside posted service hours.', false),
    rule('locationChangesRequireStaff', 'Location changes require staff', 'The AI will not invent or change the truck location.', 'Never invent, change, or promise a food-truck location. Use verified schedule information or direct the customer to staff.', true),
  ],
  [BusinessType.SERVICE]: [
    rule('quotesRequireStaff', 'Quotes require staff', 'The AI will not promise a final price.', 'Do not promise a final quote or price. Explain that staff must confirm pricing.', true),
    rule('scheduleChangesRequireStaff', 'Schedule changes require staff', 'Rescheduling and cancellations need confirmation.', 'Do not promise that an appointment was rescheduled or cancelled unless the scheduling system confirms it. Escalate uncertain changes to staff.', true),
    rule('noArrivalTimeGuarantees', 'No arrival-time guarantees', 'The AI will not guarantee an exact arrival time.', 'Do not guarantee an exact technician arrival time. Use only a verified appointment window.', true),
    rule('noOutcomeGuarantees', 'No outcome guarantees', 'The AI will not guarantee service results.', 'Do not guarantee service outcomes, completion times, or that a problem will be fixed.', true),
    REFUNDS_REQUIRE_STAFF,
    rule('urgentRequestsRequireStaff', 'Urgent requests require staff', 'Urgent or safety-related requests are escalated.', 'Escalate urgent, hazardous, or safety-related service requests to staff. Do not claim emergency dispatch.', true),
  ],
  [BusinessType.CONSULTANT]: [
    rule('noProfessionalAdvice', 'Advice requires a professional', 'The AI provides general information only.', 'Do not provide legal, financial, tax, or other regulated professional advice. Offer general information and route the request to a professional.', true),
    rule('quotesRequireStaff', 'Fees require staff confirmation', 'The AI will not promise fees or project pricing.', 'Do not promise fees, quotes, or project pricing unless it is verified. Direct the customer to staff.', true),
    rule('scheduleChangesRequireStaff', 'Schedule changes require confirmation', 'Rescheduling and cancellations must be confirmed.', 'Do not promise that a consultation was rescheduled or cancelled unless the scheduling system confirms it.', true),
    rule('noOutcomeGuarantees', 'No outcome guarantees', 'The AI will not guarantee results.', 'Do not guarantee results, approvals, savings, or business outcomes.', true),
    rule('confidentialInfoRequiresStaff', 'Confidential matters require staff', 'Sensitive case details are routed to a person.', 'Do not request or repeat confidential case details over SMS. Route sensitive matters to staff.', true),
    REFUNDS_REQUIRE_STAFF,
  ],
  [BusinessType.MEDICAL]: [
    rule('noMedicalAdvice', 'No medical advice or diagnosis', 'The AI provides office information, not clinical guidance.', 'Do not provide medical advice, diagnosis, treatment recommendations, medication guidance, or clinical interpretation. Route clinical questions to qualified staff.', true),
    rule('emergenciesRequire911', 'Emergencies require 911', 'Emergency messages are directed to 911 immediately.', 'If the message may describe an emergency, tell the person to call 911 now. Do not attempt to triage or manage the emergency over SMS.', true),
    rule('noAvailabilityPromises', 'Care availability requires staff', 'The AI will not promise a caregiver, nurse, or appointment slot.', 'Do not promise caregiver, clinician, nurse, bed, or appointment availability unless a connected scheduling system confirms it.', true),
    rule('scheduleChangesRequireStaff', 'Schedule changes require staff', 'Care schedule changes must be confirmed by the agency.', 'Do not promise care schedule, caregiver assignment, rescheduling, or cancellation changes. Route them to staff unless the scheduling system confirms the change.', true),
    rule('coverageAndCostsRequireStaff', 'Coverage and costs require staff', 'Insurance, eligibility, and final costs must be verified.', 'Do not confirm insurance coverage, eligibility, benefits, authorization, or final cost. Direct those questions to staff.', true),
    rule('sensitiveHealthInfoRequiresStaff', 'Health details require staff', 'The AI avoids collecting sensitive clinical details by text.', 'Do not ask for or repeat detailed diagnoses, medications, Social Security numbers, insurance IDs, or other sensitive health information over SMS. Route the person to staff.', true),
  ],
  [BusinessType.RETAIL]: [
    rule('noDelivery', 'No delivery by text', 'Pickup or shipping only when the business supports it.', 'Do not offer delivery unless it is explicitly verified. Offer an available verified fulfillment method.', false),
    REFUNDS_REQUIRE_STAFF,
    rule('noSubstitutions', 'No substitutions by text', 'The AI will not promise product substitutions.', 'Do not promise substitutions. Say staff will confirm product availability.', false),
    rule('inventoryRequiresStaffConfirmation', 'Inventory requires confirmation', 'The AI will not guarantee unverified stock.', 'Do not guarantee inventory unless current stock is verified. Say staff must confirm availability.', true),
    rule('holdsRequireStaffConfirmation', 'Product holds require staff', 'The AI will not promise that an item is reserved.', 'Do not promise a product hold or reservation unless staff or a connected system confirms it.', true),
    rule('noAfterHoursPickup', 'No after-hours pickup', 'Pickup is limited to posted business hours.', 'Do not offer after-hours pickup.', false),
  ],
  [BusinessType.OTHER]: [
    rule('quotesRequireStaff', 'Quotes require staff', 'The AI will not promise a final price.', 'Do not promise a final quote or price. Explain that staff must confirm pricing.', true),
    rule('scheduleChangesRequireStaff', 'Schedule changes require confirmation', 'Rescheduling and cancellations must be confirmed.', 'Do not promise that an appointment was rescheduled or cancelled unless the scheduling system confirms it.', true),
    rule('noOutcomeGuarantees', 'No outcome guarantees', 'The AI will not guarantee results.', 'Do not guarantee results, approvals, completion times, or outcomes.', true),
    rule('confidentialInfoRequiresStaff', 'Sensitive matters require staff', 'Private or confidential details are routed to a person.', 'Do not request or repeat confidential information over SMS. Route sensitive matters to staff.', true),
    REFUNDS_REQUIRE_STAFF,
    rule('urgentRequestsRequireStaff', 'Urgent requests require staff', 'Urgent or safety-related requests are escalated.', 'Escalate urgent or safety-related requests to staff. Do not claim emergency dispatch.', true),
  ],
};

function normalizeBusinessType(type: string | null | undefined): BusinessType {
  return type && Object.values(BusinessType).includes(type as BusinessType)
    ? (type as BusinessType)
    : BusinessType.OTHER;
}

export function getBusinessLimitDefinitions(
  businessType: string | null | undefined,
): BusinessLimitDefinition[] {
  return BUSINESS_LIMIT_DEFINITIONS[normalizeBusinessType(businessType)];
}

export function getDefaultBusinessLimits(
  businessType: string | null | undefined,
): BusinessLimits {
  const defaults = Object.fromEntries(
    Object.values(BusinessType)
      .flatMap((type) => BUSINESS_LIMIT_DEFINITIONS[type])
      .map((definition) => [definition.key, false]),
  ) as Omit<BusinessLimits, 'notes'>;

  for (const definition of getBusinessLimitDefinitions(businessType)) {
    defaults[definition.key] = definition.defaultEnabled;
  }

  return { ...defaults, notes: [] };
}
