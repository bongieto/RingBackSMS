import { FlowInput, FlowOutput } from '../types';
import { FlowType } from '@ringback/shared-types';
import { CallerState } from '@ringback/shared-types';

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

// Conversational closures — the customer is just being polite after a
// completed interaction ("ok", "thanks", "see you soon"). A generic
// "Thanks for reaching out" answer feels robotic; a brief warm reply
// (or sometimes none at all) is better. Checked as whole-message match
// after normalization.
const CLOSURE_PATTERNS: Array<{ re: RegExp; reply: string | null }> = [
  { re: /^(ok+|okay+|k+|kk+)$/i, reply: null }, // silence
  { re: /^(thx|thanks|thank you|ty|appreciate it|🙏|thank u)$/i, reply: "You're welcome!" },
  { re: /^(bye|goodbye|cya|see (you|ya)( soon)?|later|take care|ttyl)$/i, reply: 'See you!' },
  { re: /^(great|cool|awesome|nice|perfect|sweet|👍|👌|🙌|❤️|😊|🫶)$/i, reply: null },
  { re: /^(got it|sounds good|alright|aight|right on|cheers)$/i, reply: null },
];

function matchClosure(body: string): { matched: true; reply: string | null } | { matched: false } {
  const normalized = body.trim().replace(/[.!?]+$/, '');
  for (const { re, reply } of CLOSURE_PATTERNS) {
    if (re.test(normalized)) return { matched: true, reply };
  }
  return { matched: false };
}

