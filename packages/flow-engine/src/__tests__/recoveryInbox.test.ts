import { deriveRecoveryDecision, type RecoverySignal } from '@ringback/shared-types';

const NOW = new Date('2026-08-03T18:00:00.000Z');

function signal(overrides: Partial<RecoverySignal> = {}): RecoverySignal {
  return {
    now: NOW,
    latestCallAt: new Date('2026-08-03T17:30:00.000Z'),
    latestConversationAt: null,
    latestOutcomeAt: null,
    openTaskCount: 0,
    highestTaskPriority: null,
    handoffStatus: null,
    conversationActive: false,
    smsSent: true,
    callerReplied: false,
    ownerResponded: false,
    voicemailIntent: null,
    voicemailDuration: null,
    voicemailTranscript: null,
    transcriptionStatus: null,
    orderStatus: null,
    paymentStatus: null,
    meetingStatus: null,
    ...overrides,
  };
}

describe('deriveRecoveryDecision', () => {
  it('resolves a paid order completed after the missed call', () => {
    const result = deriveRecoveryDecision(
      signal({
        latestOutcomeAt: new Date('2026-08-03T17:45:00.000Z'),
        orderStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      })
    );

    expect(result.state).toBe('RESOLVED');
    expect(result.reason).toContain('paid order');
  });

  it('does not let an older paid order hide a newer missed call', () => {
    const result = deriveRecoveryDecision(
      signal({
        latestOutcomeAt: new Date('2026-08-03T16:00:00.000Z'),
        orderStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
      })
    );

    expect(result.state).toBe('WAITING_CUSTOMER');
  });

  it('puts human handoffs and open tasks ahead of waiting states', () => {
    const result = deriveRecoveryDecision(
      signal({
        openTaskCount: 2,
        highestTaskPriority: 'URGENT',
        handoffStatus: 'HUMAN',
        conversationActive: true,
      })
    );

    expect(result.state).toBe('NEEDS_ATTENTION');
    expect(result.priority).toBe('URGENT');
  });

  it('keeps an unpaid order out of the resolved bucket', () => {
    const result = deriveRecoveryDecision(
      signal({
        orderStatus: 'CONFIRMED',
        paymentStatus: 'UNPAID',
      })
    );

    expect(result.state).toBe('WAITING_PAYMENT');
  });

  it('shows an active automated conversation as AI handling', () => {
    const result = deriveRecoveryDecision(
      signal({
        conversationActive: true,
        handoffStatus: 'AI',
        callerReplied: true,
      })
    );

    expect(result.state).toBe('AI_HANDLING');
  });

  it('closes a one-day-old three-second call with no usable message', () => {
    const result = deriveRecoveryDecision(
      signal({
        latestCallAt: new Date('2026-08-02T16:00:00.000Z'),
        voicemailDuration: 3,
        transcriptionStatus: 'failed',
      })
    );

    expect(result.state).toBe('RESOLVED');
    expect(result.reason).toContain('No usable voicemail');
  });

  it('keeps a recent automatic text visible without creating human work', () => {
    const result = deriveRecoveryDecision(signal());

    expect(result.state).toBe('WAITING_CUSTOMER');
    expect(result.priority).toBe('HIGH');
  });

  it('resolves voicemail classified as spam', () => {
    const result = deriveRecoveryDecision(signal({ voicemailIntent: 'SPAM' }));

    expect(result.state).toBe('RESOLVED');
  });
});
