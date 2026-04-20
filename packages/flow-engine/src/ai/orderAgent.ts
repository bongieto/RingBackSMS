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
import { buildOrderAgentSystemPrompt } from './buildAgentPrompt';
import { calculateFlowPrepTime, formatReadyTime } from '../flows/orderFlow';

// Cheap heuristic: did the customer just explicitly confirm?
// Anchored to start-and-end of message so phrases like "I can confirm
// that's not right" or "yes but change X" don't accidentally commit the
// order. The whole message must be one or more confirm-phrase tokens
// back-to-back, so "yes", "yes confirm", "yeah go ahead", "ok sure",
// and "confirm please" all match. "yes but change X" does not (the
// trailing content doesn't match any confirm token).
const CONFIRM_TOKENS =
  '(?:yes|yep|yeah|yup|yess+|ya|yah|yas|confirm|confirmed|go ahead|place it|place the order|that\'?s right|correct|ok|okay|sure|sounds good|do it|let\'?s go|please|now|thanks|thx)';
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
        return {
          nextState: buildBaseState(input, draft, {
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
    if (!hasAnyToolCall && !aiResponse.text) {
      // No signal at all — let the regex flow handle it this turn
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

    const baseReply = (aiResponse.text || buildFallbackReply());

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
