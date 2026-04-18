import type { CallerState, OrderDraft } from '@ringback/shared-types';
import { FlowType } from '@ringback/shared-types';
import type { FlowInput, FlowOutput } from '../types';
import { processOrderFlow } from '../flows/orderFlow';
import {
  ORDER_AGENT_TOOLS,
  computeTotal,
  handleAddItems,
  handleAskClarification,
  handleRemoveItem,
  handleSetOrderNotes,
  handleSetPickupTime,
  handleUpdateQuantity,
  type ToolResult,
} from './orderAgentTools';
import { filterMenuForPrompt } from './menuFilter';
import { buildOrderAgentSystemPrompt } from './buildAgentPrompt';
import { calculateFlowPrepTime, formatReadyTime } from '../flows/orderFlow';

// Cheap heuristic: did the customer just explicitly confirm?
const CONFIRM_RE = /\b(yes|yep|yeah|yup|confirm|go ahead|place (it|the order)|that'?s right|correct|ok(ay)?|sure)\b/i;

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
    const filteredMenu = filterMenuForPrompt(
      tenantContext.menuItems,
      inboundMessage,
      recentMessages?.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ?? null,
      draft,
    );

    const systemPrompt = buildOrderAgentSystemPrompt({
      tenantContext,
      filteredMenu,
      draft,
      memory: callerMemory,
      pendingClarification: currentState?.pendingClarification ?? null,
    });

    const aiResponse = await chatWithToolsFn({
      systemPrompt,
      userMessage: inboundMessage,
      messageHistory: recentMessages?.slice(-6),
      tools: ORDER_AGENT_TOOLS,
      maxTokens: 1024,
      temperature: 0.3,
    });

    // Execute tool calls against the cloned draft, collect signals.
    let wantsConfirm = false;
    let wantsCancel = false;
    let wantsMenuLink = false;
    let clarification: { question: string; field: string } | null = null;
    const toolErrors: string[] = [];
    let anyMutation = false;

    for (const call of aiResponse.toolCalls) {
      let result: ToolResult;
      switch (call.name) {
        case 'add_items':
          result = handleAddItems(draft, tenantContext.menuItems, call.input);
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
          wantsCancel = true;
          result = { ok: true, kind: 'cancel' };
          break;
        case 'send_menu_link':
          wantsMenuLink = true;
          result = { ok: true, kind: 'menu_link' };
          break;
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
      else if (result.kind === 'mutated') anyMutation = true;
    }

    // ── CANCEL ──
    if (wantsCancel) {
      const reply = (aiResponse.text || 'Order canceled. Text us again anytime!').slice(0, 320);
      return {
        nextState: buildBaseState(input, { items: [] }, { flowStep: 'ORDER_COMPLETE' }),
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
        nextState: buildBaseState(input, draft, { flowStep: currentState?.flowStep ?? 'MENU_DISPLAY' }),
        smsReply: reply,
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

      const total = computeTotal(draft);
      const orderItems = draft.items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        selectedModifiers: i.selectedModifiers,
      }));

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
      const readyAt =
        prepMinutes != null
          ? formatReadyTime(prepMinutes, tenantContext.config.timezone)
          : null;
      const queuePhrase =
        queueCount >= 1
          ? `${queueCount} order${queueCount === 1 ? '' : 's'} ahead — `
          : '';
      const etaPhrase = readyAt ? `ready around ${readyAt}. ` : '';

      if (tenantContext.config.requirePayment) {
        // DON'T tell the customer the order is placed — payment hasn't
        // happened yet. The Stripe webhook fires the "order placed"
        // confirmation after checkout.session.completed.
        const paymentReply =
          aiResponse.text && !/placed|ready for you/i.test(aiResponse.text)
            ? aiResponse.text
            : `${queuePhrase}${etaPhrase}Total: $${total.toFixed(2)}. You'll get a payment link shortly — your order is confirmed once paid.`;
        return {
          nextState: buildBaseState(input, draft, { flowStep: 'AWAITING_PAYMENT' }),
          smsReply: paymentReply.slice(0, 320),
          sideEffects: [
            {
              type: 'CREATE_PAYMENT_LINK',
              payload: { items: orderItems, total, pickupTime: draft.pickupTime, notes: draft.notes ?? null },
            },
            {
              type: 'NOTIFY_OWNER',
              payload: {
                subject: `Pending Order from ${input.callerPhone}`,
                message: `New order pending payment!\n${buildOwnerOrderSummary(draft.items)}\nTotal: $${total.toFixed(2)}\nPickup: ${draft.pickupTime}`,
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
        `Your order has been placed! ${queuePhrase}${etaPhrase}Total: $${total.toFixed(2)}.`;

      return {
        nextState: buildBaseState(input, draft, { flowStep: 'ORDER_COMPLETE' }),
        smsReply: baseReply.slice(0, 320),
        sideEffects: [
          {
            type: 'SAVE_ORDER',
            payload: { items: orderItems, pickupTime: draft.pickupTime, notes: draft.notes ?? null, total },
          },
          {
            type: 'NOTIFY_OWNER',
            payload: {
              subject: `New Order from ${input.callerPhone}`,
              message: `New order received!\n${buildOwnerOrderSummary(draft.items)}\nTotal: $${total.toFixed(2)}\nPickup: ${draft.pickupTime}`,
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
      if (!draft.items.length) return 'How can I help with your order?';
      const summary = draft.items
        .map((i) => `${i.quantity}× ${i.name}`)
        .join(', ');
      const total = computeTotal(draft).toFixed(2);
      const needsPickup = !draft.pickupTime;
      const next = needsPickup
        ? 'What time would you like to pick up?'
        : 'Anything else, or ready to confirm?';
      return `Added: ${summary}. Total $${total}. ${next}`;
    }

    const reply = (aiResponse.text || buildFallbackReply()).slice(0, 320);

    const nextStep =
      clarification
        ? (currentState?.flowStep ?? 'MENU_DISPLAY')
        : draft.items.length
          ? 'ORDER_CONFIRM'
          : (currentState?.flowStep ?? 'MENU_DISPLAY');

    return {
      nextState: buildBaseState(input, draft, {
        flowStep: nextStep,
        pendingClarification: clarification
          ? { field: clarification.field, question: clarification.question, askedAt: Date.now() }
          : null,
      }),
      smsReply: reply + (toolErrors.length && !anyMutation ? '' : ''), // errors are logged below, not shown
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
