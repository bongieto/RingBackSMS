import { OrderItem } from './models';

// ── Side Effect Types for Flow Engine ────────────────────────────────────────

export type SideEffectType =
  | 'SAVE_ORDER'
  | 'BOOK_MEETING'
  | 'NOTIFY_OWNER'
  | 'CREATE_SQUARE_ORDER'
  | 'CREATE_POS_ORDER'
  | 'CREATE_PAYMENT_LINK';

export interface SaveOrderSideEffect {
  type: 'SAVE_ORDER';
  payload: {
    items: OrderItem[];
    pickupTime: string | null;
    notes: string | null;
    total: number;
  };
}

export interface BookMeetingSideEffect {
  type: 'BOOK_MEETING';
  payload: {
    callerPhone: string;
    preferredTime: string | null;
    notes: string | null;
  };
}

export interface NotifyOwnerSideEffect {
  type: 'NOTIFY_OWNER';
  payload: {
    subject: string;
    message: string;
    channel: 'email' | 'sms' | 'slack';
  };
}

export interface CreateSquareOrderSideEffect {
  type: 'CREATE_SQUARE_ORDER';
  payload: {
    items: OrderItem[];
    pickupTime: string | null;
    locationId: string;
  };
}

export interface CreatePosOrderSideEffect {
  type: 'CREATE_POS_ORDER';
  payload: {
    items: OrderItem[];
    pickupTime: string | null;
    locationId: string;
    provider: string;
  };
}

export interface CreatePaymentLinkSideEffect {
  type: 'CREATE_PAYMENT_LINK';
  payload: {
    items: OrderItem[];
    total: number;
    pickupTime: string | null;
    notes: string | null;
  };
}

export type SideEffect =
  | SaveOrderSideEffect
  | BookMeetingSideEffect
  | NotifyOwnerSideEffect
  | CreateSquareOrderSideEffect
  | CreatePosOrderSideEffect
  | CreatePaymentLinkSideEffect;
