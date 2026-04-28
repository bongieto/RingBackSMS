import { FlowType } from '@ringback/shared-types';
import {
  buildCatalogPromptContext,
  getVerticalProfile,
  matchEscalationPolicy,
  matchSafetyPolicy,
  resolveIntakeFields,
  resolveEscalationPolicies,
  VERTICAL_PROFILES,
  type VerticalKey,
} from '../verticals';

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

  test('matches structured HVAC urgent-service escalation policy', () => {
    const match = matchEscalationPolicy({
      businessType: 'SERVICE',
      industryTemplateKey: 'home_services',
      tenantName: "Bruno's HVAC Company",
      message: 'This is urgent and I need service right now.',
      callerPhone: '+15551234567',
    });

    expect(match?.policy.id).toBe('urgent_service');
    expect(match?.severity).toBe('HIGH');
    expect(match?.taskPriority).toBe('HIGH');
    expect(match?.stopAutomation).toBe(true);
    expect(match?.customerReply).toContain('team member');
  });

  test('applies tenant escalation override as a notify-only rule', () => {
    const policies = resolveEscalationPolicies({
      businessType: 'MEDICAL',
      industryTemplateKey: 'home_care',
      tenantName: 'Angels Over Us',
      policyOverrides: {
        rules: [
          {
            id: 'care_start_change',
            label: 'Care start-date change',
            severity: 'NORMAL',
            keywords: ['change start date'],
            customerReply: 'I can keep helping while the office reviews that.',
            ownerSubject: 'Care start-date change requested',
            taskPriority: 'NORMAL',
            stopAutomation: false,
          },
        ],
      },
    });

    expect(policies.some((policy) => policy.id === 'care_start_change')).toBe(true);

    const match = matchEscalationPolicy({
      businessType: 'MEDICAL',
      industryTemplateKey: 'home_care',
      tenantName: 'Angels Over Us',
      message: 'Can I change start date for my mom?',
      policyOverrides: {
        rules: [
          {
            id: 'care_start_change',
            label: 'Care start-date change',
            severity: 'NORMAL',
            keywords: ['change start date'],
            ownerSubject: 'Care start-date change requested',
            taskPriority: 'NORMAL',
            stopAutomation: false,
          },
        ],
      },
    });

    expect(match?.policy.id).toBe('care_start_change');
    expect(match?.ownerSubject).toBe('Care start-date change requested');
    expect(match?.stopAutomation).toBe(false);
    expect(match?.taskPriority).toBe('NORMAL');
  });

  test('applies tenant intake field overrides without losing industry defaults', () => {
    const fields = resolveIntakeFields({
      businessType: 'SERVICE',
      industryTemplateKey: 'hvac',
      intakeFieldOverrides: {
        fields: [
          { key: 'system_type', label: 'Equipment type', examples: ['mini split'], requiredFor: ['booking'] },
          { key: 'budget', label: 'Budget range', examples: ['$500-$1000'], requiredFor: ['quote'] },
          { key: 'preferred_time', enabled: false },
        ],
      },
    });

    expect(fields.find((field) => field.key === 'issue')).toBeTruthy();
    expect(fields.find((field) => field.key === 'preferred_time')).toBeFalsy();
    expect(fields.find((field) => field.key === 'system_type')?.label).toBe('Equipment type');
    expect(fields.find((field) => field.key === 'budget')?.requiredFor).toEqual(['quote']);
  });

  test('major industry profiles include comprehensive readiness packs', () => {
    const majorVerticals: VerticalKey[] = [
      'restaurant',
      'food_truck',
      'home_services',
      'hvac',
      'medical',
      'home_care',
      'salon',
      'auto_shop',
      'retail',
    ];

    for (const key of majorVerticals) {
      expect(VERTICAL_PROFILES[key].readinessScenarios).toHaveLength(9);
    }
  });
});
