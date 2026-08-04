import { formatBusinessLimits, getBusinessLimits } from '../businessLimits';
import {
  BusinessType,
  getBusinessLimitDefinitions,
  type TenantConfig,
} from '@ringback/shared-types';

const baseConfig = {
  businessLimits: null,
} as unknown as TenantConfig;

describe('business limits', () => {
  it.each(Object.values(BusinessType))('defines a tailored profile for %s', (businessType) => {
    const definitions = getBusinessLimitDefinitions(businessType);

    expect(definitions).toHaveLength(6);
    expect(new Set(definitions.map((definition) => definition.key)).size).toBe(6);
    expect(definitions.every((definition) => definition.label && definition.promptRule)).toBe(true);
  });

  it('defaults refund and allergy safety on', () => {
    const limits = getBusinessLimits(baseConfig, BusinessType.RESTAURANT);
    expect(limits.noRefundsBySms).toBe(true);
    expect(limits.allergyRequiresHuman).toBe(true);
    expect(limits.noDelivery).toBe(false);
  });

  it('formats configured hard limits for prompts', () => {
    const block = formatBusinessLimits(
      {
        ...baseConfig,
        businessLimits: {
          noDelivery: true,
          noSameDayCatering: true,
          notes: ['Do not quote catering prices without staff approval.'],
        },
      } as unknown as TenantConfig,
      BusinessType.RESTAURANT,
    );

    expect(block).toContain('Business limits');
    expect(block).toContain('Do not offer delivery');
    expect(block).toContain('Do not offer same-day catering');
    expect(block).toContain('Do not quote catering prices');
  });

  it('uses caregiver safeguards for medical businesses without restaurant rules', () => {
    const block = formatBusinessLimits(baseConfig, BusinessType.MEDICAL);

    expect(block).toContain('Do not provide medical advice');
    expect(block).toContain('call 911 now');
    expect(block).toContain('Do not promise caregiver');
    expect(block).toContain('Do not confirm insurance coverage');
    expect(block).not.toContain('delivery');
    expect(block).not.toContain('catering');
    expect(block).not.toContain('pickup');
  });
});
