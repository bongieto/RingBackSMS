import { FlowInput, FlowOutput } from '../types';
import { FlowType } from '@ringback/shared-types';
import { CallerState } from '@ringback/shared-types';
import { pushDecision } from '../decisions';

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
  const t0 = Date.now();

  // Short-circuit: if the customer is just politely closing out, don't run
  // the AI. Either stay silent (empty reply) or drop a one-liner.
  // Runs BEFORE the bare-confirm guard so polite "ok" / "thanks" get
  // the closure path, not the "what are you confirming?" deflection.
  const closure = matchClosure(inboundMessage);
  if (closure.matched) {
    pushDecision(input, {
      handler: 'fallbackFlow',
      phase: 'FLOW',
      outcome: closure.reply === null ? 'closure_silent' : 'closure_reply',
      reason: 'matched conversational closure',
      evidence: { replyType: closure.reply === null ? 'silence' : 'template' },
      durationMs: Date.now() - t0,
    });
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

  // Hard guard against hallucinated order confirmations. If the caller
  // sends a bare confirmation phrase ("yes", "yes confirm", "confirm",
  // "sure") to FALLBACK — meaning there's no ORDER flow in progress
  // and no in-flight order to confirm against — the LLM would gleefully
  // fabricate an order confirmation plus a "[Stripe payment link would
  // be sent here]" template leak. Short-circuit instead: ask what they
  // want to confirm. Anchor to whole-message match so we don't catch
  // "yes can I get 2 lumpia" which is a real order request the ORDER
  // flow should handle. Runs AFTER the closure matcher so polite "ok"
  // / "okay" stay on the closure path.
  const hasActiveOrder = Boolean(callerMemory?.activeOrder);
  const bareConfirmRe = /^(y|yes|yep|yeah|yup|sure|confirm|yes[\s,!.]*confirm|ok[\s,!.]*confirm|confirm[\s,!.]*(it|that|please)?|go ahead|please do)[\s!.?]*$/i;
  if (!hasActiveOrder && bareConfirmRe.test(inboundMessage.trim())) {
    pushDecision(input, {
      handler: 'fallbackFlow',
      phase: 'FLOW',
      outcome: 'deflected_bare_confirm',
      reason: 'bare confirmation with no active order — refuse to hallucinate',
      durationMs: Date.now() - t0,
    });
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
      smsReply: `Not sure what you'd like to confirm — want to place an order? Just tell me what you'd like!`,
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
    const fmt = (item: typeof tenantContext.menuItems[number]) => {
      let line = `- ${item.name}: $${item.price.toFixed(2)}`;
      if (item.duration) line += ` (${item.duration} min)`;
      if (item.requiresBooking) line += ' [booking required]';
      return line;
    };
    const available = tenantContext.menuItems.filter((m) => m.isAvailable).map(fmt);
    // 86'd items are first-class context — if a customer asks about
    // one, we want to say "we're out today" not "we don't carry that".
    const outToday = tenantContext.menuItems.filter((m) => !m.isAvailable).map(fmt);
    catalogContext = `\nAvailable products/services:\n${available.join('\n')}`;
    if (outToday.length > 0) {
      catalogContext += `\n\nCurrently sold out / 86'd today (DO exist on our menu — we're just out right now):\n${outToday.join('\n')}`;
    }
    catalogContext += `\n\nItem-availability rules:
- If the customer asks about an item in "Available" → confirm with name + price, offer to help them order.
- If the customer asks about an item in "Currently sold out" → say "We're out of {name} today — {suggest 1-2 available alternatives}." Never say the item isn't on the menu.
- If the customer asks about something NOT in either list → "We don't carry that" + suggest 1-2 closest matches from Available.
- Never invent item names, prices, or descriptions. If you don't have it in the two lists above, you don't have it.`;
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

  // Active-order block: when the caller has an in-flight order, include
  // the AUTHORITATIVE ETA from the DB so chat replies never have to
  // guess. Format the estimatedReadyTime in the tenant's timezone (or
  // UTC fallback) as a human-friendly time-of-day.
  let activeOrderBlock = '';
  if (callerMemory?.activeOrder) {
    const ao = callerMemory.activeOrder;
    const parts: string[] = [`#${ao.orderNumber}`, `status: ${ao.status}`];
    if (ao.estimatedReadyTime) {
      try {
        const ready = new Date(ao.estimatedReadyTime);
        const tz = tenantContext.config.timezone ?? 'America/Chicago';
        const timeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(ready);
        parts.push(`estimated ready at ${timeStr}`);
      } catch {
        // ignore formatting error
      }
    }
    if (ao.pickupTime) parts.push(`pickup: ${ao.pickupTime}`);
    if (ao.itemsSummary) parts.push(`items: ${ao.itemsSummary}`);
    if (ao.total != null) parts.push(`total $${ao.total.toFixed(2)}`);
    activeOrderBlock = `\n\nCurrent in-flight order (use THESE facts when they ask about their order — never guess or paraphrase the time): ${parts.join(' · ')}.`;
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
- If the customer is just chit-chatting, acknowledging, emoji-ing, or sending noise with nothing actionable, reply warmly in 2–6 words (e.g. "No problem!", "Sounds good!", "Haha no worries", "Appreciate it!").
- If the customer is ACTIVELY asking something, answer briefly. Only mention ORDER / MEETING / etc. when they clearly ask about starting one — never as a forced CTA.
- NEVER send an empty reply. Every message gets a response, even if it's just a short acknowledgement.
- Never invent prices, hours, menu items, or policies not in the context below.
- Never mention you're an AI, an assistant, or explain your reasoning.
- Never repeat the customer's message back to them.
- NEVER confirm an order, payment, booking, or reservation. You are not wired to the order or payment system. If the customer says "yes", "confirm", "sure", etc. with nothing to confirm against (no in-flight order in the context below), respond by asking what they'd like — e.g. "Not sure what you're confirming — want to place an order?". If there IS an in-flight order in the context, just state its current status; don't claim a new confirmation or that a payment link is being sent.
- NEVER emit bracketed placeholder text like "[payment link would be sent here]", "[link]", "[name]", etc. These are template markers, not real output. If you don't have a real URL or value, don't mention one.${postOrderHint}

# Capabilities and context
${capabilities}${businessAddress}${websiteContext}${catalogContext}${callerContextBlock}${activeOrderBlock}${customBlock}`;

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

  // Deterministic deflection used whenever the LLM produces nothing
  // useful (empty, `<silence>`, or the provider errors). Silence is
  // architecturally forbidden — a customer-facing SMS system must never
  // respond with nothing to a non-closure question.
  const tenantPhone = tenantContext.tenantPhoneNumber?.trim();
  const deflection = tenantPhone
    ? `Sorry, I'm not sure what you're asking — text ${tenantPhone} or give us a call.`
    : `Sorry, I'm not sure what you're asking — please give us a call.`;

  try {
    const raw = await chatFn({
      systemPrompt,
      userMessage: inboundMessage,
      maxTokens: 80,
      temperature: 0.6,
    });
    let replyText = stripThinkTags(raw).replace(/^["']|["']$/g, '').trim();

    // Strip template-placeholder leaks like "[Stripe payment link would be
    // sent here]" — the LLM sometimes emits these even though our prompt
    // never shows one. Remove any bracketed span containing the word
    // "would" or "here" (meta-template hallmarks) without nuking legit
    // brackets around, say, item numbers. Whole-line deletion when the
    // line is nothing but the placeholder.
    replyText = replyText
      .split('\n')
      .filter((line) => !/^\s*\[[^\]]*\b(would\s+be|goes\s+here|placeholder|insert|link\s+here)\b[^\]]*\]\s*$/i.test(line))
      .join('\n')
      .replace(/\[[^\]]*\b(would\s+be|goes\s+here|placeholder|insert|link\s+here)\b[^\]]*\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Strip any lingering `<silence>` sentinel the model may still emit
    // despite the prompt no longer advertising it, then deflect if empty.
    if (replyText === '<silence>' || replyText === '') {
      pushDecision(input, {
        handler: 'fallbackFlow',
        phase: 'FLOW',
        outcome: 'deflected_empty_llm',
        reason: 'LLM returned empty or <silence> — served deflection',
        durationMs: Date.now() - t0,
      });
      return { nextState, smsReply: deflection, sideEffects: [], flowType: FlowType.FALLBACK };
    }

    // Cap length just in case the model ignores instructions. URL-aware:
    // if the message ends with a URL, trim the prose before the URL so
    // the link stays clickable instead of slicing mid-URL.
    if (replyText.length > 320) {
      const urlMatch = replyText.match(/(https?:\/\/\S+)\s*$/);
      if (urlMatch) {
        const url = urlMatch[1];
        if (url.length < 320) {
          const prose = replyText.slice(0, replyText.length - url.length).trimEnd();
          const budget = 320 - url.length - 1;
          const trimmedProse =
            prose.length <= budget ? prose : prose.slice(0, budget - 1).trimEnd() + '…';
          replyText = `${trimmedProse}\n${url}`;
        } else {
          replyText = url;
        }
      } else {
        replyText = replyText.slice(0, 317) + '…';
      }
    }

    pushDecision(input, {
      handler: 'fallbackFlow',
      phase: 'FLOW',
      outcome: 'llm_replied',
      evidence: { replyLen: replyText.length },
      durationMs: Date.now() - t0,
    });
    return { nextState, smsReply: replyText, sideEffects: [], flowType: FlowType.FALLBACK };
  } catch (err) {
    // AI provider failure: deflect instead of silent drop so the caller
    // gets a response on the same turn.
    pushDecision(input, {
      handler: 'fallbackFlow',
      phase: 'FLOW',
      outcome: 'deflected_llm_error',
      reason: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    });
    return { nextState, smsReply: deflection, sideEffects: [], flowType: FlowType.FALLBACK };
  }
}
