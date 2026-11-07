import { FlowType } from '@ringback/shared-types';
import {
  findNewOutcomes,
  gradeCase,
  newGuardFired,
  tokenOverlap,
} from '../grader';
import type { RealTrafficCase, ReplayResult } from '../types';

const baseCase: RealTrafficCase = {
  id: 'case-1',
  tenantId: 't-1',
  tenantName: 'Test',
  callerPhone: '+12175550100',
  inboundMessage: 'hi',
  originalReply: 'Hi! What can I get you?',
  originalFlowType: FlowType.ORDER,
};

function okResult(over: Partial<NonNullable<ReplayResult['current']>>): ReplayResult {
  return {
    caseId: baseCase.id,
    ok: true,
    current: {
      reply: 'Hi! What can I get you?',
      flowType: FlowType.ORDER,
      flowStep: null,
      sideEffectTypes: [],
      decisions: [],
      ...over,
    },
  };
}

describe('tokenOverlap', () => {
  test('identical strings → 1', () => {
    expect(tokenOverlap('hello world', 'hello world')).toBe(1);
  });

  test('no overlap → 0', () => {
    expect(tokenOverlap('apple banana', 'kiwi mango')).toBe(0);
  });

  test('punctuation and case insensitive', () => {
    expect(tokenOverlap('Hello, World!', 'hello world')).toBe(1);
  });

  test('both empty → 1 (vacuous)', () => {
    expect(tokenOverlap('', '')).toBe(1);
  });

  test('one empty → 0', () => {
    expect(tokenOverlap('hello', '')).toBe(0);
  });
});

describe('findNewOutcomes', () => {
  test('outcomes the original did not have', () => {
    const newOutcomes = findNewOutcomes(
      [{ outcome: 'intent_order' }, { outcome: 'eta_rewritten' }],
      [{ outcome: 'intent_order' }],
    );
    expect(newOutcomes).toEqual(['eta_rewritten']);
  });

  test('deduplicates', () => {
    const newOutcomes = findNewOutcomes(
      [{ outcome: 'eta_rewritten' }, { outcome: 'eta_rewritten' }],
      [],
    );
    expect(newOutcomes).toEqual(['eta_rewritten']);
  });

  test('no original decisions → all are new', () => {
    expect(findNewOutcomes([{ outcome: 'a' }, { outcome: 'b' }], undefined)).toEqual(['a', 'b']);
  });
});

describe('newGuardFired', () => {
  test('eta_rewritten counts as a guard', () => {
    expect(newGuardFired(['eta_rewritten'])).toBe(true);
  });
  test('deflected_* counts', () => {
    expect(newGuardFired(['deflected_pii_change'])).toBe(true);
  });
  test('plain intent decisions do not count', () => {
    expect(newGuardFired(['intent_order'])).toBe(false);
  });
});

describe('gradeCase', () => {
  test('happy path — identical flow, identical reply → pass', () => {
    const g = gradeCase(baseCase, okResult({}));
    expect(g.pass).toBe(true);
  });

  test('flow type disagreement → fails flow_type_agreement', () => {
    const g = gradeCase(baseCase, okResult({ flowType: FlowType.FALLBACK }));
    expect(g.pass).toBe(false);
    const fd = g.dimensions.find((d) => d.name === 'flow_type_agreement');
    expect(fd?.passed).toBe(false);
    expect(fd?.detail).toContain('FALLBACK');
  });

  test('reply length outside ±50% → fails length parity', () => {
    const longReply = 'x'.repeat(200);
    const g = gradeCase(baseCase, okResult({ reply: longReply }));
    const fd = g.dimensions.find((d) => d.name === 'reply_length_parity');
    expect(fd?.passed).toBe(false);
  });

  test('reply token overlap below threshold → fails', () => {
    const g = gradeCase(
      baseCase,
      okResult({ reply: 'something completely unrelated text here please' }),
    );
    const fd = g.dimensions.find((d) => d.name === 'reply_token_overlap');
    expect(fd?.passed).toBe(false);
  });

  test('human label expectedFlowType respected', () => {
    const c: RealTrafficCase = {
      ...baseCase,
      humanLabel: { verdict: 'incorrect', expectedFlowType: FlowType.FALLBACK },
    };
    // Current engine routes to ORDER (matches originalFlowType), but human
    // says expected is FALLBACK — that dimension fails.
    const g = gradeCase(c, okResult({}));
    const fd = g.dimensions.find((d) => d.name === 'human_label_match');
    expect(fd?.passed).toBe(false);
  });

  test('new outcomes are recorded but do not fail the case', () => {
    const g = gradeCase(
      baseCase,
      okResult({
        decisions: [
          { outcome: 'intent_order' },
          { outcome: 'eta_rewritten' },
        ],
      }),
    );
    expect(g.newOutcomes).toContain('eta_rewritten');
    expect(g.newOutcomes).toContain('intent_order');
    // Doesn't fail the case — it's informational.
    expect(g.pass).toBe(true);
  });

  test('replay error → fails immediately', () => {
    const g = gradeCase(baseCase, {
      caseId: baseCase.id,
      ok: false,
      error: 'boom',
    });
    expect(g.pass).toBe(false);
    expect(g.dimensions[0].detail).toContain('boom');
  });
});
