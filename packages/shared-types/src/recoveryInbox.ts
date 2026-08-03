export type RecoveryState =
  | 'NEEDS_ATTENTION'
  | 'AI_HANDLING'
  | 'WAITING_PAYMENT'
  | 'WAITING_CUSTOMER'
  | 'SNOOZED'
  | 'RESOLVED';

export type RecoveryPriority = 'URGENT' | 'HIGH' | 'NORMAL';

export interface RecoverySignal {
  now: Date;
  latestCallAt: Date | null;
  latestConversationAt: Date | null;
  latestOutcomeAt: Date | null;
  openTaskCount: number;
  highestTaskPriority: RecoveryPriority | null;
  handoffStatus: string | null;
  conversationActive: boolean;
  smsSent: boolean;
  callerReplied: boolean;
  ownerResponded: boolean;
  voicemailIntent: string | null;
  voicemailDuration: number | null;
  voicemailTranscript: string | null;
  transcriptionStatus: string | null;
  orderStatus: string | null;
  paymentStatus: string | null;
  meetingStatus: string | null;
}

export interface RecoveryDecision {
  state: RecoveryState;
  priority: RecoveryPriority;
  nextAction: string;
  reason: string;
}

export interface RecoveryDispositionSignal {
  status: 'ACTIVE' | 'SNOOZED' | 'RESOLVED';
  resolutionReason: string | null;
  snoozedUntil: Date | null;
  lastHandledActivityAt: Date | null;
}

export function applyRecoveryDisposition(
  baseDecision: RecoveryDecision,
  disposition: RecoveryDispositionSignal | null,
  latestActivityAt: Date,
  now: Date
): { decision: RecoveryDecision; shouldAutoReopen: boolean } {
  if (!disposition || disposition.status === 'ACTIVE') {
    return { decision: baseDecision, shouldAutoReopen: false };
  }

  const hasNewActivity = Boolean(
    disposition.lastHandledActivityAt && latestActivityAt > disposition.lastHandledActivityAt
  );
  const snoozeExpired = Boolean(
    disposition.status === 'SNOOZED' && disposition.snoozedUntil && disposition.snoozedUntil <= now
  );

  if (hasNewActivity || snoozeExpired) {
    return { decision: baseDecision, shouldAutoReopen: true };
  }

  if (disposition.status === 'RESOLVED') {
    return {
      decision: {
        state: 'RESOLVED',
        priority: 'NORMAL',
        nextAction: 'Marked done — no current follow-up required',
        reason: disposition.resolutionReason
          ? disposition.resolutionReason.toLowerCase().replaceAll('_', ' ')
          : 'Manually resolved',
      },
      shouldAutoReopen: false,
    };
  }

  return {
    decision: {
      state: 'SNOOZED',
      priority: 'NORMAL',
      nextAction: 'Snoozed — returns to Active automatically',
      reason: 'Temporarily removed from the active queue',
    },
    shouldAutoReopen: false,
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isAfterLatestCall(outcomeAt: Date | null, latestCallAt: Date | null): boolean {
  if (!outcomeAt) return false;
  if (!latestCallAt) return true;
  return outcomeAt.getTime() >= latestCallAt.getTime();
}

/**
 * Convert the existing caller activity into one operator-facing recovery state.
 * The decision is deliberately deterministic: AI can enrich summaries, but it
 * does not decide whether a caller disappears from the owner's work queue.
 */
export function deriveRecoveryDecision(signal: RecoverySignal): RecoveryDecision {
  const callAgeMs = signal.latestCallAt
    ? Math.max(0, signal.now.getTime() - signal.latestCallAt.getTime())
    : Number.POSITIVE_INFINITY;
  const paidOrder = signal.paymentStatus === 'PAID' && signal.orderStatus !== 'CANCELLED';
  const completedMeeting =
    signal.meetingStatus === 'CONFIRMED' || signal.meetingStatus === 'COMPLETED';
  const outcomeAfterCall = isAfterLatestCall(signal.latestOutcomeAt, signal.latestCallAt);

  if ((paidOrder || completedMeeting) && outcomeAfterCall && signal.openTaskCount === 0) {
    return {
      state: 'RESOLVED',
      priority: 'NORMAL',
      nextAction: paidOrder
        ? 'Paid order captured — no follow-up needed'
        : 'Booking confirmed — no follow-up needed',
      reason: paidOrder ? 'Recovered as a paid order' : 'Recovered as a confirmed booking',
    };
  }

  if (signal.openTaskCount > 0 || signal.handoffStatus === 'HUMAN') {
    const priority =
      signal.highestTaskPriority ?? (signal.voicemailIntent === 'COMPLAINT' ? 'URGENT' : 'HIGH');
    return {
      state: 'NEEDS_ATTENTION',
      priority,
      nextAction:
        signal.voicemailIntent === 'COMPLAINT'
          ? 'Review the complaint and contact the caller'
          : 'Review and respond to this caller',
      reason:
        signal.openTaskCount > 0
          ? `${signal.openTaskCount} open action item${signal.openTaskCount === 1 ? '' : 's'}`
          : 'Conversation is assigned to a person',
    };
  }

  if (signal.orderStatus && signal.orderStatus !== 'CANCELLED' && signal.paymentStatus !== 'PAID') {
    return {
      state: 'WAITING_PAYMENT',
      priority: 'NORMAL',
      nextAction: 'Waiting for payment before the order is confirmed',
      reason: 'An unpaid order is in progress',
    };
  }

  if (signal.conversationActive && signal.handoffStatus === 'AI') {
    return {
      state: 'AI_HANDLING',
      priority: 'NORMAL',
      nextAction: 'AI is handling the conversation',
      reason: signal.callerReplied
        ? 'Caller replied to the missed-call text'
        : 'Active automated conversation',
    };
  }

  const tooShortForMessage =
    signal.voicemailDuration !== null &&
    signal.voicemailDuration <= 3 &&
    !signal.voicemailTranscript;
  const transcriptionStalled =
    signal.transcriptionStatus === 'pending' && callAgeMs > 10 * 60 * 1000;

  if (signal.voicemailIntent === 'SPAM') {
    return {
      state: 'RESOLVED',
      priority: 'NORMAL',
      nextAction: 'No action — identified as spam',
      reason: 'Spam voicemail',
    };
  }

  if (tooShortForMessage && callAgeMs > DAY_MS) {
    return {
      state: 'RESOLVED',
      priority: 'NORMAL',
      nextAction: 'No action unless the caller contacts you again',
      reason: 'No usable voicemail and no reply after 24 hours',
    };
  }

  if (signal.smsSent && callAgeMs <= 3 * DAY_MS) {
    return {
      state: 'WAITING_CUSTOMER',
      priority: callAgeMs <= HOUR_MS ? 'HIGH' : 'NORMAL',
      nextAction: signal.ownerResponded
        ? 'Waiting for the customer to respond'
        : 'Automatic text sent — monitor for a reply',
      reason: transcriptionStalled
        ? 'Text sent; voicemail transcription did not complete'
        : 'Missed-call text was sent',
    };
  }

  return {
    state: 'RESOLVED',
    priority: 'NORMAL',
    nextAction: 'No current follow-up required',
    reason: 'No active recovery work',
  };
}

export const RECOVERY_STATE_ORDER: Record<RecoveryState, number> = {
  NEEDS_ATTENTION: 0,
  AI_HANDLING: 1,
  WAITING_PAYMENT: 2,
  WAITING_CUSTOMER: 3,
  SNOOZED: 4,
  RESOLVED: 5,
};

export const RECOVERY_PRIORITY_ORDER: Record<RecoveryPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
};
