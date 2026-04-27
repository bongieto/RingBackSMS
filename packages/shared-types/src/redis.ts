import { z } from 'zod';
import { FlowType } from './enums';

// ── Caller State (stored in Redis) ────────────────────────────────────────────

export const SelectedModifierSchema = z.object({
  groupName: z.string(),
  modifierName: z.string(),
  priceAdjust: z.number(),
});

export type SelectedModifier = z.infer<typeof SelectedModifierSchema>;

export const OrderDraftSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      price: z.number(),
      selectedModifiers: z.array(SelectedModifierSchema).optional(),
      // ai-agent: whether the customer has explicitly acknowledged this line
      confirmed: z.boolean().optional(),
      // free-form per-item notes collected by the AI agent (e.g. "no onions")
      notes: z.string().optional(),
      // Group-order person tag — when set, kitchen ticket groups by name.
      personName: z.string().max(40).optional(),
    })
  ),
  pickupTime: z.string().optional(),
  notes: z.string().optional(),
  // True when the customer signaled dine-in. The pickupTime field then
  // represents their *arrival ETA*, not pickup time.
  dineIn: z.boolean().optional(),
});

export type OrderDraft = z.infer<typeof OrderDraftSchema>;

export const PaymentPendingSchema = z.object({
  pickupTime: z.string(),
  notes: z.string().nullable(),
  stripeSessionId: z.string(),
  createdAt: z.number(),
});

export type PaymentPending = z.infer<typeof PaymentPendingSchema>;

export const PendingCustomizationSchema = z.object({
  itemIndex: z.number(),
  groupIndex: z.number(),
});

export type PendingCustomization = z.infer<typeof PendingCustomizationSchema>;

export const MeetingDraftSchema = z.object({
  slots: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .optional(), // offered slots, customer picks by number
  pickedSlotStart: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

export type MeetingDraft = z.infer<typeof MeetingDraftSchema>;

/** What the AI agent is waiting on the customer to answer next. */
export const PendingClarificationSchema = z.object({
  field: z.string(),            // e.g. "pickup_time", "side_for_combo_1"
  question: z.string(),         // the exact wording Claude asked
  askedAt: z.number(),          // unix ms
});

export type PendingClarification = z.infer<typeof PendingClarificationSchema>;

export const CallerStateSchema = z.object({
  tenantId: z.string().uuid(),
  callerPhone: z.string(),
  conversationId: z.string().uuid().nullable(),
  currentFlow: z.nativeEnum(FlowType).nullable(),
  flowStep: z.string().nullable(),
  orderDraft: OrderDraftSchema.nullable(),
  meetingDraft: MeetingDraftSchema.nullable().optional(),
  paymentPending: PaymentPendingSchema.nullable().optional(),
  pendingCustomization: PendingCustomizationSchema.nullable().optional(),
  // Only set when the ORDER agent is waiting on a clarifying answer
  pendingClarification: PendingClarificationSchema.nullable().optional(),
  // Customer-provided name for the current order (shown on kitchen ticket,
  // READY SMS, and receipt). Cached here within the session; also
  // denormalized onto Order + Contact on save.
  customerName: z.string().max(80).nullable().optional(),
  // Unix-ms timestamp of the last reply we sent in AWAITING_PAYMENT state.
  // Used to rate-limit owner notifications when the customer keeps texting
  // after the payment link is out (avoid spamming the owner).
  lastAwaitingPaymentReplyAt: z.number().nullable().optional(),
  lastMessageAt: z.number(), // unix timestamp
  messageCount: z.number().int().default(0),
  dedupKey: z.string().nullable(), // last Twilio MessageSid to prevent duplicates
});

export type CallerState = z.infer<typeof CallerStateSchema>;
