import { z } from 'zod';
import { FlowType } from './enums';

// ── Caller State (stored in Redis) ────────────────────────────────────────────

export const OrderDraftSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      price: z.number(),
    })
  ),
  pickupTime: z.string().optional(),
  notes: z.string().optional(),
});

export type OrderDraft = z.infer<typeof OrderDraftSchema>;

export const CallerStateSchema = z.object({
  tenantId: z.string().uuid(),
  callerPhone: z.string(),
  conversationId: z.string().uuid().nullable(),
  currentFlow: z.nativeEnum(FlowType).nullable(),
  flowStep: z.string().nullable(),
  orderDraft: OrderDraftSchema.nullable(),
  lastMessageAt: z.number(), // unix timestamp
  messageCount: z.number().int().default(0),
  dedupKey: z.string().nullable(), // last Twilio MessageSid to prevent duplicates
});

export type CallerState = z.infer<typeof CallerStateSchema>;
