import { FlowInput, FlowOutput, FlowStep } from '../types';
import { FlowType } from '@ringback/shared-types';
import { CallerState } from '@ringback/shared-types';

export async function processMeetingFlow(input: FlowInput): Promise<FlowOutput> {
  const { tenantContext, inboundMessage, currentState } = input;
  const upperMsg = inboundMessage.trim().toUpperCase();
  const calcomLink = tenantContext.config.calcomLink;

  const step = (currentState?.flowStep as FlowStep) ?? 'MEETING_GREETING';

  if (
    step === 'MEETING_GREETING' ||
    !currentState ||
    currentState.currentFlow !== FlowType.MEETING
  ) {
    const baseState: CallerState = {
      tenantId: tenantContext.tenantId,
      callerPhone: input.callerPhone,
      conversationId: currentState?.conversationId ?? null,
      currentFlow: FlowType.MEETING,
      flowStep: 'MEETING_SCHEDULE',
      orderDraft: null,
      lastMessageAt: Date.now(),
      messageCount: (currentState?.messageCount ?? 0) + 1,
      dedupKey: null,
    };

    if (calcomLink) {
      return {
        nextState: { ...baseState, flowStep: 'MEETING_CONFIRM' },
        smsReply: `We'd love to connect! Book a time that works for you: ${calcomLink}\n\nOr reply with your preferred date and time and we'll confirm.`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }

    return {
      nextState: baseState,
      smsReply: `We'd love to connect! Please reply with your preferred date, time, and a brief reason for the meeting.`,
      sideEffects: [],
      flowType: FlowType.MEETING,
    };
  }

  if (step === 'MEETING_SCHEDULE') {
    const nextState: CallerState = {
      ...currentState,
      flowStep: 'MEETING_CONFIRM',
      lastMessageAt: Date.now(),
    };

    return {
      nextState,
      smsReply: `Got it! We'll review your request and confirm your meeting shortly. You'll receive a confirmation text within 1 business hour.`,
      sideEffects: [
        {
          type: 'BOOK_MEETING',
          payload: {
            callerPhone: input.callerPhone,
            preferredTime: inboundMessage.trim(),
            notes: null,
          },
        },
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: `Meeting Request from ${input.callerPhone}`,
            message: `Meeting request received from ${input.callerPhone}:\n"${inboundMessage}"`,
            channel: 'email',
          },
        },
      ],
      flowType: FlowType.MEETING,
    };
  }

  if (step === 'MEETING_CONFIRM') {
    if (upperMsg === 'CANCEL' || upperMsg === 'NO') {
      const nextState: CallerState = {
        ...currentState,
        flowStep: 'MEETING_GREETING',
        currentFlow: null,
        lastMessageAt: Date.now(),
      };
      return {
        nextState,
        smsReply: `No problem! If you change your mind, just text MEETING anytime.`,
        sideEffects: [],
        flowType: FlowType.MEETING,
      };
    }

    return {
      nextState: { ...currentState, lastMessageAt: Date.now() },
      smsReply: `Your meeting request is pending confirmation. We'll text you shortly with next steps!`,
      sideEffects: [],
      flowType: FlowType.MEETING,
    };
  }

  return {
    nextState: {
      ...(currentState ?? {
        tenantId: tenantContext.tenantId,
        callerPhone: input.callerPhone,
        conversationId: null,
        orderDraft: null,
        messageCount: 0,
        dedupKey: null,
      }),
      currentFlow: FlowType.MEETING,
      flowStep: 'MEETING_GREETING',
      lastMessageAt: Date.now(),
    } as CallerState,
    smsReply: `Thanks for reaching out! Text MEETING to schedule a call or we can find a time that works for you.`,
    sideEffects: [],
    flowType: FlowType.MEETING,
  };
}
