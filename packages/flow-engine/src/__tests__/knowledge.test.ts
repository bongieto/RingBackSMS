import { FlowType } from '@ringback/shared-types';
import {
  isLikelyFactualQuestion,
  parseGroundedResponse,
  retrieveKnowledgeFacts,
  validateGroundedResponse,
} from '../knowledge';
import { processFallbackFlow } from '../flows/fallbackFlow';
import { buildLumpiaContext } from './scenarios/_fixtures';
import type { VerifiedKnowledgeFact } from '../types';

const cancellationFact: VerifiedKnowledgeFact = {
  id: 'fact-cancel',
  key: 'policy.cancellation',
  category: 'POLICY',
  question: 'What is your cancellation policy?',
  answer: 'Cancellations require 24 hours notice. The fee is $15.',
  aliases: ['cancel', 'cancellation fee', 'reschedule'],
  source: 'OWNER',
  verifiedAt: '2026-07-24T00:00:00.000Z',
};

describe('grounded knowledge', () => {
  test('detects factual questions and retrieves alias matches', () => {
    expect(isLikelyFactualQuestion('is there a cancellation fee?')).toBe(true);
    expect(retrieveKnowledgeFacts('can I cancel?', [cancellationFact])).toEqual([
      cancellationFact,
    ]);
  });

  test('rejects citations that were not retrieved', () => {
    const response = parseGroundedResponse(JSON.stringify({
      answer: 'The fee is $15.',
      supportedFactIds: ['made-up'],
      confidence: 0.9,
      needsHuman: false,
    }));
    expect(response).not.toBeNull();
    expect(validateGroundedResponse({
      response: response!,
      retrievedFacts: [cancellationFact],
      userMessage: 'what is the cancellation fee?',
    })).toEqual({ valid: false, reason: 'unknown_fact_id:made-up' });
  });

  test('rejects unsupported numbers even with a valid citation', () => {
    const response = parseGroundedResponse(JSON.stringify({
      answer: 'The fee is $25.',
      supportedFactIds: ['fact-cancel'],
      confidence: 0.9,
      needsHuman: false,
    }));
    expect(validateGroundedResponse({
      response: response!,
      retrievedFacts: [cancellationFact],
      userMessage: 'what is the cancellation fee?',
    })).toEqual({ valid: false, reason: 'unsupported_number:25' });
  });

  test('does not treat a number in the customer question as verified evidence', () => {
    const hoursFact: VerifiedKnowledgeFact = {
      ...cancellationFact,
      id: 'fact-hours',
      key: 'business.hours',
      category: 'HOURS',
      question: 'When are you open?',
      answer: 'We are open weekdays only.',
    };
    const response = parseGroundedResponse(JSON.stringify({
      answer: 'Yes, we are open 24/7.',
      supportedFactIds: ['fact-hours'],
      confidence: 0.95,
      needsHuman: false,
    }));
    expect(validateGroundedResponse({
      response: response!,
      retrievedFacts: [hoursFact],
      userMessage: 'Are you open 24/7?',
    })).toEqual({ valid: false, reason: 'unsupported_number:24' });
  });

  test('rejects unsupported high-risk business claims', () => {
    const response = parseGroundedResponse(JSON.stringify({
      answer: 'Our technicians are licensed and insured.',
      supportedFactIds: ['fact-cancel'],
      confidence: 0.95,
      needsHuman: false,
    }));
    expect(validateGroundedResponse({
      response: response!,
      retrievedFacts: [cancellationFact],
      userMessage: 'Are your technicians licensed?',
    })).toEqual({ valid: false, reason: 'unsupported_claim:licensed' });
  });

  test('allows high-risk claims when the cited owner fact supports them', () => {
    const licensingFact: VerifiedKnowledgeFact = {
      ...cancellationFact,
      id: 'fact-license',
      key: 'business.credentials',
      question: 'Are your technicians licensed and insured?',
      answer: 'Yes. Our technicians are licensed and insured.',
    };
    const response = parseGroundedResponse(JSON.stringify({
      answer: 'Yes, our technicians are licensed and insured.',
      supportedFactIds: ['fact-license'],
      confidence: 0.95,
      needsHuman: false,
    }));
    expect(validateGroundedResponse({
      response: response!,
      retrievedFacts: [licensingFact],
      userMessage: 'Are your technicians licensed?',
    })).toEqual({ valid: true });
  });

  test('returns a grounded factual answer with an audit contract', async () => {
    const context = buildLumpiaContext({
      openNow: true,
      flowTypes: [FlowType.FALLBACK],
    });
    context.verifiedKnowledge = [cancellationFact];
    const result = await processFallbackFlow({
      tenantContext: context,
      callerPhone: '+12175550199',
      inboundMessage: 'what is your cancellation fee?',
      currentState: null,
      chatFn: async () => JSON.stringify({
        answer: 'Cancellations require 24 hours notice. The fee is $15.',
        supportedFactIds: ['fact-cancel'],
        confidence: 0.98,
        needsHuman: false,
      }),
    });
    expect(result.smsReply).toContain('$15');
    expect(result.accuracy?.validationStatus).toBe('grounded');
    expect(result.accuracy?.supportedFactIds).toEqual(['fact-cancel']);
  });

  test('fails closed when factual grounding is enabled but no fact matches', async () => {
    const context = buildLumpiaContext({
      openNow: true,
      flowTypes: [FlowType.FALLBACK],
    });
    context.verifiedKnowledge = [];
    const chatFn = jest.fn();
    const result = await processFallbackFlow({
      tenantContext: context,
      callerPhone: '+12175550199',
      inboundMessage: 'what is your parking policy?',
      currentState: null,
      chatFn,
    });
    expect(chatFn).not.toHaveBeenCalled();
    expect(result.accuracy?.validationStatus).toBe('deflected_no_facts');
    expect(result.accuracy?.needsHuman).toBe(true);
  });
});
