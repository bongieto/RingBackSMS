import { CallerState, Flow, TenantConfig, MenuItem, SideEffect } from '@ringback/shared-types';
import { FlowType } from '@ringback/shared-types';

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  config: TenantConfig;
  flows: Flow[];
  menuItems: MenuItem[];
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

export interface FlowInput {
  tenantContext: TenantContext;
  callerPhone: string;
  inboundMessage: string;
  currentState: CallerState | null;
  aiApiKey: string;
  callerMemory?: CallerMemory;
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
  | 'INQUIRY_MATCH'
  | 'INQUIRY_AWAIT_HOLD'
  | 'INQUIRY_COMPLETE'
  | 'FALLBACK';
