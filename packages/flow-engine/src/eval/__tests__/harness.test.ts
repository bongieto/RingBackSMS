import { FlowType } from '@ringback/shared-types';
import { replayCase, buildTenantContextFromCase } from '../harness';
import type { RealTrafficCase } from '../types';

describe('buildTenantContextFromCase', () => {
  test('uses provided enabledFlowTypes', () => {
    const ctx = buildTenantContextFromCase({
      id: 'a',
      tenantId: 't-1',
      tenantName: 'X',
      callerPhone: '+1',
      inboundMessage: 'hi',
      originalReply: 'r',
      enabledFlowTypes: [FlowType.ORDER, FlowType.MEETING],
    });
    expect(ctx.flows.map((f) => f.type)).toEqual([FlowType.ORDER, FlowType.MEETING]);
  });

  test('defaults to ORDER + FALLBACK when none provided', () => {
    const ctx = buildTenantContextFromCase({
      id: 'a',
      tenantId: 't-1',
      tenantName: 'X',
      callerPhone: '+1',
      inboundMessage: 'hi',
      originalReply: 'r',
    });
    expect(ctx.flows.map((f) => f.type)).toEqual([FlowType.ORDER, FlowType.FALLBACK]);
  });

  test('passes unknown config fields through', () => {
    const ctx = buildTenantContextFromCase({
      id: 'a',
      tenantId: 't-1',
      tenantName: 'X',
      callerPhone: '+1',
      inboundMessage: 'hi',
      originalReply: 'r',
      tenantConfigSnapshot: { customField: 42 },
    });
    expect((ctx.config as { customField?: number }).customField).toBe(42);
  });
});

describe('replayCase', () => {
  test('returns a current.flowType for a simple ORDER greeting', async () => {
    const c: RealTrafficCase = {
      id: 'case-greet',
      tenantId: 't-1',
      tenantName: 'Lumpia House',
      callerPhone: '+12175550100',
      inboundMessage: 'hi',
      originalReply: 'Hi there!',
      enabledFlowTypes: [FlowType.ORDER, FlowType.FALLBACK],
      hoursInfoSnapshot: { openNow: true, todayHoursDisplay: '11-8' },
    };
    const r = await replayCase(c);
    expect(r.ok).toBe(true);
    // Bare "hi" while open should route to ORDER.
    expect(r.current?.flowType).toBe(FlowType.ORDER);
  });

  test('refund deflection fires the ungrounded guard', async () => {
    const c: RealTrafficCase = {
      id: 'case-refund',
      tenantId: 't-1',
      tenantName: 'Lumpia House',
      callerPhone: '+12175550100',
      inboundMessage: 'refund please',
      originalReply: 'Refund processed!',
      enabledFlowTypes: [FlowType.ORDER, FlowType.FALLBACK],
      hoursInfoSnapshot: { openNow: true, todayHoursDisplay: '11-8' },
    };
    const r = await replayCase(c);
    expect(r.ok).toBe(true);
    expect(r.current?.flowType).toBe(FlowType.FALLBACK);
    // The refund guard emits this decision.
    const outcomes = r.current?.decisions.map((d) => d.outcome) ?? [];
    expect(outcomes).toContain('deflected_refund_request');
  });

  test('strict mode replays the recorded reply through fallback flow', async () => {
    const c: RealTrafficCase = {
      id: 'case-strict',
      tenantId: 't-1',
      tenantName: 'Lumpia House',
      callerPhone: '+12175550100',
      inboundMessage: 'do you guys have wifi?',
      originalReply: "Yes — password is on the receipt!",
      enabledFlowTypes: [FlowType.FALLBACK],
      hoursInfoSnapshot: { openNow: true, todayHoursDisplay: '11-8' },
    };
    const r = await replayCase(c, { mode: 'strict' });
    expect(r.ok).toBe(true);
    expect(r.current?.flowType).toBe(FlowType.FALLBACK);
    // Strict mode preserved the recorded reply through the engine.
    expect(r.current?.reply).toContain('password');
  });

  test('mock mode returns the canned ack on a fallback-route message', async () => {
    const c: RealTrafficCase = {
      id: 'case-mock',
      tenantId: 't-1',
      tenantName: 'Lumpia House',
      callerPhone: '+12175550100',
      // Use a message that doesn't hit one of the engine's deterministic
      // short-circuits (hours, callback, location, etc.), so we actually
      // reach the chatFn stub. "Do you have wifi" is open-ended fallback.
      inboundMessage: 'do you guys have wifi?',
      originalReply: 'Yes — password is on the receipt!',
      enabledFlowTypes: [FlowType.FALLBACK],
      hoursInfoSnapshot: { openNow: true, todayHoursDisplay: '11-8' },
    };
    const r = await replayCase(c, { mode: 'mock' });
    expect(r.ok).toBe(true);
    // Mock mode's chatFn returns 'OK!' as the fallback ack.
    expect(r.current?.reply).toBe('OK!');
  });
});
