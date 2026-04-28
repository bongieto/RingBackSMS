import { FlowType } from '@ringback/shared-types';
import { buildCatalogPromptContext, getVerticalProfile, matchSafetyPolicy } from '../verticals';

describe('vertical profiles', () => {
  test('infers HVAC from tenant name when business type is generic service', () => {
    const profile = getVerticalProfile({
      businessType: 'SERVICE',
      tenantName: "Bruno's HVAC Company",
    });

    expect(profile.key).toBe('hvac');
    expect(profile.defaultFlows).toContain(FlowType.MEETING);
  });

  test('matches home-service hazards with emergency disclaimer', () => {
    const match = matchSafetyPolicy({
      businessType: 'SERVICE',
      tenantName: "Bruno's HVAC Company",
      message: 'I smell gas from my furnace and there may be carbon monoxide.',
      callerPhone: '+15551234567',
    });

    expect(match?.policy.id).toBe('home_service_emergency');
    expect(match?.customerReply).toContain('911');
    expect(match?.customerReply).toContain("not an emergency service");
    expect(match?.taskPriority).toBe('URGENT');
  });

  test('matches medical emergency policy for home care tenants', () => {
    const match = matchSafetyPolicy({
      businessType: 'MEDICAL',
      industryTemplateKey: 'home_care',
      tenantName: 'Angels Over Us',
      message: 'My dad fell and cannot get up.',
    });

    expect(match?.policy.id).toBe('medical_emergency');
    expect(match?.customerReply).toContain('911');
  });

  test('renders service catalog metadata for AI prompts', () => {
    const context = buildCatalogPromptContext({
      catalogNoun: 'services',
      items: [
        {
          name: 'Emergency no-cooling visit',
          description: 'Same-day diagnostic for AC not cooling',
          price: 0,
          priceMin: 99,
          priceMax: 249,
          category: 'HVAC',
          isAvailable: true,
          duration: 60,
          requiresBooking: true,
          quoteRequired: true,
          emergencyEligible: true,
          serviceArea: 'within 25 miles',
          intakeQuestions: ['What type of system do you have?', 'What is the service address?'],
        },
      ],
    });

    expect(context).toContain('Emergency no-cooling visit');
    expect(context).toContain('$99.00-$249.00');
    expect(context).toContain('[quote required]');
    expect(context).toContain('[emergency eligible]');
    expect(context).toContain('within 25 miles');
    expect(context).toContain('What type of system do you have?');
  });
});
