import { detectIntent } from '../intentDetector';
import { TenantContext, ChatFn, ChatStructuredFn } from '../types';
import { FlowType } from '@ringback/shared-types';

// Minimal tenant context — only the fields detectIntent actually reads.
const tenant: TenantContext = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  tenantName: 'Test Restaurant',
  config: {
    websiteContext: null,
  } as any,
  flows: [
    { type: FlowType.ORDER, isEnabled: true } as any,
    { type: FlowType.MEETING, isEnabled: true } as any,
    { type: FlowType.FALLBACK, isEnabled: true } as any,
  ],
  menuItems: [],
} as any;

// An ambiguous message that bypasses the fast-keyword path and forces the
// LLM classifier branch.
const AMBIGUOUS = 'thinking about stopping by later';

describe('detectIntent — structured (P4)', () => {
  it('uses the structured fn when provided and returns the typed object', async () => {
    const stringFn: ChatFn = jest.fn().mockRejectedValue(new Error('should not be called'));
    const structuredFn: ChatStructuredFn = jest.fn().mockResolvedValue({
      intent: 'ORDER',
      confidence: 0.9,
      reason: 'wants to come in to buy food',
    });

    const result = await detectIntent(AMBIGUOUS, tenant, stringFn, undefined, structuredFn);

    expect(result.intent).toBe(FlowType.ORDER);
    expect(result.confidence).toBeCloseTo(0.9);
    expect(structuredFn).toHaveBeenCalledTimes(1);
    expect(stringFn).not.toHaveBeenCalled();
  });

  it('clamps out-of-range confidence from a misbehaving model', async () => {
    const stringFn: ChatFn = jest.fn();
    const structuredFn: ChatStructuredFn = jest.fn().mockResolvedValue({
      intent: 'ORDER',
      confidence: 1.7,
    });

    const result = await detectIntent(AMBIGUOUS, tenant, stringFn, undefined, structuredFn);

    expect(result.intent).toBe(FlowType.ORDER);
    expect(result.confidence).toBe(1);
  });

  it('falls back to the string parser when structured returns null', async () => {
    const stringFn: ChatFn = jest
      .fn()
      .mockResolvedValue('{"intent": "MEETING", "confidence": 0.8}');
    const structuredFn: ChatStructuredFn = jest.fn().mockResolvedValue(null);

    const result = await detectIntent(AMBIGUOUS, tenant, stringFn, undefined, structuredFn);

    expect(result.intent).toBe(FlowType.MEETING);
    expect(result.confidence).toBeCloseTo(0.8);
    expect(structuredFn).toHaveBeenCalledTimes(1);
    expect(stringFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a disabled intent and falls through to UNCLEAR', async () => {
    const stringFn: ChatFn = jest.fn();
    const structuredFn: ChatStructuredFn = jest
      .fn()
      // INQUIRY is not enabled on this tenant.
      .mockResolvedValue({ intent: 'INQUIRY', confidence: 0.95 });

    const result = await detectIntent(AMBIGUOUS, tenant, stringFn, undefined, structuredFn);

    expect(result.intent).toBe('UNCLEAR');
    expect(result.confidence).toBe(0);
  });

  it('without a structured fn, behaves exactly like before', async () => {
    // This is the regression guard: P4 must be additive only.
    const stringFn: ChatFn = jest
      .fn()
      .mockResolvedValue('{"intent": "ORDER", "confidence": 0.92}');

    const result = await detectIntent(AMBIGUOUS, tenant, stringFn);

    expect(result.intent).toBe(FlowType.ORDER);
    expect(result.confidence).toBeCloseTo(0.92);
    expect(stringFn).toHaveBeenCalledTimes(1);
  });
});
