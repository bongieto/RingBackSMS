import { BusinessType, FlowType } from '@ringback/shared-types';
import { extractVerticalIntake } from '../intake';
import type { TenantContext } from '../types';

function tenant(industryTemplateKey: string, businessType = BusinessType.SERVICE): TenantContext {
  return {
    tenantId: 'tenant_1',
    tenantName: 'Test Tenant',
    businessType,
    industryTemplateKey,
    config: {} as TenantContext['config'],
    flows: [],
    menuItems: [],
  };
}

describe('extractVerticalIntake', () => {
  it('captures HVAC issue, system type, urgency, address, and preferred time', () => {
    const intake = extractVerticalIntake({
      tenantContext: tenant('hvac'),
      inboundMessage: 'My central AC is not cooling at 123 Main St. Can someone come tomorrow morning?',
      flowType: FlowType.MEETING,
    });

    expect(intake?.verticalKey).toBe('hvac');
    expect(intake?.captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'system_type', value: expect.stringMatching(/central AC/i) }),
        expect.objectContaining({ key: 'address', value: expect.stringMatching(/123 Main St/i) }),
        expect.objectContaining({ key: 'preferred_time', value: expect.stringMatching(/tomorrow morning/i) }),
      ]),
    );
  });

  it('captures home-care relationship and care need', () => {
    const intake = extractVerticalIntake({
      tenantContext: tenant('home_care', BusinessType.MEDICAL),
      inboundMessage: 'I need a caregiver for my mom near Plano this week for bathing help.',
      flowType: FlowType.MEETING,
    });

    expect(intake?.verticalKey).toBe('home_care');
    expect(intake?.captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'relationship', value: expect.stringMatching(/my mom/i) }),
        expect.objectContaining({ key: 'care_need', value: expect.stringMatching(/caregiver|bathing help/i) }),
        expect.objectContaining({ key: 'start_date', value: expect.stringMatching(/this week/i) }),
      ]),
    );
  });

  it('captures auto-shop vehicle and tow need', () => {
    const intake = extractVerticalIntake({
      tenantContext: tenant('auto_shop'),
      inboundMessage: 'My 2018 Honda Civic brakes are squealing and I need a tow.',
      flowType: FlowType.MEETING,
    });

    expect(intake?.verticalKey).toBe('auto_shop');
    expect(intake?.captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'vehicle', value: expect.stringMatching(/2018 Honda Civic/i) }),
        expect.objectContaining({ key: 'tow_needed', value: 'yes' }),
      ]),
    );
  });
});
