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

  it('captures restaurant catering intake without replacing order flow', () => {
    const intake = extractVerticalIntake({
      tenantContext: tenant('restaurant', BusinessType.RESTAURANT),
      inboundMessage: 'I need catering for 25 guests Saturday at 2 PM. This is Maria, call me at 555-123-4567.',
      flowType: FlowType.FALLBACK,
    });

    expect(intake?.verticalKey).toBe('restaurant');
    expect(intake?.captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'order_type', value: 'catering' }),
        expect.objectContaining({ key: 'party_size', value: expect.stringMatching(/25 guests/i) }),
        expect.objectContaining({ key: 'event_date_time', value: expect.stringMatching(/Saturday/i) }),
        expect.objectContaining({ key: 'customer_name', value: expect.stringMatching(/Maria/i) }),
        expect.objectContaining({ key: 'phone_confirmation', value: expect.stringMatching(/555-123-4567/) }),
      ]),
    );
  });

  it('captures restaurant pickup and allergy notes', () => {
    const intake = extractVerticalIntake({
      tenantContext: tenant('restaurant', BusinessType.RESTAURANT),
      inboundMessage: 'Pickup order today at 6 PM for Jordan. Peanut allergy, please no peanuts.',
      flowType: FlowType.ORDER,
    });

    expect(intake?.captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'order_type', value: 'pickup' }),
        expect.objectContaining({ key: 'preferred_pickup_time', value: expect.stringMatching(/today/i) }),
        expect.objectContaining({ key: 'allergy_notes', value: expect.stringMatching(/peanut/i) }),
        expect.objectContaining({ key: 'customer_name', value: expect.stringMatching(/Jordan/i) }),
      ]),
    );
  });

  it('captures common custom service fields when they are configured', () => {
    const ctx = tenant('hvac');
    ctx.config = {
      intakeFieldOverrides: [
        { key: 'gate_code', label: 'Gate code', requiredFor: ['booking'], examples: ['Gate code is 4451'] },
        { key: 'pets_on_site', label: 'Pets on site', requiredFor: ['booking'], examples: ['two dogs inside'] },
        { key: 'parking_instructions', label: 'Parking instructions', requiredFor: ['booking'], examples: ['park in driveway'] },
        { key: 'equipment_serial_number', label: 'Equipment serial number', requiredFor: ['quote'], examples: ['model ABC123'] },
      ],
    } as TenantContext['config'];

    const intake = extractVerticalIntake({
      tenantContext: ctx,
      inboundMessage: 'AC is out at 123 Main St. Gate code is 4451, two dogs inside, park in the driveway. Model ABC123.',
      flowType: FlowType.MEETING,
    });

    expect(intake?.captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'gate_code', value: '4451' }),
        expect.objectContaining({ key: 'pets_on_site', value: expect.stringMatching(/dogs/i) }),
        expect.objectContaining({ key: 'parking_instructions', value: expect.stringMatching(/park in the driveway/i) }),
        expect.objectContaining({ key: 'equipment_serial_number', value: 'ABC123' }),
      ]),
    );
  });
});
