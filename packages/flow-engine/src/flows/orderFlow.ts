import { FlowInput, FlowOutput, FlowStep } from '../types';
import { FlowType, OrderStatus } from '@ringback/shared-types';
import { CallerState, SideEffect } from '@ringback/shared-types';
import type { MenuItem, MenuItemModifierGroup } from '@ringback/shared-types';

interface PrepOverride {
  dayOfWeek: number;
  start: string;
  end: string;
  extraMinutes: number;
}

/**
 * Mirror of calculatePrepTime in apps/web/src/lib/server/services/orderService.ts.
 * Kept inline because the flow-engine package can't import from apps/web.
 * Returns total prep minutes or null if prep time isn't configured.
 */
function calculateFlowPrepTime(
  config: {
    defaultPrepTimeMinutes?: number | null;
    largeOrderThresholdItems?: number | null;
    largeOrderExtraMinutes?: number | null;
    prepTimeOverrides?: unknown;
    timezone?: string;
  },
  itemCount: number,
  now: Date = new Date(),
): number | null {
  if (config.defaultPrepTimeMinutes == null) return null;
  const base = config.defaultPrepTimeMinutes;
  const overrides: PrepOverride[] = Array.isArray(config.prepTimeOverrides)
    ? (config.prepTimeOverrides as PrepOverride[])
    : [];
  let overrideExtra = 0;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone ?? 'America/Chicago',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dayMap[wd] ?? 0;
    const currentMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
    for (const o of overrides) {
      if (o.dayOfWeek !== currentDay) continue;
      const [sH, sM] = o.start.split(':').map(Number);
      const [eH, eM] = o.end.split(':').map(Number);
      const sMin = sH * 60 + sM;
      const eMin = eH * 60 + eM;
      if (currentMin >= sMin && currentMin < eMin) overrideExtra += o.extraMinutes;
    }
  } catch {}
  const largeExtra =
    config.largeOrderThresholdItems != null &&
    itemCount >= config.largeOrderThresholdItems
      ? config.largeOrderExtraMinutes ?? 0
      : 0;
  return base + overrideExtra + largeExtra;
}

function formatReadyTime(minutesFromNow: number, timezone: string): string {
  const ready = new Date(Date.now() + minutesFromNow * 60_000);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(ready);
  } catch {
    return ready.toLocaleTimeString();
  }
}

function buildInitialState(input: FlowInput): CallerState {
  return {
    tenantId: input.tenantContext.tenantId,
    callerPhone: input.callerPhone,
    conversationId: input.currentState?.conversationId ?? null,
    currentFlow: FlowType.ORDER,
    flowStep: 'GREETING',
    orderDraft: null,
    lastMessageAt: Date.now(),
    messageCount: (input.currentState?.messageCount ?? 0) + 1,
    dedupKey: null,
  };
}

