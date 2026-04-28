import { FlowType } from '@ringback/shared-types';
import type { TenantContext } from './types';
import { getVerticalProfileWithOverrides, type IntakeField, type VerticalKey } from './verticals';

export interface StructuredIntakeField {
  key: string;
  label: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'message';
}

export interface StructuredIntakeMissingField {
  key: string;
  label: string;
  requiredFor: IntakeField['requiredFor'];
}

export interface StructuredIntake {
  verticalKey: VerticalKey;
  verticalLabel: string;
  captured: StructuredIntakeField[];
  missing: StructuredIntakeMissingField[];
}

const MAKE_WORDS = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevy', 'Chevrolet', 'Chrysler',
  'Dodge', 'Ford', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jeep', 'Kia', 'Lexus',
  'Mazda', 'Mercedes', 'Nissan', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
];

function firstMatch(message: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const value = (match?.[1] ?? match?.[0])?.trim();
    if (value) return value.replace(/[.!,;:]$/, '').trim();
  }
  return null;
}

function has(message: string, pattern: RegExp): boolean {
  return pattern.test(message);
}

function setField(
  fields: Map<string, StructuredIntakeField>,
  profileFields: IntakeField[],
  key: string,
  value: string | null | undefined,
  confidence: StructuredIntakeField['confidence'] = 'medium',
) {
  const clean = value?.trim();
  if (!clean || fields.has(key)) return;
  const profileField = profileFields.find((field) => field.key === key);
  fields.set(key, {
    key,
    label: profileField?.label ?? key.replace(/_/g, ' '),
    value: clean,
    confidence,
    source: 'message',
  });
}

function inferUrgency(message: string): string | null {
  if (has(message, /\b(?:emergency|urgent|asap|right now|immediately|now)\b/i)) return 'urgent';
  if (has(message, /\b(?:today|same day|this afternoon|this morning|tonight)\b/i)) return 'today';
  if (has(message, /\b(?:tomorrow|next day)\b/i)) return 'tomorrow';
  if (has(message, /\b(?:this week|next week|weekend)\b/i)) return firstMatch(message, [/\b(this week|next week|this weekend|weekend)\b/i]);
  if (has(message, /\b(?:not urgent|no rush|whenever)\b/i)) return 'not urgent';
  return null;
}