export async function processFallbackFlow(input: FlowInput): Promise<FlowOutput> {
  const { tenantContext, inboundMessage, currentState, chatFn, callerMemory } = input;

  // Short-circuit: if the customer is just politely closing out, don't run
  // the AI. Either stay silent (empty reply) or drop a one-liner.
  const closure = matchClosure(inboundMessage);
  if (closure.matched) {
    const nextState: CallerState = {
      tenantId: tenantContext.tenantId,
      callerPhone: input.callerPhone,
      conversationId: currentState?.conversationId ?? null,
      currentFlow: FlowType.FALLBACK,
      flowStep: 'FALLBACK',
      orderDraft: currentState?.orderDraft ?? null,
      lastMessageAt: Date.now(),
      messageCount: (currentState?.messageCount ?? 0) + 1,
      dedupKey: null,
    };
    return {
      nextState,
      smsReply: closure.reply ?? '',
      sideEffects: [],
      flowType: FlowType.FALLBACK,
    };
  }

  const personality = tenantContext.config.aiPersonality ?? 'helpful, friendly, and professional';
  const enabledFlows = tenantContext.flows
    .filter((f) => f.isEnabled && f.type !== FlowType.FALLBACK)
    .map((f) => f.type);

  const capabilities =
    enabledFlows.length > 0
      ? `You can help customers with: ${enabledFlows.map((f) => f.toLowerCase()).join(', ')}.`
      : '';

  const websiteContext = tenantContext.config.websiteContext
    ? `\nBusiness context from their website: ${tenantContext.config.websiteContext.substring(0, 1500)}`
    : '';

  const businessAddress = tenantContext.config.businessAddress
    ? `\nBusiness address: ${tenantContext.config.businessAddress}`
    : '';

  let catalogContext = '';
  if (tenantContext.menuItems.length > 0) {
    const itemLines = tenantContext.menuItems
      .filter((m) => m.isAvailable)
      .map((item) => {
        let line = `- ${item.name}: $${item.price.toFixed(2)}`;
        if (item.duration) line += ` (${item.duration} min)`;
        if (item.requiresBooking) line += ' [booking required]';
        return line;
      });
    catalogContext = `\nAvailable products/services:\n${itemLines.join('\n')}`;
  }

  // Caller memory: a one-paragraph "what we know about this person" block so
  // the AI can greet them by name and avoid re-asking what they ordered last time.
  let callerContextBlock = '';
  if (callerMemory) {
    const lines: string[] = [];
    if (callerMemory.contactName) {
      const status = callerMemory.contactStatus && callerMemory.contactStatus !== 'LEAD'
        ? ` (${callerMemory.contactStatus.toLowerCase()})`
        : '';
      lines.push(`Caller name: ${callerMemory.contactName}${status}.`);
    }
    if (callerMemory.tier === 'RETURNING') lines.push('This is a returning customer — greet them warmly.');
    if (callerMemory.tier === 'SAME_DAY') lines.push('This caller already contacted us earlier today.');
    if (callerMemory.tier === 'RAPID_REDIAL') lines.push('This caller just called multiple times in a row — likely urgent.');
    if (callerMemory.lastOrderSummary) lines.push(`Last order: ${callerMemory.lastOrderSummary}.`);
    if (callerMemory.lastConversationPreview) {
      lines.push(`Last message exchanged: "${callerMemory.lastConversationPreview.slice(0, 140)}".`);
    }
    if (lines.length > 0) {
      callerContextBlock = `\nCaller context (use naturally — don't repeat verbatim): ${lines.join(' ')}`;
    }
  }

  const justCompletedOrder = currentState?.flowStep === 'ORDER_COMPLETE';
  const postOrderHint = justCompletedOrder
    ? '\nThe customer JUST completed an order — most messages right now are polite chit-chat ("ok", "see you", "thanks man"), questions ABOUT the existing order, or random non-requests. Treat casual messages as casual. Do NOT try to upsell or re-prompt for a new order.'
    : '';

  // Tenant owner's custom instructions apply across ALL AI-generated
  // replies, not just the order agent. Appended last so they can
  // override-ish / layer on top of the base rules above.
  const customInstr = (tenantContext.config as { customAiInstructions?: string | null }).customAiInstructions;
  const customBlock =
    customInstr && customInstr.trim().length > 0
      ? `\n\n# Tenant-specific instructions from the owner\n${customInstr.trim()}`
      : '';

  const systemPrompt = `You are texting on behalf of ${tenantContext.tenantName}. Be ${personality}.

# Output rules
- Reply in ONE short sentence, under 120 characters.
- If the customer is just chit-chatting, acknowledging, emoji-ing, or sending noise with nothing actionable, reply warmly in 2–6 words (e.g. "No problem!", "Sounds good!", "Haha no worries", "Appreciate it!") OR output exactly the single token \`<silence>\` when a reply would feel forced.
- If the customer is ACTIVELY asking something, answer briefly. Only mention ORDER / MEETING / etc. when they clearly ask about starting one — never as a forced CTA.
- Never invent prices, hours, menu items, or policies not in the context below.
- Never mention you're an AI, an assistant, or explain your reasoning.
- Never repeat the customer's message back to them.${postOrderHint}

# Capabilities and context
${capabilities}${businessAddress}${websiteContext}${catalogContext}${callerContextBlock}${customBlock}`;

  const nextState: CallerState = {
    tenantId: tenantContext.tenantId,
    callerPhone: input.callerPhone,
    conversationId: currentState?.conversationId ?? null,
    currentFlow: FlowType.FALLBACK,
    flowStep: 'FALLBACK',
    orderDraft: currentState?.orderDraft ?? null,
    lastMessageAt: Date.now(),
    messageCount: (currentState?.messageCount ?? 0) + 1,
    dedupKey: null,
  };

  try {
    const raw = await chatFn({
      systemPrompt,
      userMessage: inboundMessage,
      maxTokens: 80,
      temperature: 0.6,
    });
    let replyText = stripThinkTags(raw).replace(/^["']|["']$/g, '').trim();

    // Silence sentinel or empty → don't send anything.
    if (replyText === '<silence>' || replyText === '') {
      return { nextState, smsReply: '', sideEffects: [], flowType: FlowType.FALLBACK };
    }

    // Cap length just in case the model ignores instructions.
    if (replyText.length > 320) replyText = replyText.slice(0, 317) + '…';

    return { nextState, smsReply: replyText, sideEffects: [], flowType: FlowType.FALLBACK };
  } catch {
    // AI provider failure: stay silent rather than send a generic apology.
    // The caller's next message will retry. Better than spamming "we'll get back".
    return { nextState, smsReply: '', sideEffects: [], flowType: FlowType.FALLBACK };
  }
}
