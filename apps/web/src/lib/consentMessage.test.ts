import { BusinessType } from '@ringback/shared-types';
import {
  LEGACY_DEFAULT_CONSENT_TEMPLATE,
  getConsentMessageOverride,
  getDefaultConsentTemplate,
  getEditableConsentMessage,
  isLegacyDefaultConsentMessage,
} from './consentMessage';

describe('getDefaultConsentTemplate', () => {
  it.each([
    [BusinessType.RESTAURANT, 'place an order or answer questions'],
    [BusinessType.FOOD_TRUCK, 'place an order, find our location, or answer questions'],
    [BusinessType.SERVICE, 'schedule an appointment or answer questions'],
    [BusinessType.CONSULTANT, 'schedule a consultation or answer questions'],
    [BusinessType.MEDICAL, 'request an appointment or get office information'],
    [BusinessType.RETAIL, 'check product availability, place an order, or answer questions'],
    [BusinessType.OTHER, 'answer questions or help with your request'],
  ])('uses the correct capability for %s', (businessType, capability) => {
    const template = getDefaultConsentTemplate(businessType);

    expect(template).toContain(`I can help you ${capability} via text if you want.`);
    expect(template).toContain('Reply YES');
    expect(template).toContain('STOP to opt out');
    expect(template).toContain('Msg & data rates may apply.');
    expect(template).not.toContain('—');
  });

  it('falls back safely for an unknown business type', () => {
    expect(getDefaultConsentTemplate('UNKNOWN')).toContain(
      'answer questions or help with your request',
    );
  });
});

describe('legacy consent defaults', () => {
  const businessName = 'Example Co';
  const renderedLegacy =
    "Hey! Example Co here — we just missed your call and we're sorry about that! I can help you via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.";

  it('recognizes a previously stored stock message', () => {
    expect(isLegacyDefaultConsentMessage(renderedLegacy, businessName)).toBe(true);
    expect(getConsentMessageOverride(renderedLegacy, businessName)).toBeNull();
  });

  it('preserves owner-authored consent copy', () => {
    const custom = 'Custom consent copy with YES, STOP, and Msg & data rates may apply.';
    expect(isLegacyDefaultConsentMessage(custom, businessName)).toBe(false);
    expect(getConsentMessageOverride(custom, businessName)).toBe(custom);
  });
});

describe('getEditableConsentMessage', () => {
  const businessName = 'Angels Over Us';

  it('shows the effective industry default as an active value when no override exists', () => {
    expect(getEditableConsentMessage(null, businessName, BusinessType.MEDICAL)).toBe(
      "Hey! Angels Over Us here - we just missed your call and we're sorry about that! I can help you request an appointment or get office information via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.",
    );
  });

  it('upgrades legacy stock copy to the current industry default', () => {
    const legacy = LEGACY_DEFAULT_CONSENT_TEMPLATE.replace('{business_name}', businessName);

    expect(getEditableConsentMessage(legacy, businessName, BusinessType.SERVICE)).toContain(
      'schedule an appointment or answer questions',
    );
  });

  it('preserves an owner-authored message', () => {
    const custom = 'Custom consent copy with YES, STOP, and Msg & data rates may apply.';

    expect(getEditableConsentMessage(custom, businessName, BusinessType.MEDICAL)).toBe(custom);
  });
});
