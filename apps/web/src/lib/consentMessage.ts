import { BusinessType } from '@ringback/shared-types';

type BusinessTypeLike = BusinessType | `${BusinessType}` | string;

export const LEGACY_DEFAULT_CONSENT_TEMPLATE =
  "Hey! {business_name} here — we just missed your call and we're sorry about that! I can help you via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.";

const LEGACY_ASCII_CONSENT_TEMPLATE = LEGACY_DEFAULT_CONSENT_TEMPLATE.replace(' — ', ' - ');

const CAPABILITY_BY_BUSINESS_TYPE: Record<BusinessType, string> = {
  [BusinessType.RESTAURANT]: 'place an order or answer questions',
  [BusinessType.FOOD_TRUCK]: 'place an order, find our location, or answer questions',
  [BusinessType.SERVICE]: 'schedule an appointment or answer questions',
  [BusinessType.CONSULTANT]: 'schedule a consultation or answer questions',
  [BusinessType.MEDICAL]: 'request an appointment or get office information',
  [BusinessType.RETAIL]: 'check product availability, place an order, or answer questions',
  [BusinessType.OTHER]: 'answer questions or help with your request',
};

function normalizeBusinessType(type: BusinessTypeLike | null | undefined): BusinessType {
  if (type && Object.prototype.hasOwnProperty.call(CAPABILITY_BY_BUSINESS_TYPE, type)) {
    return type as BusinessType;
  }
  return BusinessType.OTHER;
}

/** Build the compliance-safe stock consent template for a tenant's vertical. */
export function getDefaultConsentTemplate(
  businessType: BusinessTypeLike | null | undefined,
): string {
  const capability = CAPABILITY_BY_BUSINESS_TYPE[normalizeBusinessType(businessType)];
  return `Hey! {business_name} here - we just missed your call and we're sorry about that! I can help you ${capability} via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.`;
}

function renderBusinessName(template: string, businessName: string): string {
  return template.replace(/\{\s*business_name\s*\}/gi, businessName);
}

/**
 * Older tenants stored the original stock message as though it were a custom
 * override. Recognize only that exact stock copy so they can receive improved
 * business-type defaults without overwriting genuinely owner-authored text.
 */
export function isLegacyDefaultConsentMessage(
  message: string | null | undefined,
  businessName: string,
): boolean {
  const candidate = message?.trim();
  if (!candidate) return false;

  return [LEGACY_DEFAULT_CONSENT_TEMPLATE, LEGACY_ASCII_CONSENT_TEMPLATE].some(
    (template) => candidate === template || candidate === renderBusinessName(template, businessName),
  );
}

/** Return only a true owner-authored override; blank and legacy defaults become null. */
export function getConsentMessageOverride(
  message: string | null | undefined,
  businessName: string,
): string | null {
  const candidate = message?.trim();
  if (!candidate || isLegacyDefaultConsentMessage(candidate, businessName)) return null;
  return candidate;
}
