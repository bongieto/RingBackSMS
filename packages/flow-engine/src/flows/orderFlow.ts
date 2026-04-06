import { FlowInput, FlowOutput, FlowStep } from '../types';
import { FlowType, OrderStatus } from '@ringback/shared-types';
import { CallerState, SideEffect } from '@ringback/shared-types';

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
  const { tenantContext, inboundMessage, currentState } = input;
  const menuItems = tenantContext.menuItems.filter((m) => m.isAvailable);
  const upperMsg = inboundMessage.trim().toUpperCase();

  const step = (currentState?.flowStep as FlowStep) ?? 'GREETING';

  // ── GREETING → MENU_DISPLAY ──────────────────────────────────────────────
  if (step === 'GREETING' || !currentState || currentState.currentFlow !== FlowType.ORDER) {
    const menuText = menuItems
      .map((item, i) => {
        let line = `${i + 1}. ${item.name} - $${item.price.toFixed(2)}`;
        if (item.duration) line += ` (${item.duration} min)`;
        return line;
      })
      .join('\n');

    const menuDisplay =
      menuItems.length > 0
        ? `Here's our menu:\n${menuText}\n\nReply with item numbers and quantities (e.g., "1x2, 3x1") or item names.`
        : 'Our menu is being updated. Please call us directly to place an order.';

    const nextState: CallerState = {
      ...buildInitialState(input),
      flowStep: 'MENU_DISPLAY',
    };

    return {
      nextState,
      smsReply: `Thanks for ordering with ${tenantContext.tenantName}! ${menuDisplay}`,
      sideEffects: [],
      flowType: FlowType.ORDER,
    };
  }

  // ── MENU_DISPLAY → ITEM_SELECTION ────────────────────────────────────────
  if (step === 'MENU_DISPLAY') {
    const parsedItems = parseOrderItems(inboundMessage, menuItems);

    if (parsedItems.length === 0) {
      return {
        nextState: { ...currentState, lastMessageAt: Date.now() },
        smsReply:
          "I didn't catch that. Please reply with item numbers (e.g., \"1x2\" for 2 of item 1) or item names.",
        sideEffects: [],
        flowType: FlowType.ORDER,
      };
    }

    const total = parsedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderSummary = parsedItems
      .map((item) => `${item.quantity}x ${item.name} ($${(item.price * item.quantity).toFixed(2)})`)
      .join('\n');

    const nextState: CallerState = {
      ...currentState,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: parsedItems.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
      },
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

    const total = orderDraft.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const pickupTime = inboundMessage.trim();

    const finalDraft = { ...orderDraft, pickupTime };

    const orderItems = orderDraft.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
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
              message: `New order pending payment!\n${orderDraft.items.map((i) => `${i.quantity}x ${i.name}`).join('\n')}\nTotal: $${total.toFixed(2)}\nPickup: ${pickupTime}`,
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

    return {
      nextState,
      smsReply: `Your order has been placed! Pickup time: ${pickupTime}. Total: $${total.toFixed(2)}. We'll have it ready for you! 🎉`,
      sideEffects: [
        {
          type: 'SAVE_ORDER',
          payload: { items: orderItems, pickupTime, notes: null, total },
        },
        {
          type: 'NOTIFY_OWNER',
          payload: {
            subject: `New Order from ${input.callerPhone}`,
            message: `New order received!\n${orderDraft.items.map((i) => `${i.quantity}x ${i.name}`).join('\n')}\nTotal: $${total.toFixed(2)}\nPickup: ${pickupTime}`,
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

    const total = orderDraft.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const requestedTime = inboundMessage.trim();
    const serviceNames = orderDraft.items.map((i) => i.name).join(', ');
    const serviceItems = orderDraft.items.map((item) => ({ menuItemId: item.menuItemId, name: item.name, quantity: item.quantity, price: item.price }));
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
              message: `New booking pending payment!\n${orderDraft.items.map((i) => `${i.quantity}x ${i.name}`).join('\n')}\nTotal: $${total.toFixed(2)}\nRequested: ${requestedTime}`,
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
            message: `New booking request!\n${orderDraft.items.map((i) => `${i.quantity}x ${i.name}`).join('\n')}\nTotal: $${total.toFixed(2)}\nRequested: ${requestedTime}`,
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

interface ParsedItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
}

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
