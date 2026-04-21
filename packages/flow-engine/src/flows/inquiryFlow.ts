import { FlowInput, FlowOutput } from '../types';
import { FlowType, MenuItem, SideEffect } from '@ringback/shared-types';
import { pushDecision } from '../decisions';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'do', 'you', 'have', 'any', 'got', 'is', 'are', 'in', 'stock',
  'available', 'for', 'looking', 'how', 'much', 'price', 'of', 'can', 'i', 'get',
  'some', 'please', 'need', 'want', 'your', 'hi', 'hello', 'hey',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Simple substring + token-overlap match over the tenant's catalog. v1.
 * Returns up to `limit` items scored by token overlap in name/description.
 */
export function findCatalogMatches(query: string, items: MenuItem[], limit = 3): MenuItem[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = items
    .filter((it) => !it.requiresBooking) // retail = products, not services
    .map((item) => {
      const haystack = `${item.name} ${item.description ?? ''} ${item.category ?? ''}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (haystack.includes(tok)) score += tok.length;
      }
      return { item, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.item);
}

function formatMatchReply(matches: MenuItem[], tenantName: string): string {
  if (matches.length === 1) {
    const m = matches[0];
    const stockLine = m.isAvailable ? 'In stock now' : 'Currently out of stock';
    const priceLine = `$${Number(m.price).toFixed(2)}`;
    if (!m.isAvailable) {
      return `Yes, ${tenantName} carries ${m.name} (${priceLine}) — ${stockLine}. Want us to let you know when it's back?`;
    }
    return `Yes! ${m.name} is ${priceLine}. ${stockLine}. Want us to hold one for you? Reply YES to reserve.`;
  }
  const lines = matches
    .slice(0, 3)
    .map((m, i) => `${i + 1}. ${m.name} — $${Number(m.price).toFixed(2)}${m.isAvailable ? '' : ' (out of stock)'}`)
    .join('\n');
  return `Here's what we have:\n${lines}\n\nReply with the number to reserve one.`;
}

function isAffirmative(msg: string): boolean {
  return /^(y|yes|yeah|yep|sure|ok|okay|hold it|hold one|please|confirm)\b/i.test(msg.trim());
}

function parseSelectionNumber(msg: string, max: number): number | null {
  const m = msg.trim().match(/^(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > max) return null;
  return n;
}

export async function processInquiryFlow(input: FlowInput): Promise<FlowOutput> {
  const { tenantContext, inboundMessage, currentState, callerPhone } = input;
  const now = Date.now();

  pushDecision(input, {
    handler: 'processInquiryFlow',
    phase: 'FLOW',
    outcome: `step_${(currentState?.flowStep ?? 'match').toLowerCase()}`,
    evidence: { step: currentState?.flowStep ?? null, menuItemCount: tenantContext.menuItems.length },
    durationMs: 0,
  });
  const baseState = {
    tenantId: tenantContext.tenantId,
    callerPhone,
    conversationId: currentState?.conversationId ?? null,
    lastMessageAt: now,
    messageCount: (currentState?.messageCount ?? 0) + 1,
    dedupKey: null,
  };

  // Continuation: caller was offered a hold and is responding
  if (currentState?.currentFlow === FlowType.INQUIRY && currentState.orderDraft) {
    const draft = currentState.orderDraft;

    // Multi-match selection: they replied with a number
    if (currentState.flowStep === 'INQUIRY_MATCH' && draft.items.length > 1) {
      const n = parseSelectionNumber(inboundMessage, draft.items.length);
      if (n != null) {
        const chosen = draft.items[n - 1];
        return {
          nextState: {
            ...baseState,
            currentFlow: FlowType.INQUIRY,
            flowStep: 'INQUIRY_AWAIT_HOLD',
            orderDraft: { items: [chosen] },
          },
          smsReply: `Got it — ${chosen.name} for $${chosen.price.toFixed(2)}. Reply YES to reserve, or CANCEL.`,
          sideEffects: [],
          flowType: FlowType.INQUIRY,
        };
      }
    }

    // Single-item hold confirmation
    if (
      (currentState.flowStep === 'INQUIRY_MATCH' || currentState.flowStep === 'INQUIRY_AWAIT_HOLD') &&
      draft.items.length === 1 &&
      isAffirmative(inboundMessage)
    ) {
      const item = draft.items[0];
      const sideEffects: SideEffect[] = [
        {
          type: 'SAVE_ORDER',
          payload: {
            items: [
              {
                menuItemId: item.menuItemId,
                name: item.name,
                quantity: 1,
                price: item.price,
              },
            ],
            pickupTime: null,
            notes: 'Retail reservation from SMS inquiry',
            total: item.price,
          },
        },
      ];
      return {
        nextState: {
          ...baseState,
          currentFlow: null,
          flowStep: 'INQUIRY_COMPLETE',
          orderDraft: null,
        },
        smsReply: `Reserved! We'll hold ${item.name} for you. ${tenantContext.tenantName} will follow up shortly to confirm pickup details.`,
        sideEffects,
        flowType: FlowType.INQUIRY,
      };
    }

    // Cancel or unclear reply — drop the hold
    if (/^(no|cancel|nope|nvm|nevermind)\b/i.test(inboundMessage.trim())) {
      return {
        nextState: { ...baseState, currentFlow: null, flowStep: null, orderDraft: null },
        smsReply: 'No problem — let us know if you change your mind!',
        sideEffects: [],
        flowType: FlowType.INQUIRY,
      };
    }
  }

  // Fresh inquiry: match against catalog
  const matches = findCatalogMatches(inboundMessage, tenantContext.menuItems);

  if (matches.length === 0) {
    // Hand off to human
    return {
      nextState: { ...baseState, currentFlow: null, flowStep: null, orderDraft: null },
      smsReply: `Hmm, I couldn't find a match for that at ${tenantContext.tenantName}. Let me get a team member to help — one moment.`,
      sideEffects: [
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: 'Product inquiry needs a human',
            message: `No catalog match for: "${inboundMessage}" from ${callerPhone}`,
            channel: 'email',
          },
        },
      ],
      flowType: FlowType.INQUIRY,
    };
  }

  const draftItems = matches.map((m) => ({
    menuItemId: m.id,
    name: m.name,
    quantity: 1,
    price: Number(m.price),
  }));

  return {
    nextState: {
      ...baseState,
      currentFlow: FlowType.INQUIRY,
      flowStep: 'INQUIRY_MATCH',
      orderDraft: { items: draftItems },
    },
    smsReply: formatMatchReply(matches, tenantContext.tenantName),
    sideEffects: [],
    flowType: FlowType.INQUIRY,
  };
}