function inferPreferredTime(message: string): string | null {
  return firstMatch(message, [
    /\b((?:today|tomorrow|tonight|this morning|this afternoon|this evening|next week|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|night))?)\b/i,
    /\b((?:at|around|after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
    /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i,
  ]);
}

function inferAddress(message: string): string | null {
  return firstMatch(message, [
    /\b(\d{2,6}\s+[A-Za-z0-9.' -]+?\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place|circle|cir)\b(?:\.|,)?(?:\s*(?:apt|suite|unit|#)\s*[A-Za-z0-9-]+)?)/i,
  ]);
}

function inferIssue(message: string): string | null {
  return firstMatch(message, [
    /\b(?:my|the|our)\s+(.{3,80}?\b(?:not working|stopped working|not cooling|not heating|leaking|broken|squealing|making noise|won't start|is out|went out))\b/i,
    /\b(?:need|needs|looking for|want)\s+(?:help with|someone to fix|service for|repair for)?\s*(.{3,80})/i,
    /\b((?:ac|a\/c|furnace|heater|heat|plumbing|pipe|sink|toilet|car|brakes?|engine|transmission|battery|hair|color|manicure|hoodie|shirt|shoes).{0,70})/i,
  ]);
}

function inferHvacSystem(message: string): string | null {
  return firstMatch(message, [
    /\b(central\s+(?:ac|a\/c|air)|ac|a\/c|air conditioner|furnace|heater|heat pump|boiler|mini[-\s]?split|thermostat)\b/i,
  ]);
}

function inferHomeCareRelationship(message: string): string | null {
  return firstMatch(message, [
    /\b(my\s+(?:mom|mother|dad|father|parent|parents|grandmother|grandfather|spouse|husband|wife|sister|brother))\b/i,
    /\b(for\s+(?:me|myself|a client|a patient))\b/i,
  ]);
}

function inferCareNeed(message: string): string | null {
  return firstMatch(message, [
    /\b(caregiver|home care|companionship|bathing help|meal prep|medication reminders?|dementia care|respite care|mobility help|transportation|overnight care)\b/i,
  ]);
}

function inferVehicle(message: string): string | null {
  const makePattern = MAKE_WORDS.join('|');
  return firstMatch(message, [
    new RegExp(`\\b((?:19|20)\\d{2}\\s+(?:${makePattern})(?:\\s+[A-Za-z0-9-]+){0,3})\\b`, 'i'),
    new RegExp(`\\b((?:${makePattern})(?:\\s+[A-Za-z0-9-]+){0,3})\\b`, 'i'),
  ]);
}

function inferTowNeeded(message: string): string | null {
  if (has(message, /\b(?:need|needs|want)\s+(?:a\s+)?tow|tow truck|towed|towing\b/i)) return 'yes';
  if (has(message, /\b(?:no tow|do not need a tow|don't need a tow)\b/i)) return 'no';
  return null;
}

function inferSalonService(message: string): string | null {
  return firstMatch(message, [
    /\b(haircut|cut|color correction|color|balayage|highlights|blowout|manicure|pedicure|facial|waxing|massage|beard trim)\b/i,
  ]);
}

function inferStylist(message: string): string | null {
  return firstMatch(message, [
    /\b(?:with|by)\s+([A-Z][a-z]{2,20})\b/,
    /\b(?:any stylist|first available|no preference)\b/i,
  ]);
}

function inferRetailProduct(message: string): string | null {
  return firstMatch(message, [
    /\b(?:have|hold|buy|looking for|want|need)\s+(?:a|an|the)?\s*([a-z0-9 -]{3,60}?(?:hoodie|shirt|shoes|dress|hat|jacket|pants|jeans|bag|product|item))\b/i,
  ]);
}

function inferRetailVariant(message: string): string | null {
  const size = firstMatch(message, [/\b(xs|small|medium|large|xl|xxl|size\s+\d{1,2})\b/i]);
  const color = firstMatch(message, [/\b(black|white|blue|red|green|yellow|pink|purple|gray|grey|brown|tan|navy)\b/i]);
  if (size && color) return `${color}, ${size}`;
  return size ?? color;
}

function inferHoldRequest(message: string): string | null {
  return has(message, /\b(?:hold|save|reserve|set aside)\b/i) ? 'yes' : null;
}

function inferRestaurantOrderType(message: string): string | null {
  if (has(message, /\b(?:catering|cater|party tray|tray order|event|birthday|office lunch|corporate lunch|large order)\b/i)) return 'catering';
  if (has(message, /\b(?:dine[-\s]?in|eat there|table for|reservation|party of)\b/i)) return 'dine-in';
  if (has(message, /\b(?:pickup|pick up|takeout|take out|to go|carryout|carry out)\b/i)) return 'pickup';
  return null;
}

function inferPartySize(message: string): string | null {
  return firstMatch(message, [
    /\b(?:party of|table for)\s+(\d{1,4})\b/i,
    /\b(\d{1,4}\s+(?:people|persons|guests|attendees|employees|kids|adults))\b/i,
    /\b(?:for|serves?)\s+(\d{1,4})\b/i,
  ]);
}

function inferAllergyNotes(message: string): string | null {
  return firstMatch(message, [
    /\b((?:peanut|tree nut|nut|shellfish|shrimp|dairy|milk|egg|soy|gluten|wheat|fish|sesame)\s+allerg(?:y|ies|ic))\b/i,
    /\b(allerg(?:y|ies|ic)\s+(?:to\s+)?(?:peanut|tree nut|nut|shellfish|shrimp|dairy|milk|egg|soy|gluten|wheat|fish|sesame)[a-z\s]*)\b/i,
    /\b(no\s+(?:peanuts?|nuts?|shellfish|shrimp|dairy|milk|egg|soy|gluten|wheat|fish|sesame))\b/i,
  ]);
}

function inferCustomerName(message: string): string | null {
  return firstMatch(message, [
    /\b(?:my name is|this is|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
    /\b(?:for|under)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  ]);
}

function inferPhoneConfirmation(message: string): string | null {
  return firstMatch(message, [
    /\b((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/,
  ]);
}

function fieldLooksLike(field: IntakeField, patterns: RegExp[]): boolean {
  const text = `${field.key} ${field.label}`.replace(/[_-]/g, ' ');
  return patterns.some((pattern) => pattern.test(text));
}

function inferGateCode(message: string): string | null {
  return firstMatch(message, [
    /\b(?:gate|door|access|entry)\s+(?:code|pin)\s*(?:is|:)?\s*([A-Za-z0-9#*-]{3,12})\b/i,
    /\b(?:code|pin)\s*(?:is|:)?\s*([A-Za-z0-9#*-]{3,12})\b/i,
  ]);
}

function inferPetsOnSite(message: string): string | null {
  if (has(message, /\b(?:no pets?|no dogs?|no cats?)\b/i)) return 'no pets';
  return firstMatch(message, [
    /\b((?:\d+\s+)?(?:dog|dogs|cat|cats|pet|pets)(?:\s+(?:inside|outside|on site|at home))?)\b/i,
    /\b(?:there (?:is|are)|we have|I have)\s+((?:\d+\s+)?(?:dog|dogs|cat|cats|pet|pets))\b/i,
  ]);
}

function inferParkingInstructions(message: string): string | null {
  return firstMatch(message, [
    /\b((?:park|parking)\s+(?:in|on|at|by|behind|near)\s+[^.!,;]{3,80})/i,
    /\b((?:use|enter through|go through)\s+(?:the\s+)?(?:side|back|front|garage|alley|driveway)[^.!,;]{0,60})/i,
  ]);
}

function inferBudgetRange(message: string): string | null {
  return firstMatch(message, [
    /\b(?:budget|price range)\s*(?:is|:)?\s*(\$?\d[\d,]*(?:\s*[-–]\s*\$?\d[\d,]*)?)\b/i,
    /\b(?:under|below|less than|up to)\s+(\$?\d[\d,]*)\b/i,
    /\b(\$?\d[\d,]*\s*[-–]\s*\$?\d[\d,]*)\b/,
  ]);
}

function inferPreferredTechnician(message: string): string | null {
  return firstMatch(message, [
    /\b(?:prefer|request|with|send)\s+([A-Z][a-z]{2,20})(?:\s+(?:again|please))?\b/,
    /\b(?:same tech|same technician|first available|any technician|no preference)\b/i,
  ]);
}

function inferSerialNumber(message: string): string | null {
  return firstMatch(message, [
    /\b(?:serial|model|unit)\s*(?:number|#|no\.?)?\s*(?:is|:)?\s*([A-Za-z0-9-]{4,30})\b/i,
  ]);
}

function inferReferencePhoto(message: string): string | null {
  if (has(message, /\b(?:photo|picture|image|screenshot|pic)\s+(?:attached|sent|included)\b/i)) return 'attached';
  if (has(message, /\b(?:can|will|I'll|I can)\s+send\s+(?:a\s+)?(?:photo|picture|image|screenshot|pic)\b/i)) return 'customer can send photo';
  return null;
}

function inferCustomConfiguredField(field: IntakeField, message: string): string | null {
  if (fieldLooksLike(field, [/\b(gate|door|access|entry)\s*(code|pin)?\b/i, /\bcode\b/i])) {
    return inferGateCode(message);
  }
  if (fieldLooksLike(field, [/\b(pet|dog|cat|animal)s?\b/i])) return inferPetsOnSite(message);
  if (fieldLooksLike(field, [/\b(parking|driveway|entrance|entry|access instruction)s?\b/i])) {
    return inferParkingInstructions(message);
  }
  if (fieldLooksLike(field, [/\b(budget|price range|spend|cost range)\b/i])) return inferBudgetRange(message);
  if (fieldLooksLike(field, [/\b(preferred|requested)?\s*(tech|technician|provider|stylist|staff)\b/i])) {
    return inferPreferredTechnician(message);
  }
  if (fieldLooksLike(field, [/\b(serial|model|unit)\s*(number|#|no)?\b/i])) return inferSerialNumber(message);
  if (fieldLooksLike(field, [/\b(photo|picture|image|screenshot|reference)\b/i])) return inferReferencePhoto(message);
  return null;
}

function requiredForFlow(flowType: FlowType): Array<'booking' | 'quote' | 'handoff'> {
  if (flowType === FlowType.MEETING) return ['booking'];
  if (flowType === FlowType.INQUIRY) return ['quote'];
  if (flowType === FlowType.FALLBACK) return ['handoff', 'quote'];
  return ['quote'];
}

export function extractVerticalIntake(input: {
  tenantContext: TenantContext;
  inboundMessage: string;
  flowType: FlowType;
}): StructuredIntake | undefined {
  const profile = getVerticalProfileWithOverrides({
    ...input.tenantContext,
    intakeFieldOverrides: (input.tenantContext.config as { intakeFieldOverrides?: unknown }).intakeFieldOverrides,
  });
  if (profile.intakeFields.length === 0) return undefined;

  const fields = new Map<string, StructuredIntakeField>();
  const message = input.inboundMessage;

  if (profile.key === 'restaurant') {
    const orderType = inferRestaurantOrderType(message);
    setField(fields, profile.intakeFields, 'order_type', orderType, 'high');
    if (orderType === 'catering') {
      setField(fields, profile.intakeFields, 'event_date_time', inferPreferredTime(message), 'medium');
    } else {
      setField(fields, profile.intakeFields, 'preferred_pickup_time', inferPreferredTime(message), 'medium');
    }
    setField(fields, profile.intakeFields, 'party_size', inferPartySize(message), 'high');
    setField(fields, profile.intakeFields, 'allergy_notes', inferAllergyNotes(message), 'high');
    setField(fields, profile.intakeFields, 'customer_name', inferCustomerName(message), 'medium');
    setField(fields, profile.intakeFields, 'phone_confirmation', inferPhoneConfirmation(message), 'high');
  }

  if (['home_services', 'plumbing', 'electrical', 'generic_service'].includes(profile.key)) {
    setField(fields, profile.intakeFields, 'issue', inferIssue(message), 'medium');
    setField(fields, profile.intakeFields, 'urgency', inferUrgency(message), 'high');
    setField(fields, profile.intakeFields, 'address', inferAddress(message), 'high');
    setField(fields, profile.intakeFields, 'preferred_time', inferPreferredTime(message), 'medium');
  }

  if (profile.key === 'hvac') {
    setField(fields, profile.intakeFields, 'issue', inferIssue(message), 'medium');
    setField(fields, profile.intakeFields, 'urgency', inferUrgency(message), 'high');
    setField(fields, profile.intakeFields, 'address', inferAddress(message), 'high');
    setField(fields, profile.intakeFields, 'preferred_time', inferPreferredTime(message), 'medium');
    setField(fields, profile.intakeFields, 'system_type', inferHvacSystem(message), 'high');
  }

  if (['medical', 'hospice', 'consultant'].includes(profile.key)) {
    setField(fields, profile.intakeFields, 'service', inferIssue(message), 'medium');
    setField(fields, profile.intakeFields, 'preferred_time', inferPreferredTime(message), 'medium');
  }

  if (profile.key === 'home_care') {
    setField(fields, profile.intakeFields, 'relationship', inferHomeCareRelationship(message), 'high');
    setField(fields, profile.intakeFields, 'care_need', inferCareNeed(message) ?? inferIssue(message), 'medium');
    setField(fields, profile.intakeFields, 'start_date', inferPreferredTime(message), 'medium');
    setField(fields, profile.intakeFields, 'location', inferAddress(message) ?? firstMatch(message, [/\b(?:in|near)\s+([A-Z][A-Za-z .'-]{2,40})\b/]), 'medium');
  }

  if (profile.key === 'auto_shop') {
    setField(fields, profile.intakeFields, 'vehicle', inferVehicle(message), 'high');
    setField(fields, profile.intakeFields, 'issue', inferIssue(message), 'medium');
    setField(fields, profile.intakeFields, 'tow_needed', inferTowNeeded(message), 'high');
  }

  if (profile.key === 'salon') {
    setField(fields, profile.intakeFields, 'service', inferSalonService(message) ?? inferIssue(message), 'medium');
    setField(fields, profile.intakeFields, 'preferred_time', inferPreferredTime(message), 'medium');
    setField(fields, profile.intakeFields, 'stylist_preference', inferStylist(message), 'medium');
  }

  if (profile.key === 'retail') {
    setField(fields, profile.intakeFields, 'product', inferRetailProduct(message), 'medium');
    setField(fields, profile.intakeFields, 'variant', inferRetailVariant(message), 'medium');
    setField(fields, profile.intakeFields, 'hold_request', inferHoldRequest(message), 'high');
  }

  for (const field of profile.intakeFields) {
    if (fields.has(field.key)) continue;
    setField(fields, profile.intakeFields, field.key, inferCustomConfiguredField(field, message), 'medium');
  }

  const captured = [...fields.values()].filter((field) =>
    profile.intakeFields.some((configured) => configured.key === field.key),
  );
  const activeRequirements = requiredForFlow(input.flowType);
  const missing = profile.intakeFields
    .filter((field) => field.requiredFor.some((required) => activeRequirements.includes(required)))
    .filter((field) => !fields.has(field.key))
    .map((field) => ({ key: field.key, label: field.label, requiredFor: field.requiredFor }));

  if (captured.length === 0 && missing.length === 0) return undefined;
  return {
    verticalKey: profile.key,
    verticalLabel: profile.label,
    captured,
    missing,
  };
}
