import type { CallerState, OrderDraft } from '@ringback/shared-types';
import { FlowType } from '@ringback/shared-types';
import type { FlowInput, FlowOutput } from '../types';
import { processOrderFlow } from '../flows/orderFlow';
import {
  ORDER_AGENT_TOOLS,
  computeTotal,
  computeOrderTotals,
  handleAddItems,
  handleAddItemsForPerson,
  handleAskClarification,
  handleRemoveItem,
  handleReorderLast,
  handleSetCustomerName,
  handleSetOrderNotes,
  handleSetPickupTime,
  handleUpdateQuantity,
  type ToolResult,
} from './orderAgentTools';
import { filterMenuForPrompt } from './menuFilter';
import { buildOrderAgentSystemPrompt, findItemPhraseMatches } from './buildAgentPrompt';
import { calculateFlowPrepTime, formatReadyTime } from '../flows/orderFlow';

// Cheap heuristic: did the customer just explicitly confirm?
// Anchored to start-and-end of message so phrases like "I can confirm
// that's not right" or "yes but change X" don't accidentally commit the
// order. The whole message must be one or more confirm-phrase tokens
// back-to-back, so "yes", "yes confirm", "yeah go ahead", "ok sure",
// and "confirm please" all match. "yes but change X" does not (the
// trailing content doesn't match any confirm token).
const CONFIRM_TOKENS =
  '(?:yes|yep|yeah|yup|yess+|ya|yah|yas|confirm|confirmed|go ahead|place it|place the order|that\'?s right|correct|ok|okay|sure|sounds good|do it|let\'?s go|please|now|thanks|thx|ready|ready to confirm|ready to order|ready to go|i\'?m ready|im ready|all set|good to go|lock it in)';
const CONFIRM_RE = new RegExp(
  `^\\s*${CONFIRM_TOKENS}(?:[\\s,]+${CONFIRM_TOKENS})*\\s*[.!?]*\\s*$`,
  'i',
);

// Cheap heuristic: did the customer just explicitly ask to cancel?
// Tight — we lost a $40 order to Claude auto-cancelling on a typo it
// couldn't parse. Also tightened so phrases like "cancel the spicy on
// my fries" or "clear the extras" don't wipe the whole cart — we
// require either a standalone cancel-type word, OR a clear "cart/order
// scope" marker (cancel my/the order, start over, stop order).
const CANCEL_RE =
  /^\s*(cancel|nvm|nevermind|never\s+mind|forget it|scratch that|start over|stop|stop order|stop the order)\s*[.!?]*\s*$|\b(cancel (my|the) (order|cart)|clear (my|the) (order|cart)|restart (my|the) order)\b/i;

/** Strip extended-thinking / reasoning tags that occasionally leak through
 *  from the model. Belt-and-suspenders: the SDK usually hides them, but
 *  some fallback providers (MiniMax) pass them through raw. Never ship
 *  <think>…</think> to an SMS. */
function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    // Also strip a dangling open <think> with no close — happens when
    // max_tokens cut the response mid-reasoning. In that case EVERYTHING
    // from <think> onward is thinking-content we don't want to ship.
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

/** Heuristic: is this message the customer (re)stating their entire
 *  order rather than adding to an existing cart? Captures "Order: ...",
 *  "I want ...", bullet-list phrasing, AND the menu-page-generated
 *  format "N #code item name". When TRUE and the cart is non-empty, we
 *  wipe the cart first so Claude doesn't pile new items on top of
 *  forgotten prior attempts. */
function looksLikeFreshOrderList(msg: string): boolean {
  const trimmed = msg.trim();

  // Explicit ADD-intent prefixes short-circuit to FALSE. "add 1 #a1" /
  // "also two fries" are continuations of the existing cart, not
  // fresh-order lists. Without this check the hash-code rule below
  // would false-positive on "add #a6".
  if (/^(add\b|also\b|and\b|plus\b|one more\b|another\b|one more of\b|give me (?:one|a|another) more\b)/i.test(trimmed)) {
    return false;
  }

  // STRONG SIGNAL: the message begins with a menu-item hash code.
  // Our menu page generates SMS drafts in the format
  //   "Order: N #code item"  OR  "N #code item"  OR  "#code"
  // and customers who tap the menu link always get one of those. Nothing
  // else in the conversation corpus uses `#<short-alnum>` as a prefix,
  // so false-positive risk is near zero. This catches the case where a
  // customer re-taps the menu link and sends "1 #a1 lumpia regular" —
  // which looked like a bare add to the prior heuristic.
  if (/^\s*\d*\s*#[a-z0-9]{1,8}\b/i.test(trimmed)) return true;

  // Otherwise: require an intent phrase + item signal + plausible length.
  const hasIntent = /^(order\s*:|i(?:'ll| would like| want| need| want to order)|can i (?:get|have|order)|(?:can we|we'd like to|we want to|we would like to) (?:get|have|order)|let me (?:get|have)|i'll have|gimme|we want|we need)\b/i.test(
    trimmed,
  );
  if (!hasIntent) return false;
  const hasQuantityOrArticle = /\b(\d+|a|an|the|some|another|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
    trimmed,
  );
  if (!hasQuantityOrArticle) return false;
  // "I want it" / "I'll have" alone isn't a fresh order list — it's a
  // reference. Require some body.
  return trimmed.length >= 10;
}

/** Heuristic: is the customer disowning what the bot just echoed? "that's
 *  not my order", "wrong order", "no that's wrong", etc. When TRUE, wipe
 *  the cart so the next turn starts clean. */
function looksLikeRejectCart(msg: string): boolean {
  const trimmed = msg.trim();
  return /\b(that'?s not (my|the|what)|not my order|wrong order|that'?s wrong|nope that'?s wrong|incorrect order|that'?s not what|you got it wrong)\b/i.test(
    trimmed,
  );
}

/** Deterministic pickup-time parser — used as a fallback when Claude
 *  doesn't call set_pickup_time on a short reply to "what time?". We
 *  don't need to resolve this into a timestamp (the owner reads the
 *  pickup string verbatim); we just need to accept a plausible time
 *  phrase and save it. Returns the normalized string or null. */
export function parsePickupPhrase(raw: string): string | null {
  const msg = raw.trim();
  if (!msg) return null;
  // "asap", "now", "whenever" etc.
  if (/^(asap|now|right now|immediately|whenever|any ?time|as soon as possible|soon)\b/i.test(msg)) {
    return msg.toLowerCase();
  }
  // Explicit time + optional day: "11:30am tuesday", "tuesday 12pm",
  // "schedule for tuesday 12pm", "tomorrow at 1pm", "in 30 minutes",
  // "in an hour", "8:30 tonight", "noon", "midnight".
  const hasClockTime = /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i.test(msg);
  const hasRelative = /\b(in\s+(a|an|\d+)\s+(min(ute)?s?|hour|hours|hr|hrs))\b/i.test(msg);
  const hasNamedTime = /\b(noon|midnight|tonight|morning|afternoon|evening)\b/i.test(msg);
  const hasDay = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat|sun)\b/i.test(msg);
  if (hasClockTime || hasRelative || hasNamedTime || (hasDay && /\d/.test(msg))) {
    // Strip filler "schedule for ", "pickup at ", "for " prefixes.
    return msg
      .replace(/^(schedule(d)?\s+(it\s+)?(for|at)\s+|pick ?up\s+(at|for)\s+|at\s+|for\s+)/i, '')
      .trim()
      .toLowerCase();
  }
  return null;
}

