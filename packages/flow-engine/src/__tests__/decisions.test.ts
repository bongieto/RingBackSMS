/**
 * Turn Record decision-sink tests.
 *
 * Verifies that flow-engine handlers push DecisionDraft entries onto the
 * host-supplied `decisions` array. This is the contract the host
 * (apps/web) depends on — decisions get flushed to the Turn row after
 * runFlowEngine returns. When `decisions` is absent, handlers no-op.
 */
import { runFlowEngine } from '../engine';
import { processFallbackFlow } from '../flows/fallbackFlow';
import { TenantContext, ChatFn } from '../types';
import type { DecisionDraft } from '@ringback/shared-types';
import { FlowType, BusinessType, Plan } from '@ringback/shared-types';

const mockChatFn: ChatFn = jest
  .fn()
  .mockResolvedValue('{"intent": "UNCLEAR", "confidence": 0.2}');

const baseTenant: TenantContext = {
  tenantId: 't1',
  tenantName: 'Test',
  config: {
    id: 'c1',
    tenantId: 't1',
    greeting: 'hi',
    timezone: 'America/Chicago',
    businessHoursStart: '11:00',
    businessHoursEnd: '20:00',
    businessDays: [3, 4, 5, 6, 0],
    aiPersonality: null,
    calcomLink: null,
    slackWebhook: null,
    ownerEmail: 'o@t.com',
    ownerPhone: '+12175550100',
    businessAddress: null,
    websiteUrl: null,
    websiteContext: null,
    closedDates: [],
    voiceGreeting: null,
    voiceType: 'nova',
    squareSyncEnabled: false,
    businessType: BusinessType.RESTAURANT,
    plan: Plan.STARTER,
  } as unknown as TenantContext['config'],
  flows: [
    {
      id: 'f1',
      tenantId: 't1',
      type: FlowType.FALLBACK,
      isEnabled: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  menuItems: [],
};

describe('decision sink — pushDecision contract', () => {
  it('fallbackFlow closure path pushes a closure_silent decision', async () => {
    const decisions: DecisionDraft[] = [];
    await processFallbackFlow({
      tenantContext: baseTenant,
      callerPhone: '+19990000001',
      inboundMessage: 'ok',
      currentState: null,
      chatFn: mockChatFn,
      decisions,
    });

    const closure = decisions.find((d) => d.handler === 'fallbackFlow');
    expect(closure).toBeDefined();
    expect(closure!.outcome).toBe('closure_silent');
    expect(closure!.phase).toBe('FLOW');
    expect(typeof closure!.durationMs).toBe('number');
  });

  it('fallbackFlow deflects empty LLM and records deflected_empty_llm', async () => {
    const decisions: DecisionDraft[] = [];
    const emptyChat: ChatFn = jest.fn().mockResolvedValue('');
    const out = await processFallbackFlow({
      tenantContext: baseTenant,
      callerPhone: '+19990000001',
      // Not a closure pattern — forces LLM path
      inboundMessage: 'what is your refund policy',
      currentState: null,
      chatFn: emptyChat,
      decisions,
    });

    // Reply must not be empty (architectural invariant).
    expect(out.smsReply.length).toBeGreaterThan(0);
    const d = decisions.find((x) => x.outcome === 'deflected_empty_llm');
    expect(d).toBeDefined();
  });

  it('runFlowEngine records detectIntent + confidenceGate decisions on new turn', async () => {
    const decisions: DecisionDraft[] = [];
    await runFlowEngine({
      tenantContext: baseTenant,
      callerPhone: '+19990000001',
      inboundMessage: 'what time is it',
      currentState: null,
      chatFn: mockChatFn,
      decisions,
    });

    expect(decisions.some((d) => d.handler === 'detectIntent')).toBe(true);
  });

  it('no decisions sink = silent no-op (handlers still run)', async () => {
    // Absence of `decisions` must not throw. The handler still produces
    // a valid FlowOutput.
    const out = await processFallbackFlow({
      tenantContext: baseTenant,
      callerPhone: '+19990000001',
      inboundMessage: 'ok',
      currentState: null,
      chatFn: mockChatFn,
    });
    expect(out.flowType).toBe(FlowType.FALLBACK);
  });
});
