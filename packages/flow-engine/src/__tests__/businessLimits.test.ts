import { formatBusinessLimits, getBusinessLimits } from '../businessLimits';
import type { TenantConfig } from '@ringback/shared-types';

const baseConfig = {
  businessLimits: null,
} as unknown as TenantConfig;

describe('business limits', () => {
  it('defaults refund and allergy safety on', () => {
    const limits = getBusinessLimits(baseConfig);
    expect(limits.noRefundsBySms).toBe(true);
    expect(limits.allergyRequiresHuman).toBe(true);
    expect(limits.noDelivery).toBe(false);
  });

  it('formats configured hard limits for prompts', () => {
    const block = formatBusinessLimits({
      ...baseConfig,
      businessLimits: {
        noDelivery: true,
        noSameDayCatering: true,
        notes: ['Do not quote catering prices without staff approval.'],
      },
    } as unknown as TenantConfig);

    expect(block).toContain('Business limits');
    expect(block).toContain('Do not offer delivery');
    expect(block).toContain('Do not offer same-day catering');
    expect(block).toContain('Do not quote catering prices');
  });
});
