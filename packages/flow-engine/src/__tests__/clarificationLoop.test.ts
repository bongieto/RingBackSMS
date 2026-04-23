import {
  advanceClarification,
  MAX_CLARIFICATION_ATTEMPTS,
  ESCALATION_SMS_REPLY,
} from '../ai/clarificationLoop';

describe('advanceClarification', () => {
  it('starts a fresh count of 1 when there is no prior clarification', () => {
    const result = advanceClarification(null, {
      field: 'pickup_time',
      question: 'What time?',
    });
    expect(result.attemptCount).toBe(1);
    expect(result.exceeded).toBe(false);
    expect(result.clarification.field).toBe('pickup_time');
    expect(result.clarification.attemptCount).toBe(1);
  });

  it('resets the count when the field changes', () => {
    const prev = {
      field: 'pickup_time',
      question: 'What time?',
      askedAt: 0,
      attemptCount: 3,
    };
    const result = advanceClarification(prev, {
      field: 'modifier_size',
      question: 'Small or large?',
    });
    expect(result.attemptCount).toBe(1);
    expect(result.exceeded).toBe(false);
    expect(result.clarification.field).toBe('modifier_size');
  });

  it('bumps the count when the same field is re-asked', () => {
    const prev = {
      field: 'pickup_time',
      question: 'What time?',
      askedAt: 0,
      attemptCount: 1,
    };
    const result = advanceClarification(prev, {
      field: 'pickup_time',
      question: 'What time would you like to pick up?',
    });
    expect(result.attemptCount).toBe(2);
    expect(result.exceeded).toBe(false);
  });

  it('treats missing attemptCount as 1 (back-compat with old state rows)', () => {
    // State rows stored before this module existed won't have an
    // attemptCount — they should start the counter at "this is the
    // second time we've asked" (1 from storage + 1 for the new ask).
    const prev = {
      field: 'pickup_time',
      question: 'What time?',
      askedAt: 0,
    };
    const result = advanceClarification(prev, {
      field: 'pickup_time',
      question: 'What time works?',
    });
    expect(result.attemptCount).toBe(2);
  });

  it(`trips "exceeded" once attemptCount passes MAX_CLARIFICATION_ATTEMPTS (${MAX_CLARIFICATION_ATTEMPTS})`, () => {
    let prev = null as null | ReturnType<typeof advanceClarification>['clarification'];
    const results: boolean[] = [];
    // Simulate 5 consecutive asks of the same field.
    for (let i = 0; i < 5; i++) {
      const r = advanceClarification(prev, {
        field: 'pickup_time',
        question: 'What time?',
      });
      results.push(r.exceeded);
      prev = r.clarification;
    }
    // Attempts 1, 2, 3 are within cap; 4+ trip the guard.
    expect(results).toEqual([false, false, false, true, true]);
  });

  it('does NOT trip exceeded when a different field is asked after hitting cap', () => {
    const prev = {
      field: 'pickup_time',
      question: 'What time?',
      askedAt: 0,
      attemptCount: MAX_CLARIFICATION_ATTEMPTS,
    };
    const result = advanceClarification(prev, {
      field: 'modifier_size',
      question: 'Small or large?',
    });
    expect(result.attemptCount).toBe(1);
    expect(result.exceeded).toBe(false);
  });

  it('uses provided `now` for askedAt', () => {
    const now = 1700000000000;
    const result = advanceClarification(null, { field: 'x', question: 'y' }, now);
    expect(result.clarification.askedAt).toBe(now);
  });

  it('exports a canonical escalation reply message', () => {
    expect(ESCALATION_SMS_REPLY).toMatch(/team member/);
    expect(ESCALATION_SMS_REPLY).toMatch(/follow up/i);
  });
});