function cloneDraft(d: OrderDraft | null | undefined): OrderDraft {
  if (!d) return { items: [] };
  return {
    items: d.items.map((i) => ({ ...i, selectedModifiers: i.selectedModifiers ? [...i.selectedModifiers] : undefined })),
    pickupTime: d.pickupTime,
    notes: d.notes,
  };
}

function buildBaseState(input: FlowInput, draft: OrderDraft, overrides: Partial<CallerState> = {}): CallerState {
  const prev = input.currentState;
  return {
    tenantId: input.tenantContext.tenantId,
    callerPhone: input.callerPhone,
    conversationId: prev?.conversationId ?? null,
    currentFlow: FlowType.ORDER,
    flowStep: overrides.flowStep ?? prev?.flowStep ?? 'MENU_DISPLAY',
    orderDraft: draft.items.length ? draft : null,
    meetingDraft: prev?.meetingDraft ?? null,
    paymentPending: prev?.paymentPending ?? null,
    pendingCustomization: prev?.pendingCustomization ?? null,
    pendingClarification: overrides.pendingClarification ?? null,
    customerName: overrides.customerName !== undefined ? overrides.customerName : prev?.customerName ?? null,
    lastMessageAt: Date.now(),
    messageCount: (prev?.messageCount ?? 0) + 1,
    dedupKey: null,
    ...overrides,
  };
}

function buildOwnerOrderSummary(items: OrderDraft['items']): string {
  return items
    .map((i) => {
      const mods = i.selectedModifiers?.length
        ? ` [${i.selectedModifiers.map((m) => `${m.groupName}: ${m.modifierName}`).join(', ')}]`
        : '';
      return `${i.quantity}× ${i.name}${mods}`;
    })
    .join('\n');
}

/**
 * Run one turn of the AI order agent. One Claude call, deterministic tool
 * execution, state machine remains the outer orchestrator. If anything goes
 * wrong we delegate to the regex-based `processOrderFlow` so the customer
 * never sees a broken experience.
 */
