import { z } from 'zod';
import { BusinessType, Plan, FlowType, VOICE_TYPES } from './enums';
import { BusinessScheduleSchema } from './models';

// ── Request schemas ───────────────────────────────────────────────────────────

export const CreateTenantRequestSchema = z.object({
  name: z.string().min(1).max(255),
  businessType: z.nativeEnum(BusinessType),
  plan: z.nativeEnum(Plan).optional().default(Plan.STARTER),
  clerkOrgId: z.string().optional(),
  ownerEmail: z.string().email().optional(),
  ownerPhone: z.string().optional(),
  timezone: z.string().optional().default('America/Chicago'),
});

export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const UpdateTenantConfigRequestSchema = z.object({
  greeting: z.string().optional(),
  greetingAfterHours: z.string().nullable().optional(),
  greetingRapidRedial: z.string().nullable().optional(),
  greetingReturning: z.string().nullable().optional(),
  voiceGreeting: z.string().max(500).nullable().optional(),
  voiceGreetingAfterHours: z.string().max(500).nullable().optional(),
  voiceGreetingRapidRedial: z.string().max(500).nullable().optional(),
  voiceGreetingReturning: z.string().max(500).nullable().optional(),
  voiceType: z.enum(VOICE_TYPES).optional(),
  timezone: z.string().optional(),
  businessHoursStart: z.string().optional(),
  businessHoursEnd: z.string().optional(),
  businessDays: z.array(z.number().min(0).max(6)).optional(),
  businessSchedule: BusinessScheduleSchema.nullable().optional(),
  closedDates: z.array(z.string()).optional(),
  aiPersonality: z.string().optional(),
  calcomLink: z.string().url().optional(),
  slackWebhook: z.string().url().optional(),
  ownerEmail: z.string().email().optional(),
  ownerPhone: z.string().optional(),
  businessAddress: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  squareSyncEnabled: z.boolean().optional(),
  squareAutoSync: z.boolean().optional(),
  requirePayment: z.boolean().optional(),
  dailyDigestEnabled: z.boolean().optional(),
  dailyDigestHour: z.number().int().min(0).max(23).optional(),
  // Prep time (restaurants & food trucks)
  defaultPrepTimeMinutes: z.number().int().min(0).max(720).nullable().optional(),
  largeOrderThresholdItems: z.number().int().min(1).max(10000).nullable().optional(),
  largeOrderExtraMinutes: z.number().int().min(0).max(720).nullable().optional(),
  prepTimeOverrides: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        extraMinutes: z.number().int().min(0).max(720),
        label: z.string().max(100).optional(),
      }),
    )
    .nullable()
    .optional(),
  ordersAcceptingEnabled: z.boolean().optional(),
});

export type UpdateTenantConfigRequest = z.infer<typeof UpdateTenantConfigRequestSchema>;

export const CreateFlowRequestSchema = z.object({
  type: z.nativeEnum(FlowType),
  isEnabled: z.boolean().optional().default(true),
  config: z.record(z.unknown()).optional(),
});

export type CreateFlowRequest = z.infer<typeof CreateFlowRequestSchema>;

export const TwilioInboundSmsSchema = z.object({
  MessageSid: z.string(),
  AccountSid: z.string(),
  From: z.string(),
  To: z.string(),
  Body: z.string(),
  NumMedia: z.string().optional(),
});

export type TwilioInboundSms = z.infer<typeof TwilioInboundSmsSchema>;

export const TwilioCallStatusSchema = z.object({
  CallSid: z.string(),
  AccountSid: z.string(),
  From: z.string(),
  To: z.string(),
  CallStatus: z.enum([
    'queued',
    'ringing',
    'in-progress',
    'completed',
    'busy',
    'no-answer',
    'failed',
    'canceled',
  ]),
  Direction: z.string(),
  Duration: z.string().optional(),
});

export type TwilioCallStatus = z.infer<typeof TwilioCallStatusSchema>;

// ── Response schemas ──────────────────────────────────────────────────────────

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: z.array(dataSchema),
    pagination: z.object({
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      totalPages: z.number(),
    }),
  });

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}
