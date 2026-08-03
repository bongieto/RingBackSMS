import { BusinessType, FlowType } from '@ringback/shared-types';
import { AUTOPILOT_VERSION, buildAutopilotPlan } from '../autopilot';

describe('buildAutopilotPlan', () => {
  test('configures HVAC service intake with only owner-unknown facts remaining', () => {
    const plan = buildAutopilotPlan({
      businessType: BusinessType.SERVICE,
      industryTemplateKey: 'hvac',
      tenantName: 'Comfort Pros',
      configuredFlowTypes: [FlowType.FALLBACK],
      verifiedKnowledgeKeys: ['policy.service_area'],
      catalogItemCount: 4,
      hasBusinessAddress: true,
      hasWebsite: true,
      hasBookingCalendar: true,
    });

    expect(plan.verticalKey).toBe('hvac');
    expect(plan.flowsToEnable).toEqual([FlowType.MEETING]);
    expect(plan.ownerQuestions.map((item) => item.key)).toEqual([
      'policy.estimates',
      'policy.urgent_availability',
    ]);
    expect(plan.setupWarnings).toEqual([]);
  });

  test('is idempotent once the current version and flows are applied', () => {
    const plan = buildAutopilotPlan({
      businessType: BusinessType.RETAIL,
      industryTemplateKey: 'retail',
      configuredFlowTypes: [FlowType.INQUIRY, FlowType.ORDER, FlowType.FALLBACK],
      verifiedKnowledgeKeys: ['policy.returns_holds', 'policy.shipping'],
      catalogItemCount: 10,
      hasBusinessAddress: true,
      hasWebsite: true,
      previousVersion: AUTOPILOT_VERSION,
    });

    expect(plan.needsApply).toBe(false);
    expect(plan.flowsToEnable).toEqual([]);
    expect(plan.ownerQuestions).toEqual([]);
    expect(plan.completionRate).toBe(1);
  });

  test('warns when a retail agent has no products', () => {
    const plan = buildAutopilotPlan({
      businessType: BusinessType.RETAIL,
      configuredFlowTypes: [],
      catalogItemCount: 0,
      hasBusinessAddress: false,
      hasWebsite: false,
    });

    expect(plan.setupWarnings.join(' ')).toMatch(/product/i);
    expect(plan.setupWarnings.join(' ')).toMatch(/address/i);
    expect(plan.enabledFlows).toEqual([FlowType.INQUIRY, FlowType.ORDER, FlowType.FALLBACK]);
  });

  test('keeps imported website content pending until the owner verifies it', () => {
    const plan = buildAutopilotPlan({
      businessType: BusinessType.SERVICE,
      hasWebsite: true,
      unverifiedKnowledgeKeys: ['website.summary'],
    });

    expect(plan.setupWarnings.join(' ')).toMatch(/review the imported website summary/i);
  });

  test.each([
    'restaurant',
    'food_truck',
    'home_services',
    'hvac',
    'plumbing',
    'electrical',
    'medical',
    'home_care',
    'hospice',
    'salon',
    'auto_shop',
    'retail',
    'consultant',
    'generic_service',
    'other',
  ])('provides safe Autopilot defaults for %s', (industryTemplateKey) => {
    const plan = buildAutopilotPlan({ industryTemplateKey });

    expect(plan.enabledFlows).toContain(FlowType.FALLBACK);
    expect(plan.automaticCapabilities.length).toBeGreaterThanOrEqual(4);
    expect(plan.ownerQuestions.length).toBeGreaterThanOrEqual(2);
    expect(plan.ownerQuestions.length).toBeLessThanOrEqual(3);
  });
});