export async function runOrderAgent(input: FlowInput): Promise<FlowOutput> {
  if (!input.chatWithToolsFn) {
    // No tool-use client injected — fall back to regex flow
    return processOrderFlow(input);
  }

  try {
    const { tenantContext, inboundMessage, currentState, callerMemory, chatWithToolsFn, recentMessages } = input;
    const draft = cloneDraft(currentState?.orderDraft);
    // Snapshot whether pickup was empty on entry — we use this below to
    // detect "pickup was just captured this turn" regardless of whether
    // the capture came via Claude's set_pickup_time tool OR our
    // deterministic fallback parser. Both paths need the same echo.
    const pickupWasEmptyOnEntry = !draft.pickupTime;

    // If the customer is restating their entire order ("Order: X, Y, Z"
    // or "I want X, Y, Z" / "can i get X"), or rejecting the bot's
    // summary ("that's not my order"), wipe the cart before the agent
    // runs so the new turn starts clean and Claude doesn't pile new
    // items on top of forgotten prior attempts.
    //
    // We used to gate this behind `flowStep !== 'AWAITING_PAYMENT'` to
    // protect in-flight payments, but that caused a worse bug: after a
    // confirmed order that never paid, the cart persisted, and the next
    // "Order: ..." SMS from the same customer got piled on top. The
    // compounded cart then got billed in full. Real-world repro:
    //    8:04 PM  →  1× A1 confirmed, pending payment
    //    8:10 PM  →  "Order: 2 #A6" → bot replied "1× A1, 2× A6" (!)
    //    8:19 PM  →  "Order: 1 #A1" → bot replied "2× A1, 1× A6" (!)
    // A fresh-order-list signal is a strong "I've moved on" — reset
    // unconditionally. Item-level tweaks ("add a drink") don't match the
    // fresh-list heuristic so the AWAITING_PAYMENT path is unaffected.
    const shouldResetCart =
      draft.items.length > 0 &&
      (looksLikeFreshOrderList(inboundMessage) || looksLikeRejectCart(inboundMessage));
    if (shouldResetCart) {
      draft.items = [];
    }

    const filteredMenu = filterMenuForPrompt(
      tenantContext.menuItems,
      inboundMessage,
      recentMessages?.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ?? null,
      draft,
    );

    // 86'd items still go into the prompt (as a separate block) so the
    // agent can say "we're out of X today" instead of "we don't carry X".
    // Cap at 25 to avoid ballooning the prompt on giant menus.
    const soldOutItems = tenantContext.menuItems
      .filter((m) => m.isAvailable === false)
      .slice(0, 25);
    const systemPrompt = buildOrderAgentSystemPrompt({
      tenantContext,
      filteredMenu,
      soldOutItems,
      draft,
      memory: callerMemory,
      pendingClarification: currentState?.pendingClarification ?? null,
      inboundMessage,
    });

    const aiResponseRaw = await chatWithToolsFn({
      systemPrompt,
      userMessage: inboundMessage,
      messageHistory: recentMessages?.slice(-6),
      tools: ORDER_AGENT_TOOLS,
      maxTokens: 1024,
      temperature: 0.3,
    });
    // Defensively strip <think>…</think> reasoning blocks before we ever
    // consider shipping the text to a customer. Some providers (MiniMax
    // fallback, Anthropic extended-thinking) leak these when max_tokens
    // is hit mid-reasoning.
    const aiResponse = {
      ...aiResponseRaw,
      text: stripThinkTags(aiResponseRaw.text ?? ''),
    };

    // Execute tool calls against the cloned draft, collect signals.
    let wantsConfirm = false;
    let wantsCancel = false;
    let wantsMenuLink = false;
    let clarification: { question: string; field: string } | null = null;
    // Name resolution order:
    //   1. Whatever set_customer_name grabbed earlier this session
    //   2. What the caller told us last session (CallerMemory.contactName,
    //      read from Contact.name) — so returning customers don't need
    //      to re-state their name, and the Order row still gets stamped
    //   3. null — the prompt will prompt for it
    let capturedName: string | null =
      (currentState?.customerName as string | null | undefined) ??
      callerMemory?.contactName ??
      null;
    const toolErrors: string[] = [];
    // Messages from mutation results that should surface to the customer
    // — e.g. "skipped: Calamansi Sizzler: 'Sour Lemon' isn't a valid
    // option". Distinct from toolErrors (those are hard failures).
    const mutationNotices: string[] = [];
    let anyMutation = false;

    for (const call of aiResponse.toolCalls) {
      let result: ToolResult;
      switch (call.name) {
        case 'add_items':
          result = handleAddItems(draft, tenantContext.menuItems, call.input);
          break;
        case 'add_items_for_person':
          result = handleAddItemsForPerson(draft, tenantContext.menuItems, call.input);
          break;
        case 'remove_item':
          result = handleRemoveItem(draft, call.input);
          break;
        case 'update_quantity':
          result = handleUpdateQuantity(draft, call.input);
          break;
        case 'set_pickup_time':
          result = handleSetPickupTime(draft, call.input);
          break;
        case 'set_order_notes':
          result = handleSetOrderNotes(draft, call.input);
          break;
        case 'confirm_order':
          // Gate: require explicit user YES-like text in this turn.
          if (CONFIRM_RE.test(inboundMessage)) {
            wantsConfirm = true;
            result = { ok: true, kind: 'confirm' };
          } else {
            result = { ok: false, error: 'customer did not explicitly confirm' };
          }
          break;
        case 'cancel_order':
          // Gate: require explicit user cancel-intent in this turn.
          // Otherwise Claude can kill the whole cart over a typo it
          // couldn't parse — we've seen this in the wild.
          if (CANCEL_RE.test(inboundMessage)) {
            wantsCancel = true;
            result = { ok: true, kind: 'cancel' };
          } else {
            result = { ok: false, error: 'customer did not explicitly ask to cancel' };
          }
          break;
        case 'send_menu_link':
          wantsMenuLink = true;
          result = { ok: true, kind: 'menu_link' };
          break;
        case 'reorder_last': {
          const r = handleReorderLast(draft, tenantContext.menuItems, callerMemory?.lastOrderItems);
          if (r.ok) anyMutation = true;
          result = r;
          break;
        }
        case 'set_customer_name': {
          const r = handleSetCustomerName(call.input);
          if (r.ok && r.kind === 'customer_name') {
            capturedName = r.name;
            result = { ok: true, kind: 'customer_name', name: r.name };
          } else {
            result = r;
          }
          break;
        }
        case 'ask_clarification':
          result = handleAskClarification(call.input);
          if (result.ok && result.kind === 'clarification') {
            clarification = { question: result.question, field: result.field };
          }
          break;
        default:
          result = { ok: false, error: `unknown tool ${call.name}` };
      }
      if (!result.ok) toolErrors.push(`${call.name}: ${result.error}`);
      else if (result.kind === 'mutated') {
        anyMutation = true;
        if (result.message && result.message.startsWith('skipped:')) {
          mutationNotices.push(result.message);
        }
      }
    }

    // ── LLM-FAILED-TO-CAPTURE-PICKUP SAFETY NET ──
    // When we just asked "what time would you like pickup?" (flowStep ===
    // 'PICKUP_TIME' or pendingClarification.field === 'pickup_time') and
    // the customer responds with a short time-phrase like "asap",
    // "tuesday 12pm", "11:30am tuesday", "schedule for tuesday 12pm",
    // Claude sometimes doesn't call set_pickup_time (the message is too
    // short/ambiguous to trip the tool routing). Without this the cart
    // stays stuck with null pickupTime forever and the closed-hours
    // confirm gate re-asks in a loop.
    // Pickup was implicitly or explicitly asked for when:
    //  - we routed to the dedicated PICKUP_TIME step
    //  - we attached a pickup_time clarification
    //  - the cart already has items but no pickup time (the fallback
    //    reply in the prior turn ended with "What time pickup?"), so
    //    a short time-phrase reply is almost certainly the answer.
    const wasAskedForPickup =
      currentState?.flowStep === 'PICKUP_TIME' ||
      currentState?.pendingClarification?.field === 'pickup_time' ||
      (currentState?.flowStep === 'ORDER_CONFIRM' &&
        !currentState?.orderDraft?.pickupTime &&
        (currentState?.orderDraft?.items?.length ?? 0) > 0);
    let pickupParseFailed = false;
    if (wasAskedForPickup && !draft.pickupTime) {
      const parsed = parsePickupPhrase(inboundMessage);
      if (parsed) {
        draft.pickupTime = parsed;
        anyMutation = true;
      } else if (inboundMessage.trim().length <= 60) {
        // Short reply to "what time pickup?" that doesn't look like any
        // time phrase we recognize. Flag for a clearer re-ask below so
        // the customer doesn't silently loop.
        //
        // HOWEVER: don't fake-out on obvious questions. Real-world
        // repro — customer in ORDER_CONFIRM asked "what happened to my
        // other orders?" and we replied "Sorry, I couldn't understand
        // that pickup time" because flowStep was ORDER_CONFIRM + no
        // pickup + items>0. Questions are never pickup-time answers.
        const looksLikeQuestion =
          /\?\s*$/.test(inboundMessage.trim()) ||
          /^\s*(what|where|why|how|when|who|can\s+(i|you|we)|do\s+you|does|did|is\s+it|are\s+you)\b/i.test(inboundMessage);
        // Also don't fake-out on bare acknowledgments. Real-world
        // repros from this transcript:
        //   - Bot: "Added: ... What time would you like to pick up?"
        //     then (after an unrelated pizza-not-on-menu exchange)
        //     customer: "ah ok" → we replied "Sorry, I couldn't
        //     understand that pickup time." The customer wasn't
        //     answering the pickup prompt, they were acknowledging
        //     the pizza reply.
        //   - Bot: "We're currently closed... What time...?" customer:
        //     "yes" → same bogus failure reply. "yes" is a confirm-ish
        //     filler, not a pickup attempt.
        // Letting these fall through to the normal reply path means
        // the bot re-asks naturally ("What time would you like to
        // pick up?") instead of scolding the customer for not giving
        // a time they never tried to give.
        const looksLikeAck =
          /^\s*(ah+\s*)?(ok(ay)?|k|alr(ight)?|sure|cool|nice|great|thanks?|thx|ty|got it|mhm+|hmm+|oh+|aah+|ahh+|yes|yeah|yep|yup|ya|yass+|no|nope|nah)\b\s*[.!?]*\s*$/i.test(inboundMessage.trim());
        if (!looksLikeQuestion && !looksLikeAck) pickupParseFailed = true;
      }
    }

    // ── LLM-FAILED-TO-ADD-ITEMS SAFETY NET ──
    // Multilingual/verbose messages sometimes cause the LLM to capture
    // pickup time but drop the add_items tool call — the order phrase
    // is there, but buried under enough non-English tokens that tool
    // routing flakes. Since findItemPhraseMatches already identified
    // exact-phrase menu hits deterministically, fall back to adding
    // those items ourselves. Quantity is inferred from the nearest
    // preceding integer (within 4 tokens); defaults to 1.
    //
    // Only runs when the LLM added NOTHING this turn — we never
    // second-guess a live add_items call. If the customer is clarifying
    // an already-added item, the cart won't be empty and we skip.
    // Tracks whether the safety net actually added any items this turn.
    // If it did AND the LLM separately called ask_clarification about
    // those same items being unavailable (common failure mode on
    // verbose multilingual input: LLM hallucinates "we don't have
    // lumpia prito" while the menu clearly lists it), we need to
    // discard the stale clarification so the reply reflects the real
    // state of the cart.
    let safetyNetAddedItems = false;
    if (!anyMutation || draft.items.length === 0) {
      const phraseHits = findItemPhraseMatches(inboundMessage, tenantContext.menuItems);
      if (phraseHits.length > 0) {
        // Tokenize the inbound for quantity lookup. Lowercase + strip
        // punctuation; keep digit and word tokens.
        // Tokenize AND apply the same Tagalog "-ng" ligature normalization
        // the matcher uses, so "lumpiang" collapses to "lumpia" for the
        // purposes of anchor finding. Keeps the raw token count identical
        // (positions stay aligned with the raw message) — we only rewrite
        // each token in place.
        const tokens = inboundMessage
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => t.replace(/(\w)ng$/, '$1'));
        // Track which token indices have already been claimed by a
        // previous hit's phrase so multi-item messages ("2 lumpia
        // prito and 3 lumpia regular") don't both anchor on the first
        // "lumpia" and inherit the wrong quantity.
        const claimed = new Set<number>();
        for (const hit of phraseHits) {
          const alreadyInCart = draft.items.some((l) => l.menuItemId === hit.item.id);
          if (alreadyInCart) continue;

          const phraseTokens = hit.phrase.split(/\s+/).filter(Boolean);
          // Strict anchor: find a window of phraseTokens.length
          // consecutive tokens that contains ALL phrase tokens (with all
          // positions unclaimed). This prevents "2 lumpia prito and 3
          // lumpia regular" from anchoring A1="lumpia regular" on the
          // first "lumpia" — since that window is [lumpia, prito] which
          // doesn't contain "regular".
          let anchor = -1;
          for (let i = 0; i + phraseTokens.length <= tokens.length; i++) {
            let allUnclaimed = true;
            for (let k = 0; k < phraseTokens.length; k++) {
              if (claimed.has(i + k)) { allUnclaimed = false; break; }
            }
            if (!allUnclaimed) continue;
            const windowSet = new Set(tokens.slice(i, i + phraseTokens.length));
            const allPresent = phraseTokens.every((pt) => windowSet.has(pt));
            if (allPresent) {
              anchor = i;
              for (let k = 0; k < phraseTokens.length; k++) claimed.add(i + k);
              break;
            }
          }
          let quantity = 1;
          if (anchor > 0) {
            // Word-numbers ("two kanto fries for the kids") are just as
            // common in natural phrasing as digit-numbers. Map common
            // ones so the safety net doesn't silently default to 1 when
            // the customer spelled the quantity out.
            const WORD_NUM: Record<string, number> = {
              one: 1, two: 2, three: 3, four: 4, five: 5,
              six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
              eleven: 11, twelve: 12, dozen: 12,
              a: 1, an: 1, couple: 2, pair: 2,
            };
            for (let j = anchor - 1; j >= Math.max(0, anchor - 4); j--) {
              if (claimed.has(j)) continue;
              const tok = tokens[j];
              const asDigit = parseInt(tok, 10);
              if (!isNaN(asDigit) && asDigit >= 1 && asDigit <= 50) {
                quantity = asDigit;
                claimed.add(j);
                break;
              }
              const asWord = WORD_NUM[tok];
              if (asWord != null) {
                quantity = asWord;
                claimed.add(j);
                break;
              }
            }
          }

          const result = handleAddItems(
            draft,
            tenantContext.menuItems,
            { items: [{ menu_item_id: hit.item.id, quantity, modifiers: [] }] },
          );
          if (result.ok && result.kind === 'mutated') {
            anyMutation = true;
            safetyNetAddedItems = true;
          }
        }
      }
    }

    // ── PICKUP-TIME & NAME SAFETY NET ──
    // Companion to the items safety net above. When the LLM punts on a
    // dense compound first-turn message ("my husband wants 3 lumpia
    // prito, I want 2 lumpia sariwa, and two kanto fries for the kids,
    // pickup at 7pm friday, name Cabral") it tends to drop EVERYTHING —
    // items, pickup time, and name — not just items. Since we just
    // rebuilt the cart deterministically, try the same for pickup + name
    // so the R13 acceptance scenario resolves in one round-trip instead
    // of three.
    if (safetyNetAddedItems) {
      if (!draft.pickupTime) {
        // Look for "pickup at <phrase>" / "pick up at <phrase>" /
        // "for pickup <phrase>" segments. Scope the candidate to the
        // current comma-delimited clause so we don't swallow the
        // trailing "name Cabral" portion.
        const pickupMatch = inboundMessage.match(
          /\b(?:pick\s*up|pickup)\s+(?:at\s+|for\s+)?([^,.!?;\n]+)/i,
        );
        if (pickupMatch) {
          const candidate = pickupMatch[1]
            .replace(/\s+(?:name|customer|for\s+(?:me|us|the))\b.*$/i, '')
            .trim();
          const parsed = parsePickupPhrase(candidate);
          if (parsed) draft.pickupTime = parsed;
        }
      }
      if (!capturedName) {
        // "name Cabral" / "name: Cabral" / "under Cabral" / "for Cabral".
        // Require a capital-letter first char to avoid matching stray
        // lowercase words; accept up to two name tokens.
        const nameMatch =
          inboundMessage.match(
            /\b(?:name|under|for)\s*:?\s*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)(?=[,.!?;\s]|$)/,
          );
        if (nameMatch) {
          const candidate = nameMatch[1].trim();
          // Guard against capturing common sentence-initial words that
          // happen to follow "for" ("for the kids", "for me", "for Us").
          if (!/^(The|A|An|Me|Us|My|Our|You|Your|Him|Her|Them|Tomorrow|Today|Tonight|Friday|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday)$/i.test(candidate)) {
            capturedName = candidate;
          }
        }
      }
    }

    // If the safety net added items that the LLM's ask_clarification
    // falsely claimed were unavailable, discard the clarification.
    // Heuristic: clarification was about item availability if its
    // question mentions "not on the menu" / "don't have" / "don't
    // carry" / Tagalog "wala kami" / Spanish "no tenemos". Safer than
    // blanket-discarding every clarification — we still want to
    // preserve legitimate ones ("which size?", "spicy or regular?").
    if (safetyNetAddedItems && clarification) {
      const q = clarification.question.toLowerCase();
      const saysUnavailable =
        /\b(not on (the |our )?menu|don'?t (have|carry|offer|serve)|we don'?t|isn'?t on|no (esta|tenemos)|wala kami|hindi namin|wala po)\b/i.test(q);
      if (saysUnavailable) {
        clarification = null;
        // Also blank the LLM's text reply — it's saying the opposite of
        // what just happened. The fallback/echo path will rebuild.
        (aiResponse as { text: string }).text = '';
      }
    }

    // ── LLM-FAILED-TO-CONFIRM SAFETY NET ──
    // If the previous turn landed the customer in ORDER_CONFIRM (i.e.
    // we just showed the "Anything else, or ready to confirm?" prompt)
    // and their current message is an unambiguous commit phrase, commit
    // even if the LLM failed to call confirm_order. Real-world repro:
    // "ready to confirm", "ready", "all set" — the LLM sometimes
    // interprets these as conversational acknowledgments and re-summarizes
    // the cart instead of committing. The CONFIRM_RE whole-message
    // anchor is our guardrail against false positives like "I'm ready
    // to add more" (which won't match because "to add more" isn't a
    // confirm token).
    if (
      !wantsConfirm &&
      !wantsCancel &&
      currentState?.flowStep === 'ORDER_CONFIRM' &&
      draft.items.length > 0 &&
      CONFIRM_RE.test(inboundMessage)
    ) {
      wantsConfirm = true;
    }

    // ── CANCEL ──
    if (wantsCancel) {
      const reply = (aiResponse.text || 'Order canceled. Text us again anytime!').slice(0, 320);
      return {
        nextState: buildBaseState(input, { items: [] }, { flowStep: 'ORDER_COMPLETE', customerName: capturedName }),
        smsReply: reply,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // ── MENU LINK ──
    if (wantsMenuLink) {
      const slug = tenantContext.tenantSlug;
      const menuUrl = slug
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.ringbacksms.com'}/m/${slug}`
        : null;
      const reply = (aiResponse.text && menuUrl ? `${aiResponse.text}\n${menuUrl}` : menuUrl ?? aiResponse.text ?? 'Menu link coming shortly.').slice(0, 320);
      return {
        nextState: buildBaseState(input, draft, { flowStep: currentState?.flowStep ?? 'MENU_DISPLAY', customerName: capturedName }),
        smsReply: reply,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // ── "yes" with empty cart — session expired ──
    // Customer left "ORDER_CONFIRM" in their state (or even without
    // it, just said "yes" out of the blue), state expired, cart is
    // empty. Without this branch we'd fall through to the fallback
    // reply ("What can I get started for you?") which ignores their
    // confirm intent entirely.
    if (wantsConfirm && draft.items.length === 0) {
      return {
        nextState: buildBaseState(input, draft, {
          flowStep: 'MENU_DISPLAY',
          customerName: capturedName,
        }),
        smsReply:
          "Looks like your cart is empty — want to place a new order? Tell me what you'd like.",
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // ── CONFIRM ──
    if (wantsConfirm && draft.items.length > 0) {
      // Refuse to lock in an order if we're closed AND the customer hasn't
      // specified a future-scheduled pickup. QA caught us happily accepting
      // "12:19 AM" as a pickup time at 12:19 AM when the restaurant was
      // closed — and then billing for it. If pickup references a future
      // day (tomorrow / day-of-week), let it through so scheduled orders
      // still work; otherwise ask them to schedule.
      const hours = tenantContext.hoursInfo;
      const pickupStrForHours = (draft.pickupTime ?? '').trim().toLowerCase();
      const pickupIsFutureScheduled =
        /\btomorrow\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat|sun)\b/i.test(pickupStrForHours);
      if (hours && hours.openNow === false && !pickupIsFutureScheduled) {
        const whenOpen = hours.nextOpenDisplay
          ? ` We open ${hours.nextOpenDisplay}.`
          : '';
        return {
          nextState: buildBaseState(input, draft, {
            flowStep: 'PICKUP_TIME',
            customerName: capturedName,
            pendingClarification: {
              field: 'pickup_time',
              question: `We're currently closed.${whenOpen} What time would you like to schedule pickup for?`,
              askedAt: Date.now(),
            },
          }),
          smsReply: `We're currently closed, so I can't place this right now.${whenOpen} What time would you like to schedule pickup for?`.slice(0, 320),
          sideEffects: [],
          flowType: FlowType.ORDER,
        };
      }
      if (!draft.pickupTime) {
        // Don't commit without a pickup time — ask for it.
        return {
          nextState: buildBaseState(input, draft, {
            flowStep: 'PICKUP_TIME',
            customerName: capturedName,
            pendingClarification: {
              field: 'pickup_time',
              question: 'What time would you like to pick up?',
              askedAt: Date.now(),
            },
          }),
          smsReply: (aiResponse.text || 'What time would you like to pick up?').slice(0, 320),
          sideEffects: [],
          flowType: FlowType.ORDER,
        };
      }

      const totals = computeOrderTotals(draft, {
        salesTaxRate: (tenantContext.config as { salesTaxRate?: number | null }).salesTaxRate,
        passStripeFeesToCustomer: (tenantContext.config as { passStripeFeesToCustomer?: boolean | null }).passStripeFeesToCustomer,
      });
      const total = totals.total;
      const orderItems = draft.items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        selectedModifiers: i.selectedModifiers,
      }));
      // Human-readable breakdown line when tax/fee apply. Otherwise keep
      // just "Total: $X" to avoid cluttering the SMS.
      const breakdownParts: string[] = [];
      if (totals.tax > 0) breakdownParts.push(`Tax $${totals.tax.toFixed(2)}`);
      if (totals.fee > 0) breakdownParts.push(`Processing $${totals.fee.toFixed(2)}`);
      const totalLine = breakdownParts.length
        ? `Subtotal $${totals.subtotal.toFixed(2)}, ${breakdownParts.join(', ')}. Total $${total.toFixed(2)}.`
        : `Total: $${total.toFixed(2)}.`;

      // Queue-aware ETA. Non-fatal: if the count fn errors, treat queue=0.
      const queueCount = input.getActiveOrderCount
        ? await input.getActiveOrderCount(tenantContext.tenantId).catch(() => 0)
        : 0;
      const itemCount = draft.items.reduce((s, i) => s + i.quantity, 0);
      const prepMinutes = calculateFlowPrepTime(
        {
          defaultPrepTimeMinutes: (tenantContext.config as { defaultPrepTimeMinutes?: number | null }).defaultPrepTimeMinutes,
          largeOrderThresholdItems: (tenantContext.config as { largeOrderThresholdItems?: number | null }).largeOrderThresholdItems,
          largeOrderExtraMinutes: (tenantContext.config as { largeOrderExtraMinutes?: number | null }).largeOrderExtraMinutes,
          prepTimeOverrides: (tenantContext.config as { prepTimeOverrides?: unknown }).prepTimeOverrides,
          timezone: tenantContext.config.timezone,
          minutesPerQueuedOrder: (tenantContext.config as { minutesPerQueuedOrder?: number | null }).minutesPerQueuedOrder,
        },
        itemCount,
        queueCount,
      );
      // Decide what "ready time" phrasing to use.
      // - If the customer said ASAP / now / no time → compute ETA from prep.
      // - If they scheduled a concrete time (contains a digit, "am", "pm",
      //   or words like "tomorrow", "tonight") → echo their pickupTime so
      //   we don't contradict them with a now-based ETA.
      const pickupStr = (draft.pickupTime ?? '').trim();
      const pickupLooksConcrete =
        pickupStr.length > 0 &&
        !/^(asap|now|immediately|whenever|any ?time|soon)$/i.test(pickupStr) &&
        /\d|am\b|pm\b|noon|midnight|tomorrow|tonight|morning|afternoon|evening/i.test(pickupStr);

      const computedReadyAt =
        prepMinutes != null
          ? formatReadyTime(prepMinutes, tenantContext.config.timezone)
          : null;
      const queuePhrase =
        queueCount >= 1
          ? `${queueCount} order${queueCount === 1 ? '' : 's'} ahead — `
          : '';
      const etaPhrase = pickupLooksConcrete
        ? `ready for ${pickupStr} pickup. `
        : computedReadyAt
          ? `ready around ${computedReadyAt}. `
          : '';

      if (tenantContext.config.requirePayment) {
        // DON'T tell the customer the order is placed — payment hasn't
        // happened yet. The Stripe webhook fires the "order placed"
        // confirmation after checkout.session.completed.
        const paymentReply =
          aiResponse.text && !/placed|ready for you/i.test(aiResponse.text)
            ? aiResponse.text
            : `${queuePhrase}${etaPhrase}${totalLine} You'll get a payment link shortly — your order is confirmed once paid.`;
        const ownerNameLine = capturedName ? `\nName: ${capturedName}` : '';
        // Emit SAVE_ORDER FIRST so CREATE_PAYMENT_LINK has context.orderId
        // to build a /pay/{orderId} tip-jar interstitial link. Order is
        // persisted with paymentStatus=PENDING; createOrder skips the POS
        // push for pending orders, and the Stripe webhook triggers it
        // after payment confirms.
        // Clear the draft out of nextState once the order is locked in for
        // payment — AWAITING_PAYMENT is terminal from the conversation's
        // perspective (the Stripe webhook takes over from here). Leaving
        // items in state caused the NEXT order attempt to start with the
        // prior cart's items, compounding orders the customer never placed.
        return {
          nextState: buildBaseState(input, { items: [] }, {
            flowStep: 'AWAITING_PAYMENT',
            customerName: capturedName,
          }),
          smsReply: paymentReply.slice(0, 320),
          sideEffects: [
            {
              type: 'SAVE_ORDER',
              payload: {
                items: orderItems,
                pickupTime: draft.pickupTime,
                notes: draft.notes ?? null,
                total,
                subtotal: totals.subtotal,
                taxAmount: totals.tax,
                feeAmount: totals.fee,
                customerName: capturedName,
                paymentStatus: 'PENDING',
              },
            },
            {
              type: 'CREATE_PAYMENT_LINK',
              payload: {
                items: orderItems,
                total,
                subtotal: totals.subtotal,
                taxAmount: totals.tax,
                feeAmount: totals.fee,
                pickupTime: draft.pickupTime,
                notes: draft.notes ?? null,
                customerName: capturedName,
              },
            },
            {
              type: 'NOTIFY_OWNER',
              payload: {
                subject: `Pending Order from ${input.callerPhone}`,
                message: `New order pending payment!${ownerNameLine}\n${buildOwnerOrderSummary(draft.items)}\nTotal: $${total.toFixed(2)}\nPickup: ${draft.pickupTime}`,
                channel: 'sms',
              },
            },
          ],
          flowType: FlowType.ORDER,
        };
      }

      // Mark lines confirmed
      for (const line of draft.items) line.confirmed = true;
      const baseReply =
        aiResponse.text ||
        `Your order has been placed! ${queuePhrase}${etaPhrase}${totalLine} We'll text you when it's ready!`;

      const ownerNameLine = capturedName ? `\nName: ${capturedName}` : '';
      // Clear the draft out of nextState once the order is committed —
      // ORDER_COMPLETE is terminal. Leaving items in state caused the
      // NEXT order attempt to start with the prior cart's items, which
      // billed customers for compounded orders they never placed.
      return {
        nextState: buildBaseState(input, { items: [] }, {
          flowStep: 'ORDER_COMPLETE',
          customerName: capturedName,
        }),
        smsReply: baseReply.slice(0, 320),
        sideEffects: [
          {
            type: 'SAVE_ORDER',
            payload: {
              items: orderItems,
              pickupTime: draft.pickupTime,
              notes: draft.notes ?? null,
              total,
              subtotal: totals.subtotal,
              taxAmount: totals.tax,
              feeAmount: totals.fee,
              customerName: capturedName,
            },
          },
          {
            type: 'NOTIFY_OWNER',
            payload: {
              subject: `New Order from ${input.callerPhone}`,
              message: `New order received!${ownerNameLine}\n${buildOwnerOrderSummary(draft.items)}\nTotal: $${total.toFixed(2)}\nPickup: ${draft.pickupTime}`,
              channel: 'sms',
            },
          },
        ],
        flowType: FlowType.ORDER,
      };
    }

    // ── CLARIFICATION or mutation only ──
    const hasAnyToolCall = aiResponse.toolCalls.length > 0;
    if (!hasAnyToolCall && !aiResponse.text && !anyMutation) {
      // No signal at all AND our deterministic safety nets didn't
      // mutate anything — let the regex flow handle it this turn.
      // (Previously: checked only LLM output, which discarded
      // safety-net-added items when the LLM also stayed silent.)
      return processOrderFlow(input);
    }

    // If Claude returned tool calls without accompanying text (common when
    // stop_reason === 'tool_use'), build a deterministic summary so we
    // never reply with bare "Got it."
    function buildFallbackReply(): string {
      if (clarification?.question) return clarification.question;
      // Empty cart but pickup time just set → they're ready to order.
      // Warmer than "How can I help with your order?" — feels like a
      // person taking a verbal order at the counter.
      if (!draft.items.length) {
        return draft.pickupTime
          ? 'OK, what can I get you?'
          : 'What can I get started for you?';
      }
      const summary = draft.items
        .map((i) => {
          const mods = i.selectedModifiers?.length
            ? ` (${i.selectedModifiers.map((m) => m.modifierName).join(', ')})`
            : '';
          return `${i.quantity}× ${i.name}${mods}`;
        })
        .join(', ');
      const total = computeTotal(draft).toFixed(2);
      const needsPickup = !draft.pickupTime;
      const next = needsPickup
        ? 'What time would you like to pick up?'
        : 'Anything else, or ready to confirm?';
      return `Added: ${summary}. Total $${total}. ${next}`;
    }

    // Echo captured pickup time explicitly so the customer knows their
    // time landed. Fires whether Claude's set_pickup_time tool captured
    // it OR our deterministic fallback parser did — both are "silent
    // advance" from the customer's perspective without an echo. QA has
    // flagged this UX gap in every round.
    const pickupWasCapturedThisTurn =
      pickupWasEmptyOnEntry && !!draft.pickupTime;
    let baseReply = (aiResponse.text || buildFallbackReply());
    if (pickupParseFailed && !pickupWasCapturedThisTurn) {
      // Override the LLM reply — if it silently advanced to "anything
      // else?" the customer never got feedback that their time didn't
      // land. This keeps them from looping on the closed-hours gate.
      baseReply =
        "Sorry, I couldn't understand that pickup time. Try something like \"tomorrow at noon\", \"Tuesday 12pm\", or \"ASAP\".";
    }
    if (pickupWasCapturedThisTurn && draft.pickupTime) {
      // If Claude's own reply already echoes the time, trust it.
      // Otherwise force an explicit echo so the customer sees their
      // time landed.
      const replyHasTimeLiteral = baseReply.toLowerCase().includes(draft.pickupTime.toLowerCase());
      const enIdiomHit = /\b(got it|scheduled|pickup (at|for))\b/i.test(baseReply);
      const replyMentionsTime = replyHasTimeLiteral || enIdiomHit;
      if (!replyMentionsTime) {
        const summary = draft.items
          .map((i) => {
            // Menu items already encode their customer-facing code
            // ("#A4 Lumpia Prito") inside the name field itself — that's
            // how tenants configure them. Don't prepend anything extra:
            // the previous `#${mi.id}` prefix leaked the internal UUID
            // into customer replies because MenuItem.id is a DB UUID,
            // not the public "A4" code.
            return `${i.quantity}× ${i.name}`;
          })
          .join(', ');
        const total = computeTotal(draft).toFixed(2);
        const head = summary
          ? `Got it — pickup ${draft.pickupTime}. ${summary}. Total $${total}.`
          : `Got it — pickup ${draft.pickupTime}.`;
        const tail = summary ? ' Ready to confirm?' : ' What can I get you?';
        baseReply = `${head}${tail}`;
      }
    }

    // Surface dropped modifiers as a customer-visible postscript.
    // Previously, when `resolveModifiers` failed on an item (e.g.
    // "gluten-free bun" not on menu), we added the item WITHOUT
    // modifiers and silently swallowed the failure — customer didn't
    // know their request didn't land. For allergy-class requests this
    // is a safety issue.
    //
    // Parse the raw "skipped: Name: '<mod>' isn't a valid option" lines
    // into a friendlier "Couldn't add X to Y" format.
    function formatNotices(): string {
      if (mutationNotices.length === 0) return '';
      const dropped: string[] = [];
      for (const n of mutationNotices) {
        // Strip "skipped: " prefix and take each semicolon-separated
        // entry
        const parts = n.replace(/^skipped:\s*/, '').split(';').map((s) => s.trim()).filter(Boolean);
        for (const p of parts) {
          // Match "ItemName: '<modifier>' isn't a valid option"
          const m = p.match(/^([^:]+):\s*"?([^"']+)"?\s+isn'?t a valid option/i);
          if (m) {
            dropped.push(`"${m[2]}" on ${m[1]}`);
          } else {
            dropped.push(p);
          }
        }
      }
      if (dropped.length === 0) return '';
      return ` (couldn't find ${dropped.join(', ')} — let me know if that's important)`;
    }

    const reply = (baseReply + formatNotices()).slice(0, 320);

    if (toolErrors.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[orderAgent] tool errors', toolErrors.join('; '));
    }

    const nextStep =
      clarification
        ? (currentState?.flowStep ?? 'MENU_DISPLAY')
        : draft.items.length
          ? 'ORDER_CONFIRM'
          : (currentState?.flowStep ?? 'MENU_DISPLAY');

    return {
      nextState: buildBaseState(input, draft, {
        flowStep: nextStep,
        customerName: capturedName,
        pendingClarification: clarification
          ? { field: clarification.field, question: clarification.question, askedAt: Date.now() }
          : null,
      }),
      smsReply: reply,
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  } catch (err: any) {
    // Catch-all: never leave the customer hanging.
    // eslint-disable-next-line no-console
    console.warn('[orderAgent] failed, falling back to regex flow', err?.message);
    return processOrderFlow(input);
  }
}
