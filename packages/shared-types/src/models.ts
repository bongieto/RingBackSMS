import { z } from 'zod';
import {
  BusinessType,
  Plan,
  FlowType,
  Direction,
  OrderStatus,
  MeetingStatus,
  UsageType,
  ContactStatus,
} from './enums';

// ── Tenant ────────────────────────────────────────────────────────────────────

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  businessType: z.nativeEnum(BusinessType),
  plan: z.nativeEnum(Plan),
  twilioSubAccountSid: z.string().nullable(),
  twilioAuthToken: z.string().nullable(), // encrypted at rest
  twilioPhoneNumber: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  clerkOrgId: z.string().nullable(),
  squareAccessToken: z.string().nullable(), // encrypted at rest
  squareRefreshToken: z.string().nullable(), // encrypted at rest
  squareLocationId: z.string().nullable(),
  squareMerchantId: z.string().nullable(),
  squareTokenExpiresAt: z.date().nullable(),
  posProvider: z.string().nullable(),
  posAccessToken: z.string().nullable(),
  posRefreshToken: z.string().nullable(),
  posTokenExpiresAt: z.date().nullable(),
  posLocationId: z.string().nullable(),
  posMerchantId: z.string().nullable(),
  posRaw: z.record(z.unknown()).nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Tenant = z.infer<typeof TenantSchema>;

// ── TenantConfig ──────────────────────────────────────────────────────────────

export const DayScheduleSchema = z.object({
  open: z.string(),
  close: z.string(),
});

export type DaySchedule = z.infer<typeof DayScheduleSchema>;

export const BusinessScheduleSchema = z.record(z.string(), DayScheduleSchema);

export type BusinessSchedule = z.infer<typeof BusinessScheduleSchema>;

export const TenantConfigSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  greeting: z.string(),
  timezone: z.string().default('America/Chicago'),
  businessHoursStart: z.string().default('11:00'),
  businessHoursEnd: z.string().default('20:00'),
  businessDays: z.array(z.number().min(0).max(6)), // 0=Sun, 6=Sat
  businessSchedule: BusinessScheduleSchema.nullable().optional(),
  closedDates: z.array(z.string()).default([]),
  aiPersonality: z.string().nullable(),
  calcomLink: z.string().nullable(),
  slackWebhook: z.string().nullable(),
  ownerEmail: z.string().email().nullable(),
  ownerPhone: z.string().nullable(),
  businessAddress: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  websiteContext: z.string().nullable(),
  squareSyncEnabled: z.boolean().default(false),
  squareAutoSync: z.boolean().default(false),
  posSyncEnabled: z.boolean().default(false),
  posAutoSync: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

// ── Flow ──────────────────────────────────────────────────────────────────────

export const FlowSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.nativeEnum(FlowType),
  isEnabled: z.boolean().default(true),
  config: z.record(z.unknown()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Flow = z.infer<typeof FlowSchema>;

// ── MissedCall ────────────────────────────────────────────────────────────────

export const MissedCallSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  callerPhone: z.string(),
  twilioCallSid: z.string(),
  occurredAt: z.date(),
  smsSent: z.boolean().default(false),
  createdAt: z.date(),
});

export type MissedCall = z.infer<typeof MissedCallSchema>;

// ── Conversation ──────────────────────────────────────────────────────────────

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.date(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  callerPhone: z.string(),
  missedCallId: z.string().uuid().nullable(),
  messages: z.array(MessageSchema),
  flowType: z.nativeEnum(FlowType).nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

// ── Order ─────────────────────────────────────────────────────────────────────

export const OrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  name: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  notes: z.string().optional(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid(),
  callerPhone: z.string(),
  orderNumber: z.string(),
  status: z.nativeEnum(OrderStatus),
  items: z.array(OrderItemSchema),
  total: z.number().nonnegative(),
  pickupTime: z.string().nullable(),
  notes: z.string().nullable(),
  squareOrderId: z.string().nullable(),
  squarePaymentId: z.string().nullable(),
  posOrderId: z.string().nullable(),
  posPaymentId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Order = z.infer<typeof OrderSchema>;

// ── Meeting ───────────────────────────────────────────────────────────────────

export const MeetingSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid(),
  callerPhone: z.string(),
  calcomBookingId: z.string().nullable(),
  calcomBookingUid: z.string().nullable(),
  scheduledAt: z.date().nullable(),
  status: z.nativeEnum(MeetingStatus),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Meeting = z.infer<typeof MeetingSchema>;

// ── MenuItem ──────────────────────────────────────────────────────────────────

export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  price: z.number().nonnegative(),
  category: z.string().nullable(),
  isAvailable: z.boolean().default(true),
  duration: z.number().int().positive().nullable(),
  requiresBooking: z.boolean().default(false),
  squareCatalogId: z.string().nullable(),
  squareVariationId: z.string().nullable(),
  posCatalogId: z.string().nullable(),
  posVariationId: z.string().nullable(),
  lastSyncedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MenuItem = z.infer<typeof MenuItemSchema>;

// ── UsageLog ──────────────────────────────────────────────────────────────────

export const UsageLogSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.nativeEnum(UsageType),
  metadata: z.record(z.unknown()).nullable(),
  billedAt: z.date().nullable(),
  createdAt: z.date(),
});

export type UsageLog = z.infer<typeof UsageLogSchema>;

// ── Contact ───────────────────────────────────────────────────────────────────

export const ContactSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  phone: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.nativeEnum(ContactStatus),
  tags: z.array(z.string()),
  totalOrders: z.number().int(),
  totalSpent: z.number().int(),
  lastContactAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  conversationCount: z.number().int().optional(),
  orderCount: z.number().int().optional(),
});

export type Contact = z.infer<typeof ContactSchema>;

// ── ContactNote ───────────────────────────────────────────────────────────────

export const ContactNoteSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  tenantId: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ContactNote = z.infer<typeof ContactNoteSchema>;

// ── Activity Timeline ─────────────────────────────────────────────────────────

export type ActivityItem =
  | { type: 'conversation'; id: string; summary: string; occurredAt: string }
  | { type: 'order'; id: string; orderNumber: string; total: number; status: string; occurredAt: string }
  | { type: 'meeting'; id: string; scheduledAt: string | null; status: string; occurredAt: string };