export async function processOrderFlow(input: FlowInput): Promise<FlowOutput> {
  const { tenantContext, inboundMessage, currentState, callerMemory } = input;
  const menuItems = tenantContext.menuItems.filter((m) => m.isAvailable);
  const upperMsg = inboundMessage.trim().toUpperCase();

  const step = (currentState?.flowStep as FlowStep) ?? 'GREETING';

  // Filter last-order items down to ones still on the current menu so we never
  // offer a reorder that contains removed/unavailable items.
  const reorderItems = (callerMemory?.lastOrderItems ?? []).filter((li) =>
    menuItems.some((m) => m.id === li.menuItemId)
  );
  const hasReorder = reorderItems.length > 0;

  // ── GREETING → MENU_DISPLAY (or reorder prompt) ─────────────────────────
  if (step === 'GREETING' || !currentState || currentState.currentFlow !== FlowType.ORDER) {
    const nextState: CallerState = {
      ...buildInitialState(input),
      flowStep: 'MENU_DISPLAY',
    };

    // Customer texted MENU as the very first message → jump straight to
    // the web menu URL instead of showing the "what can I get you" prompt.
    if (upperMsg === 'MENU') {
      const menuUrl = tenantContext.tenantSlug
        ? `https://ringbacksms.com/m/${tenantContext.tenantSlug}`
        : null;
      const reply = menuUrl
        ? `Here's our menu: ${menuUrl} — text your order back when ready!`
        : `Tell me what you'd like and I'll look it up!`;
      return {
        nextState,
        smsReply: reply,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // If there's no menu at all, fall back to the old message
    if (menuItems.length === 0) {
      return {
        nextState,
        smsReply: `Thanks for reaching out to ${tenantContext.tenantName}! Our menu is being updated. Please call us directly to place an order.`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // If the customer's very first message already looks like an order
    // (e.g. "2 lumpia, 1 pancit"), skip the greeting and jump straight to
    // item parsing. Also covers the case where Redis state was lost
    // mid-conversation and the next message comes in with no state.
    if (upperMsg !== 'ORDER' && upperMsg !== 'ORDERING' && upperMsg !== 'BUY') {
      const directItems = parseOrderItems(inboundMessage, menuItems);
      if (directItems.length > 0) {
        const draftItems = directItems.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          selectedModifiers: [] as Array<{ groupName: string; modifierName: string; priceAdjust: number }>,
        }));

        // Check for required modifier groups before confirming
        const customization = findNextCustomization(draftItems, menuItems, 0, 0);
        if (customization) {
          const { itemIndex, groupIndex, group, itemName } = customization;
          return {
            nextState: {
              ...nextState,
              flowStep: 'ITEM_CUSTOMIZATION',
              orderDraft: { items: draftItems },
              pendingCustomization: { itemIndex, groupIndex },
            },
            smsReply: buildCustomizationPrompt(itemName, group),
            sideEffects: [],
            flowType: FlowType.ORDER,
          };
        }

        const total = directItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const orderSummary = buildOrderSummary(draftItems);
        return {
          nextState: {
            ...nextState,
            flowStep: 'ORDER_CONFIRM',
            orderDraft: { items: draftItems },
          },
          smsReply: `Your order:\n${orderSummary}\nTotal: $${total.toFixed(2)}\n\nReply YES to confirm or NO to start over.`,
          sideEffects: [],
          flowType: FlowType.ORDER,
        };
      }
    }

    // Returning customer with a reusable last order → offer SAME shortcut
    if (hasReorder) {
      const summary = buildReorderSummary(reorderItems);
      const total = reorderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const firstName = callerMemory?.contactName?.split(' ')[0];
      const greet = firstName ? `Welcome back, ${firstName}!` : 'Welcome back!';
      return {
        nextState,
        smsReply: `${greet} Last time you ordered:\n${summary}\nTotal: $${total.toFixed(2)}\n\nReply SAME to reorder, tell me what you want, or text MENU for the full list.`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // New order — ask what they want instead of dumping the full menu.
    // Dumping a long menu via SMS fails on restaurants with 30+ items.
    // Customers who want to browse can text MENU for the web link.
    return {
      nextState,
      smsReply: `OK, what can I get you from ${tenantContext.tenantName}? Tell me your order (like "2 lumpia, 1 pancit") or text MENU for our full list.`,
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  // ── MENU_DISPLAY → ITEM_CUSTOMIZATION or ORDER_CONFIRM ──────────────────
  if (step === 'MENU_DISPLAY') {
    // SAME shortcut: hydrate orderDraft from the caller's last order and jump
    // straight to confirmation, skipping item selection and customization.
    if (upperMsg === 'SAME' && hasReorder) {
      const draftItems = reorderItems.map((li) => ({
        menuItemId: li.menuItemId,
        name: li.name,
        quantity: li.quantity,
        price: li.price,
        selectedModifiers: [] as Array<{ groupName: string; modifierName: string; priceAdjust: number }>,
      }));
      const total = draftItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const orderSummary = buildOrderSummary(draftItems);

      const nextState: CallerState = {
        ...currentState,
        flowStep: 'ORDER_CONFIRM',
        orderDraft: { items: draftItems },
        lastMessageAt: Date.now(),
      };

      return {
        nextState,
        smsReply: `Got it — same as last time:\n${orderSummary}\nTotal: $${total.toFixed(2)}\n\nReply YES to confirm or NO to start over.`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // MENU shortcut: send the web menu URL instead of dumping the full menu
    // as SMS (which would exceed carrier length limits for many restaurants).
    if (upperMsg === 'MENU') {
      const menuUrl = tenantContext.tenantSlug
        ? `https://ringbacksms.com/m/${tenantContext.tenantSlug}`
        : null;
      const reply = menuUrl
        ? `Here's our menu: ${menuUrl} — text your order back when ready!`
        : 'Our menu page is being set up. Tell me what you want and I\'ll look it up!';
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: reply,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // CANCEL / NEVERMIND shortcut: exit the order flow cleanly so the
    // customer can ask questions or start fresh.
    if (upperMsg === 'CANCEL' || upperMsg === 'NEVERMIND' || upperMsg === 'NEVER MIND') {
      return {
        nextState: {
          ...currentState,
          currentFlow: null,
          flowStep: null,
          orderDraft: null,
          lastMessageAt: Date.now(),
        },
        smsReply: `No problem — order cancelled. Text me anytime when you're ready!`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    const parsedItems = parseOrderItems(inboundMessage, menuItems);

    if (parsedItems.length === 0) {
      // Show a few sample items + web menu URL so the customer knows
      // what's available without us having to dump the whole menu.
      const sample = menuItems
        .slice(0, 3)
        .map((m) => m.name)
        .join(', ');
      const menuUrl = tenantContext.tenantSlug
        ? `Full menu: https://ringbacksms.com/m/${tenantContext.tenantSlug}`
        : 'Text MENU for our full list';
      const reply = sample
        ? `Hmm, I didn't catch that. Try something like "2 ${menuItems[0]?.name}" — we have ${sample}${menuItems.length > 3 ? ', and more' : ''}. ${menuUrl}. Text CANCEL to stop.`
        : `I didn't catch that. Text MENU for our list or CANCEL to stop.`;
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: reply,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    const draftItems = parsedItems.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      selectedModifiers: [] as Array<{ groupName: string; modifierName: string; priceAdjust: number }>,
    }));

    // Check if any items need customization (have required modifier groups)
    const customization = findNextCustomization(draftItems, menuItems, 0, 0);

    if (customization) {
      const { itemIndex, groupIndex, group, itemName } = customization;
      const prompt = buildCustomizationPrompt(itemName, group);

      const nextState: CallerState = {
        ...currentState,
        flowStep: 'ITEM_CUSTOMIZATION',
        orderDraft: { items: draftItems },
        pendingCustomization: { itemIndex, groupIndex },
        lastMessageAt: Date.now(),
      };

      return {
        nextState,
        smsReply: prompt,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // No customization needed — go straight to confirm
    const total = parsedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderSummary = buildOrderSummary(draftItems);

    const nextState: CallerState = {
      ...currentState,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: { items: draftItems },
      lastMessageAt: Date.now(),
    };

    return {
      nextState,
      smsReply: `Your order:\n${orderSummary}\nTotal: $${total.toFixed(2)}\n\nReply YES to confirm or NO to start over.`,
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  // ── ITEM_CUSTOMIZATION → next customization or ORDER_CONFIRM ────────────
  if (step === 'ITEM_CUSTOMIZATION') {
    const pending = currentState.pendingCustomization;
    const orderDraft = currentState.orderDraft;

    if (!pending || !orderDraft) {
      // Shouldn't happen — fall through to confirm
      return buildConfirmResponse(currentState, menuItems);
    }

    const draftItem = orderDraft.items[pending.itemIndex];
    const menuItem = menuItems.find((m) => m.id === draftItem?.menuItemId);
    const groups = menuItem?.modifierGroups ?? [];
    const currentGroup = groups[pending.groupIndex];

    if (!draftItem || !currentGroup) {
      return buildConfirmResponse(currentState, menuItems);
    }

    // Parse user selection
    const selectedModifiers = parseModifierSelection(inboundMessage, currentGroup);

    if (selectedModifiers === null) {
      // Invalid input — re-ask
      const prompt = buildCustomizationPrompt(draftItem.name, currentGroup);
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply: `Sorry, I didn't understand. ${prompt}`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // Store selected modifiers
    const updatedItems = [...orderDraft.items];
    const updatedItem = { ...updatedItems[pending.itemIndex] };
    updatedItem.selectedModifiers = [
      ...(updatedItem.selectedModifiers ?? []),
      ...selectedModifiers,
    ];
    updatedItems[pending.itemIndex] = updatedItem;

    // Find next customization
    const nextCustomization = findNextCustomization(
      updatedItems,
      menuItems,
      pending.itemIndex,
      pending.groupIndex + 1,
    );

    if (nextCustomization) {
      const { itemIndex, groupIndex, group, itemName } = nextCustomization;
      const prompt = buildCustomizationPrompt(itemName, group);

      const nextState: CallerState = {
        ...currentState,
        flowStep: 'ITEM_CUSTOMIZATION',
        orderDraft: { ...orderDraft, items: updatedItems },
        pendingCustomization: { itemIndex, groupIndex },
        lastMessageAt: Date.now(),
      };

      return {
        nextState,
        smsReply: prompt,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    // All customization done — go to confirm
    const total = calculateTotal(updatedItems);
    const orderSummary = buildOrderSummary(updatedItems);

    const nextState: CallerState = {
      ...currentState,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: { ...orderDraft, items: updatedItems },
      pendingCustomization: null,
      lastMessageAt: Date.now(),
    };

    return {
      nextState,
      smsReply: `Your order:\n${orderSummary}\nTotal: $${total.toFixed(2)}\n\nReply YES to confirm or NO to start over.`,
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  // ── ORDER_CONFIRM → PICKUP_TIME or SERVICE_BOOKING ───────────────────────
  if (step === 'ORDER_CONFIRM') {
    if (upperMsg === 'YES' || upperMsg === 'Y' || upperMsg === 'CONFIRM') {
      // Check if any selected items require booking
      const draftItems = currentState.orderDraft?.items ?? [];
      const hasBookingItems = draftItems.some((draftItem) => {
        const menuItem = menuItems.find((m) => m.id === draftItem.menuItemId);
        return menuItem?.requiresBooking;
      });

      if (hasBookingItems) {
        const nextState: CallerState = {
          ...currentState,
          flowStep: 'SERVICE_BOOKING',
          lastMessageAt: Date.now(),
        };

        return {
          nextState,
          smsReply:
            'Great choice! This service requires an appointment. Please reply with your preferred date and time (e.g., "Tuesday at 2pm").',
          sideEffects: [],
          flowType: FlowType.ORDER,
        };
      }

      const nextState: CallerState = {
        ...currentState,
        flowStep: 'PICKUP_TIME',
        lastMessageAt: Date.now(),
      };

      return {
        nextState,
        smsReply:
          'Great! What time would you like to pick up your order? (e.g., "12:30pm", "in 30 minutes")',
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    if (upperMsg === 'NO' || upperMsg === 'N' || upperMsg === 'CANCEL') {
      const nextState: CallerState = {
        ...buildInitialState(input),
        flowStep: 'MENU_DISPLAY',
        orderDraft: null,
      };

      const menuText = menuItems
        .map((item, i) => {
          let line = `${i + 1}. ${item.name} - $${item.price.toFixed(2)}`;
          if (item.duration) line += ` (${item.duration} min)`;
          return line;
        })
        .join('\n');

      return {
        nextState,
        smsReply: `No problem! Here's our menu again:\n${menuText}\n\nWhat would you like?`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    return {
      nextState: { ...currentState, lastMessageAt: Date.now() },
      smsReply: 'Please reply YES to confirm your order or NO to start over.',
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  // ── PICKUP_TIME → ORDER_COMPLETE ─────────────────────────────────────────
  if (step === 'PICKUP_TIME') {
    const orderDraft = currentState.orderDraft;

    if (!orderDraft || orderDraft.items.length === 0) {
      const nextState: CallerState = {
        ...buildInitialState(input),
        flowStep: 'MENU_DISPLAY',
      };
      return {
        nextState,
        smsReply: "Something went wrong. Let's start over. " + buildMenuText(menuItems),
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    const total = calculateTotal(orderDraft.items);
    const pickupTime = inboundMessage.trim();

    const finalDraft = { ...orderDraft, pickupTime };

    const orderItems = orderDraft.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      selectedModifiers: item.selectedModifiers,
    }));

    if (tenantContext.config.requirePayment) {
      // Payment-first: don't save order yet, wait for payment
      const nextState: CallerState = {
        ...currentState,
        flowStep: 'AWAITING_PAYMENT',
        orderDraft: finalDraft,
        lastMessageAt: Date.now(),
      };

      return {
        nextState,
        smsReply: `Your total is $${total.toFixed(2)}. You'll receive a payment link shortly — your order will be confirmed once payment is received.`,
        sideEffects: [
          {
            type: 'CREATE_PAYMENT_LINK',
            payload: { items: orderItems, total, pickupTime, notes: null },
          },
          {
            type: 'NOTIFY_OWNER',
            payload: {
              subject: `Pending Order from ${input.callerPhone}`,
              message: `New order pending payment!\n${buildOwnerOrderSummary(orderDraft.items)}\nTotal: $${total.toFixed(2)}\nPickup: ${pickupTime}`,
              channel: 'sms',
            },
          },
        ],
        flowType: FlowType.ORDER,
      };
    }

    // No payment required: save order immediately
    const nextState: CallerState = {
      ...currentState,
      flowStep: 'ORDER_COMPLETE',
      orderDraft: finalDraft,
      lastMessageAt: Date.now(),
    };

    // Prep time estimate (restaurants & food trucks). Falls back to the
    // legacy message when the tenant hasn't configured prep time.
    const itemCount = orderItems.reduce((s: number, i: { quantity?: number }) => s + (i.quantity ?? 1), 0);
    const prepMinutes = calculateFlowPrepTime(
      {
        defaultPrepTimeMinutes: (tenantContext.config as { defaultPrepTimeMinutes?: number | null }).defaultPrepTimeMinutes,
        largeOrderThresholdItems: (tenantContext.config as { largeOrderThresholdItems?: number | null }).largeOrderThresholdItems,
        largeOrderExtraMinutes: (tenantContext.config as { largeOrderExtraMinutes?: number | null }).largeOrderExtraMinutes,
        prepTimeOverrides: (tenantContext.config as { prepTimeOverrides?: unknown }).prepTimeOverrides,
        timezone: tenantContext.config.timezone,
      },
      itemCount,
    );
    const readyLine =
      prepMinutes != null
        ? ` Ready for pickup around ${formatReadyTime(prepMinutes, tenantContext.config.timezone)}.`
        : ` Pickup time: ${pickupTime}.`;

    return {
      nextState,
      smsReply: `Your order has been placed!${readyLine} Total: $${total.toFixed(2)}. We'll have it ready for you! 🎉`,
      sideEffects: [
        {
          type: 'SAVE_ORDER',
          payload: { items: orderItems, pickupTime, notes: null, total },
        },
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: `New Order from ${input.callerPhone}`,
            message: `New order received!\n${buildOwnerOrderSummary(orderDraft.items)}\nTotal: $${total.toFixed(2)}\nPickup: ${pickupTime}`,
            channel: 'sms',
          },
        },
      ],
      flowType: FlowType.ORDER,
    };
  }

  // ── SERVICE_BOOKING → ORDER_COMPLETE ─────────────────────────────────────
  if (step === 'SERVICE_BOOKING') {
    const orderDraft = currentState.orderDraft;
    if (!orderDraft || orderDraft.items.length === 0) {
      const nextState: CallerState = { ...buildInitialState(input), flowStep: 'MENU_DISPLAY' };
      return { nextState, smsReply: "Something went wrong. Let's start over. " + buildMenuText(menuItems), sideEffects: [], flowType: FlowType.ORDER };
    }

    const total = calculateTotal(orderDraft.items);
    const requestedTime = inboundMessage.trim();
    const serviceNames = orderDraft.items.map((i) => i.name).join(', ');
    const serviceItems = orderDraft.items.map((item) => ({ menuItemId: item.menuItemId, name: item.name, quantity: item.quantity, price: item.price, selectedModifiers: item.selectedModifiers }));
    const serviceNotes = `Service booking: ${serviceNames}`;

    if (tenantContext.config.requirePayment) {
      // Payment-first: don't save order yet
      const nextState: CallerState = {
        ...currentState,
        flowStep: 'AWAITING_PAYMENT',
        orderDraft: { ...orderDraft, pickupTime: requestedTime },
        lastMessageAt: Date.now(),
      };

      return {
        nextState,
        smsReply: `Your total for ${serviceNames} is $${total.toFixed(2)}. You'll receive a payment link shortly — your booking will be confirmed once payment is received.`,
        sideEffects: [
          {
            type: 'CREATE_PAYMENT_LINK',
            payload: { items: serviceItems, total, pickupTime: requestedTime, notes: serviceNotes },
          },
          {
            type: 'NOTIFY_OWNER',
            payload: {
              subject: `Pending Booking from ${input.callerPhone}`,
              message: `New booking pending payment!\n${buildOwnerOrderSummary(orderDraft.items)}\nTotal: $${total.toFixed(2)}\nRequested: ${requestedTime}`,
              channel: 'sms',
            },
          },
        ],
        flowType: FlowType.ORDER,
      };
    }

    // No payment required: save order immediately
    const nextState: CallerState = {
      ...currentState,
      flowStep: 'ORDER_COMPLETE',
      orderDraft: { ...orderDraft, pickupTime: requestedTime },
      lastMessageAt: Date.now(),
    };

    return {
      nextState,
      smsReply: `Your appointment for ${serviceNames} has been requested for ${requestedTime}. Total: $${total.toFixed(2)}. We'll confirm your booking shortly!`,
      sideEffects: [
        { type: 'SAVE_ORDER', payload: { items: serviceItems, pickupTime: requestedTime, notes: serviceNotes, total } },
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: `Service Booking from ${input.callerPhone}`,
            message: `New booking request!\n${buildOwnerOrderSummary(orderDraft.items)}\nTotal: $${total.toFixed(2)}\nRequested: ${requestedTime}`,
            channel: 'sms',
          },
        },
      ],
      flowType: FlowType.ORDER,
    };
  }

  // ── AWAITING_PAYMENT (customer texted while waiting for payment) ──────────
  if (step === 'AWAITING_PAYMENT') {
    if (upperMsg === 'CANCEL' || upperMsg === 'NO') {
      const nextState: CallerState = {
        ...buildInitialState(input),
        flowStep: 'MENU_DISPLAY',
        orderDraft: null,
      };
      return {
        nextState,
        smsReply: `Order cancelled. Here's our menu again:\n${buildMenuText(menuItems)}`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    return {
      nextState: { ...currentState, lastMessageAt: Date.now() },
      smsReply: 'Your payment link has been sent. Complete payment to confirm your order. Text CANCEL to start over.',
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  // ── ORDER_COMPLETE (restart or fallback) ─────────────────────────────────
  if (step === 'ORDER_COMPLETE') {
    if (upperMsg.includes('ORDER') || upperMsg.includes('ANOTHER')) {
      const nextState: CallerState = {
        ...buildInitialState(input),
        flowStep: 'MENU_DISPLAY',
      };
      return {
        nextState,
        smsReply: `Sure! Here's our menu:\n${buildMenuText(menuItems)}`,
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    return {
      nextState: { ...currentState, lastMessageAt: Date.now() },
      smsReply: "Your order is confirmed! If you need anything else, just text us.",
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  // Default: restart order flow
  const nextState: CallerState = {
    ...buildInitialState(input),
    flowStep: 'MENU_DISPLAY',
  };

  return {
    nextState,
    smsReply: `Let's start your order! ${buildMenuText(menuItems)}`,
    sideEffects: [],
    flowType: FlowType.ORDER,
  };
}

// ── Helper types ─────────────────────────────────────────────────────────────

interface ParsedItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
}

interface DraftItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  selectedModifiers?: Array<{ groupName: string; modifierName: string; priceAdjust: number }>;
}

// ── Customization helpers ────────────────────────────────────────────────────

function findNextCustomization(
  draftItems: DraftItem[],
  menuItems: MenuItem[],
  startItemIndex: number,
  startGroupIndex: number,
): { itemIndex: number; groupIndex: number; group: MenuItemModifierGroup; itemName: string } | null {
  for (let i = startItemIndex; i < draftItems.length; i++) {
    const draftItem = draftItems[i];
    const menuItem = menuItems.find((m) => m.id === draftItem.menuItemId);
    const groups = menuItem?.modifierGroups ?? [];

    const gStart = i === startItemIndex ? startGroupIndex : 0;
    for (let g = gStart; g < groups.length; g++) {
      const group = groups[g];
      // Ask about required groups or groups with modifiers that have price adjustments
      if (group.required || group.modifiers.some((m) => m.priceAdjust > 0)) {
        return { itemIndex: i, groupIndex: g, group, itemName: draftItem.name };
      }
    }
  }
  return null;
}

function buildCustomizationPrompt(itemName: string, group: MenuItemModifierGroup): string {
  const isMultiple = group.selectionType === 'MULTIPLE';
  const modifierLines = group.modifiers.map((mod, idx) => {
    let line = `${idx + 1}. ${mod.name}`;
    if (mod.priceAdjust > 0) line += ` (+$${mod.priceAdjust.toFixed(2)})`;
    return line;
  }).join('\n');

  if (isMultiple) {
    const maxNote = group.maxSelections < group.modifiers.length
      ? ` (pick up to ${group.maxSelections})`
      : '';
    return `For your ${itemName} — ${group.name}?${maxNote}\n${modifierLines}\nReply with numbers (e.g., "1,3") or SKIP for none.`;
  }

  return `For your ${itemName} — ${group.name}?\n${modifierLines}\nReply with a number.`;
}

function parseModifierSelection(
  message: string,
  group: MenuItemModifierGroup,
): Array<{ groupName: string; modifierName: string; priceAdjust: number }> | null {
  const trimmed = message.trim().toUpperCase();

  // Allow SKIP for optional groups
  if (trimmed === 'SKIP' || trimmed === 'NONE') {
    if (group.required) return null; // Can't skip required
    return [];
  }

  // Try to parse numeric selections: "1", "1,3", "1, 2, 3"
  const parts = message.split(/[,\s]+/).filter(Boolean);
  const indices: number[] = [];

  for (const part of parts) {
    const num = parseInt(part.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= group.modifiers.length) {
      indices.push(num - 1);
    }
  }

  if (indices.length === 0) {
    // Try name matching as fallback
    const lowerMsg = message.toLowerCase();
    for (let i = 0; i < group.modifiers.length; i++) {
      if (lowerMsg.includes(group.modifiers[i].name.toLowerCase())) {
        indices.push(i);
      }
    }
  }

  if (indices.length === 0) return null;

  // For SINGLE selection, take only first
  const finalIndices = group.selectionType === 'SINGLE' ? [indices[0]] : indices.slice(0, group.maxSelections);

  return finalIndices.map((idx) => ({
    groupName: group.name,
    modifierName: group.modifiers[idx].name,
    priceAdjust: group.modifiers[idx].priceAdjust,
  }));
}

// ── Order summary helpers ────────────────────────────────────────────────────

function calculateTotal(items: DraftItem[]): number {
  return items.reduce((sum, item) => {
    const modAdjust = (item.selectedModifiers ?? []).reduce((s, m) => s + m.priceAdjust, 0);
    return sum + (item.price + modAdjust) * item.quantity;
  }, 0);
}

function buildOrderSummary(items: DraftItem[]): string {
  return items.map((item) => {
    const mods = item.selectedModifiers ?? [];
    const modAdjust = mods.reduce((s, m) => s + m.priceAdjust, 0);
    const itemTotal = (item.price + modAdjust) * item.quantity;
    let line = `${item.quantity}x ${item.name}`;
    if (mods.length > 0) {
      line += ` - ${mods.map((m) => m.modifierName).join(', ')}`;
      if (modAdjust > 0) line += ` (+$${(modAdjust * item.quantity).toFixed(2)})`;
    }
    line += ` ($${itemTotal.toFixed(2)})`;
    return line;
  }).join('\n');
}

/** Compact summary for the SAME-reorder welcome (no modifiers / per-item totals). */
function buildReorderSummary(
  items: Array<{ name: string; quantity: number; price: number }>,
): string {
  return items
    .map((i) => `${i.quantity}x ${i.name} ($${(i.price * i.quantity).toFixed(2)})`)
    .join('\n');
}

function buildOwnerOrderSummary(items: DraftItem[]): string {
  return items.map((item) => {
    const mods = item.selectedModifiers ?? [];
    let line = `${item.quantity}x ${item.name}`;
    if (mods.length > 0) {
      line += ` (${mods.map((m) => m.modifierName).join(', ')})`;
    }
    return line;
  }).join('\n');
}

function buildConfirmResponse(
  currentState: CallerState,
  menuItems: MenuItem[],
): FlowOutput {
  const orderDraft = currentState.orderDraft;
  if (!orderDraft || orderDraft.items.length === 0) {
    return {
      nextState: { ...currentState, flowStep: 'MENU_DISPLAY', lastMessageAt: Date.now() },
      smsReply: "Something went wrong. Let's start over.\n" + buildMenuText(menuItems),
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  const total = calculateTotal(orderDraft.items);
  const orderSummary = buildOrderSummary(orderDraft.items);

  return {
    nextState: {
      ...currentState,
      flowStep: 'ORDER_CONFIRM',
      pendingCustomization: null,
      lastMessageAt: Date.now(),
    },
    smsReply: `Your order:\n${orderSummary}\nTotal: $${total.toFixed(2)}\n\nReply YES to confirm or NO to start over.`,
    sideEffects: [],
    flowType: FlowType.ORDER,
  };
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseOrderItems(
  message: string,
  menuItems: Array<{ id: string; name: string; price: number; isAvailable: boolean }>
): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Try numeric format: "1x2, 3x1" or "2 of item 1"
  const numericPattern = /(\d+)\s*[xX×]\s*(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = numericPattern.exec(message)) !== null) {
    const itemIndex = parseInt(match[1], 10) - 1;
    const quantity = parseInt(match[2], 10);
    const menuItem = menuItems[itemIndex];
    if (menuItem && quantity > 0 && quantity <= 20) {
      items.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity,
        price: menuItem.price,
      });
    }
  }

  if (items.length > 0) return items;

  // Try name matching
  const lowerMsg = message.toLowerCase();
  for (const menuItem of menuItems) {
    if (lowerMsg.includes(menuItem.name.toLowerCase())) {
      const qtyMatch = /(\d+)\s+(?:of\s+)?/i.exec(
        lowerMsg.substring(lowerMsg.indexOf(menuItem.name.toLowerCase()) - 5)
      );
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      items.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: Math.min(qty, 20),
        price: menuItem.price,
      });
    }
  }

  return items;
}

function buildMenuText(
  menuItems: Array<{ name: string; price: number; isAvailable: boolean; duration?: number | null }>
): string {
  const available = menuItems.filter((m) => m.isAvailable);
  if (available.length === 0) return 'Our menu is being updated.';
  return available.map((item, i) => {
    let line = `${i + 1}. ${item.name} - $${item.price.toFixed(2)}`;
    if (item.duration) line += ` (${item.duration} min)`;
    return line;
  }).join('\n');
}
