import { CallerState, Flow, TenantConfig, MenuItem, SideEffect } from '@ringback/shared-types';
import { FlowType } from '@ringback/shared-types';

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  /** URL-safe public slug for menu page, e.g. "the-lumpia-house" */
  tenantSlug?: string | null;
  /** E.164 Twilio number callers text — used to prefill "text to order" CTAs */
  tenantPhoneNumber?: string | null;
  config: TenantConfig;
  flows: Flow[];
  menuItems: MenuItem[];
  /** Optional business-hours context passed in by the host app. When set,
   *  the ORDER agent uses it to politely schedule future pickups when we're
   *  closed rather than dead-ending the conversation. */
  hoursInfo?: {
    openNow: boolean;
    nextOpenDisplay: string | null;   // e.g. "tomorrow 11:00 AM" or "Sun 11:00 AM"
    todayHoursDisplay: string;        // e.g. "11:00 AM - 9:00 PM" — TODAY only
    weeklyHoursDisplay: string;       // e.g. "Sun 11-8pm, Tue-Sat 11-9pm" — full week for ops context
    /** Minutes remaining until today's close. Null when closed. */
    minutesUntilClose?: number | null;
    /** Today's closing time verbatim (e.g. "9:00 PM"). Null when closed. */
    closesAtDisplay?: string | null;
    /** True when minutesUntilClose is within the last-orders window. The
     *  agent should refuse new orders past close+grace; operators usually
     *  want the grace to be 15 minutes. */
    closingSoon?: boolean;
  };
}

/**
 * Lightweight caller-history snapshot the host app can pass into the flow
 * engine so the AI can address the caller by name and reference prior orders
 * without re-asking. All fields optional — flow engine degrades gracefully.
 */
export interface CallerMemory {
  contactName?: string | null;
  contactStatus?: 'LEAD' | 'CUSTOMER' | 'VIP' | 'INACTIVE' | null;
  tier?: 'NEW' | 'RAPID_REDIAL' | 'SAME_DAY' | 'RETURNING';
  lastOrderSummary?: string | null;   // e.g. "2 pepperoni, 1 caesar — $36, 3 days ago"
  lastOrderItems?: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  lastConversationPreview?: string | null;
}

/** Chat completion function injected by the web layer. The flow engine
 *  never instantiates AI clients directly — it calls through this. */
export type ChatFn = (params: {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}) => Promise<string>;

/** Tool-use chat function for the AI ORDER agent. Returns text + any tool
 *  calls the model emitted. Optional — only needed when
 *  `tenantContext.config.aiOrderAgentEnabled` is true. */
export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface AgentToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
export type ChatWithToolsFn = (params: {
  systemPrompt: string;
  userMessage: string;
  messageHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: AgentToolSchema[];
  maxTokens?: number;
  temperature?: number;
}) => Promise<{
  text: string;
  toolCalls: AgentToolCall[];
  stopReason: string | null;
  provider: 'claude' | 'minimax';
}>;

export interface FlowInput {
  tenantContext: TenantContext;
  callerPhone: string;
  inboundMessage: string;
  currentState: CallerState | null;
  /** @deprecated Use chatFn instead. Kept for backward compat. */
  aiApiKey?: string;
  chatFn: ChatFn;
  /** Optional tool-use chat fn for the AI ORDER agent. */
  chatWithToolsFn?: ChatWithToolsFn;
  /** Recent conversation messages (most recent last), passed into AI agent. */
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  callerMemory?: CallerMemory;
  /** Returns how many orders are currently ahead in the kitchen. Used to
   *  surcharge the pickup ETA. Optional — when unset the flow engine
   *  behaves as if queue count is 0. */
  getActiveOrderCount?: (tenantId: string) => Promise<number>;
}

export interface FlowOutput {
  nextState: CallerState;
  smsReply: string;
  sideEffects: SideEffect[];
  flowType: FlowType;
}

export type FlowStep =
  | 'GREETING'
  | 'MENU_DISPLAY'
  | 'ITEM_SELECTION'
  | 'ITEM_CUSTOMIZATION'
  | 'ORDER_CONFIRM'
  | 'PICKUP_TIME'
  | 'SERVICE_BOOKING'
  | 'AWAITING_PAYMENT'
  | 'ORDER_COMPLETE'
  | 'MEETING_GREETING'
  | 'MEETING_SCHEDULE'
  | 'MEETING_CONFIRM'
  | 'MEETING_DATE_PROMPT'
  | 'MEETING_SLOT_PICK'
  | 'MEETING_COLLECT_NAME'
  | 'MEETING_COLLECT_EMAIL'
  | 'MEETING_COMPLETE'
  | 'INQUIRY_MATCH'
  | 'INQUIRY_AWAIT_HOLD'
  | 'INQUIRY_COMPLETE'
  | 'FALLBACK';
