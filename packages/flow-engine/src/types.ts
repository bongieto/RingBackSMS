import { CallerState, Flow, TenantConfig, MenuItem, SideEffect } from '@ringback/shared-types';
import { FlowType } from '@ringback/shared-types';

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  config: TenantConfig;
  flows: Flow[];
  menuItems: MenuItem[];
}

export interface FlowInput {
  tenantContext: TenantContext;
  callerPhone: string;
  inboundMessage: string;
  currentState: CallerState | null;
  aiApiKey: string;
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
  | 'FALLBACK';
