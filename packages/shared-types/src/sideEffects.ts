import { OrderItem } from './models';

// ── Side Effect Types for Flow Engine ────────────────────────────────────────

export type SideEffectType =
  | 'SAVE_ORDER'
  | 'BOOK_MEETING'
  | 'NOTIFY_OWNER'
  | 'CREATE_SQUARE_ORDER';

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

export type SideEffect =
  | SaveOrderSideEffect
  | BookMeetingSideEffect
  | NotifyOwnerSideEffect
  | CreateSquareOrderSideEffect;
