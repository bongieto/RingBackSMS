import { FlowType } from '@ringback/shared-types';
import { runVerticalReadinessSuite } from '../readiness';
import type { TenantContext } from '../types';

const hvacTenant: TenantContext = {
  tenantId: '00000000-0000-0000-0000-00000000a001',
  tenantName: "Bruno's HVAC Company",
  businessType: 'SERVICE',
  industryTemplateKey: 'hvac',
  config: {
    id: 'cfg',
    tenantId: '00000000-0000-0000-0000-00000000a001',
    greeting: '',
    voiceGreeting: null,
    voiceType: 'nova',
    timezone: 'America/Chicago',
    businessHoursStart: '08:00',
    businessHoursEnd: '18:00',
    businessDays: [1, 2, 3, 4, 5],
    businessSchedule: null,
    closedDates: [],
    aiPersonality: null,
    calcomLink: null,
    slackWebhook: null,
    ownerEmail: null,
    ownerPhone: null,
    businessAddress: null,
    websiteUrl: null,
    websiteContext: 'HVAC repair, heating, cooling, furnace and AC service.',
    squareSyncEnabled: false,
    squareAutoSync: false,
    posSyncEnabled: false,
    posAutoSync: false,
    requirePayment: false,
    ordersAcceptingEnabled: false,
    aiOrderAgentEnabled: false,
    acceptClosedHourOrders: true,
    minutesPerQueuedOrder: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any,
  flows: [
    { id: 'f1', tenantId: '00000000-0000-0000-0000-00000000a001', type: FlowType.MEETING, isEnabled: true, config: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 'f2', tenantId: '00000000-0000-0000-0000-00000000a001', type: FlowType.FALLBACK, isEnabled: true, config: null, createdAt: new Date(), updatedAt: new Date() },
  ],
  menuItems: [],
  hoursInfo: {
    openNow: true,
    nextOpenDisplay: null,
    todayHoursDisplay: '8:00 AM - 6:00 PM',
    weeklyHoursDisplay: 'Mon-Fri 8:00 AM - 6:00 PM',
    minutesUntilClose: 240,
    closesAtDisplay: '6:00 PM',
    closingSoon: false,
  },
};

describe('vertical readiness suite', () => {
  test('runs HVAC readiness pack and catches emergency policy before booking', async () => {
    const result = await runVerticalReadinessSuite({ tenantContext: hvacTenant });

    expect(result.verticalKey).toBe('hvac');
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.score).toBe(1);
    const hazard = result.results.find((r) => r.id === 'hvac-gas');
    expect(hazard?.reply).toContain('911');
    expect(hazard?.flowType).toBe(FlowType.FALLBACK);
  });
});
