import { z } from 'zod';

export const COMMERCE_API_VERSION = '2026-08-03';

export const CommerceScopes = {
  MENU_READ: 'menu:read',
  MENU_WRITE: 'menu:write',
  AVAILABILITY_READ: 'availability:read',
  AVAILABILITY_WRITE: 'availability:write',
  ORDERS_READ: 'orders:read',
  ORDERS_WRITE: 'orders:write',
  FINANCIALS_WRITE: 'financials:write',
  FULFILLMENT_WRITE: 'fulfillment:write',
  WEBHOOKS_MANAGE: 'webhooks:manage',
} as const;

export const CommerceScopeSchema = z.enum([
  CommerceScopes.MENU_READ,
  CommerceScopes.MENU_WRITE,
  CommerceScopes.AVAILABILITY_READ,
  CommerceScopes.AVAILABILITY_WRITE,
  CommerceScopes.ORDERS_READ,
  CommerceScopes.ORDERS_WRITE,
  CommerceScopes.FINANCIALS_WRITE,
  CommerceScopes.FULFILLMENT_WRITE,
  CommerceScopes.WEBHOOKS_MANAGE,
]);

export type CommerceScope = z.infer<typeof CommerceScopeSchema>;

export const FulfillmentStatusSchema = z.enum([
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
]);

export const FulfillmentUpdateSchema = z.object({
  status: FulfillmentStatusSchema,
  expectedVersion: z.number().int().positive(),
  externalId: z.string().min(1).max(255).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const ExternalOrderCreateSchema = z.object({
  externalId: z.string().min(1).max(255),
  locationId: z.string().uuid(),
  customer: z
    .object({
      name: z.string().trim().max(200).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
    })
    .optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        name: z.string().trim().min(1).max(250),
        quantity: z.number().int().min(1).max(100),
        unitPrice: z.number().nonnegative(),
        modifiers: z
          .array(
            z.object({
              id: z.string().max(255).optional(),
              name: z.string().trim().min(1).max(250),
              price: z.number(),
            })
          )
          .max(50)
          .optional(),
        notes: z.string().max(1000).optional(),
      })
    )
    .min(1)
    .max(250),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  feeAmount: z.number().nonnegative().default(0),
  tipAmount: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']),
  fulfillmentStatus: FulfillmentStatusSchema.default('CONFIRMED'),
  pickupTime: z.string().max(100).nullable().optional(),
  dineIn: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
});

export const AvailabilityUpdateSchema = z.object({
  isAvailable: z.boolean(),
  reason: z.string().trim().max(500).nullable().optional(),
  expectedRevision: z.number().int().positive().optional(),
});

export const BulkAvailabilityUpdateSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        isAvailable: z.boolean(),
        reason: z.string().trim().max(500).nullable().optional(),
        expectedRevision: z.number().int().positive().optional(),
      })
    )
    .min(1)
    .max(250),
});

const ExternalModifierSchema = z.object({
  externalId: z.string().min(1).max(255),
  name: z.string().trim().min(1).max(250),
  priceAdjustment: z.number(),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const ExternalModifierGroupSchema = z
  .object({
    externalId: z.string().min(1).max(255),
    name: z.string().trim().min(1).max(250),
    required: z.boolean().default(false),
    minSelections: z.number().int().nonnegative().default(0),
    maxSelections: z.number().int().positive().default(1),
    sortOrder: z.number().int().default(0),
    conditions: z
      .array(
        z.object({
          parentGroupExternalId: z.string().min(1).max(255),
          parentModifierExternalId: z.string().min(1).max(255),
          operator: z.enum(['equals', 'not_equals']).default('equals'),
        })
      )
      .max(50)
      .default([]),
    options: z.array(ExternalModifierSchema).max(250).default([]),
  })
  .refine((group) => group.maxSelections >= group.minSelections, {
    message: 'maxSelections must be greater than or equal to minSelections',
  });

export const MenuSnapshotSchema = z.object({
  revision: z.string().min(1).max(255),
  sequence: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  categories: z
    .array(
      z.object({
        externalId: z.string().min(1).max(255),
        name: z.string().trim().min(1).max(250),
        sortOrder: z.number().int().default(0),
        isAvailable: z.boolean().default(true),
      })
    )
    .max(100),
  items: z
    .array(
      z.object({
        externalId: z.string().min(1).max(255),
        name: z.string().trim().min(1).max(250),
        description: z.string().max(5000).nullable().optional(),
        price: z.number().nonnegative(),
        categoryExternalId: z.string().max(255).nullable().optional(),
        isAvailable: z.boolean().default(true),
        imageUrl: z.string().url().nullable().optional(),
        modifierGroups: z.array(ExternalModifierGroupSchema).max(100).default([]),
      })
    )
    .max(250),
});

const CanonicalSaleItemSchema = z.object({
  externalItemId: z.string().min(1).max(255).nullable().optional(),
  name: z.string().trim().min(1).max(250),
  quantity: z.number().int().min(1).max(100),
  grossCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative().default(0),
  netCents: z.number().int().nonnegative(),
});

export const CanonicalSaleProjectionSchema = z
  .object({
    externalId: z.string().min(1).max(255),
    locationId: z.string().uuid(),
    version: z.number().int().positive(),
    orderNumber: z.string().min(1).max(100),
    status: z.enum(['PENDING', 'PAID', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED']),
    fulfillmentStatus: FulfillmentStatusSchema.or(z.literal('PENDING')),
    currency: z
      .string()
      .length(3)
      .transform((value) => value.toUpperCase()),
    occurredAt: z.string().datetime(),
    paidAt: z.string().datetime().nullable().optional(),
    grossCents: z.number().int().nonnegative(),
    discountCents: z.number().int().nonnegative().default(0),
    taxCents: z.number().int().nonnegative().default(0),
    feeCents: z.number().int().nonnegative().default(0),
    tipCents: z.number().int().nonnegative().default(0),
    refundCents: z.number().int().nonnegative().default(0),
    netCents: z.number().int(),
    tenderTypes: z.array(z.string().min(1).max(50)).max(10).default([]),
    items: z.array(CanonicalSaleItemSchema).max(250).default([]),
  })
  .superRefine((sale, ctx) => {
    const expectedNet = sale.grossCents - sale.refundCents;
    if (sale.netCents !== expectedNet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['netCents'],
        message: 'netCents must equal grossCents minus refundCents',
      });
    }
    if (sale.refundCents > sale.grossCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['refundCents'],
        message: 'refundCents cannot exceed grossCents',
      });
    }
  });

export const WebhookEventTypeSchema = z.enum([
  'order.ready_for_fulfillment',
  'order.updated',
  'order.cancelled',
  'menu.updated',
  'menu.availability.updated',
  'order.payment.updated',
  'order.refund.updated',
]);

export const WebhookEndpointCreateSchema = z.object({
  url: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), {
      message: 'Webhook URL must use HTTPS',
    }),
  description: z.string().trim().max(200).optional(),
  events: z.array(WebhookEventTypeSchema).min(1).max(10),
});
