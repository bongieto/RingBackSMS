import { OrderItem } from './models';

// ── Side Effect Types for Flow Engine ────────────────────────────────────────

export type SideEffectType =
  | 'SAVE_ORDER'
  | 'BOOK_MEETING'
  | 'NOTIFY_OWNER'
  | 'CREATE_SQUARE_ORDER'
  | 'CREATE_POS_ORDER'
  | 'CREATE_PAYMENT_LINK'
  | 'FETCH_CALCOM_SLOTS'
  | 'CREATE_CALCOM_BOOKING'
  | 'FETCH_LOCAL_SLOTS'
  | 'CREATE_LOCAL_BOOKING';

export interface SaveOrderSideEffect {
  type: 'SAVE_ORDER';
  payload: {
    items: OrderItem[];
    pickupTime: string | null;
    notes: string | null;
    total: number;
    /** Optional breakdown. When provided, createOrder persists them and
     *  Stripe checkout line-items them explicitly. */
    subtotal?: number;
    taxAmount?: number;
    feeAmount?: number;
    /** Customer's given name captured during the order (e.g. "Rolando").
     *  Shown on kitchen tickets and the READY SMS. */
    customerName?: string | null;
    /** When 'PENDING', createOrder skips the POS push — we'll push after
     *  Stripe confirms payment. Default is to push immediately (legacy
     *  pay-after-order flow). */
    paymentStatus?: 'PENDING' | 'PAID' | 'UNPAID';
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
    subtotal?: number;
    taxAmount?: number;
    feeAmount?: number;
    customerName?: string | null;
  };
}

export interface FetchCalcomSlotsSideEffect {
  type: 'FETCH_CALCOM_SLOTS';
  payload: {
    startUtc: string;
    endUtc: string;
    dateLabel: string;
  };
}

export interface CreateCalcomBookingSideEffect {
  type: 'CREATE_CALCOM_BOOKING';
  payload: {
    start: string;
    name: string;
    email: string;
    callerPhone: string;
  };
}

/** Native (built-in calendar) equivalent of FETCH_CALCOM_SLOTS. The handler
 *  reads tenant calendar config, existing meetings, and blackouts, then
 *  calls computeAvailableSlots() and writes the result onto the draft. */
export interface FetchLocalSlotsSideEffect {
  type: 'FETCH_LOCAL_SLOTS';
  payload: {
    startUtc: string;
    endUtc: string;
    dateLabel: string;
  };
}

/** Native (built-in calendar) equivalent of CREATE_CALCOM_BOOKING. The
 *  handler does an atomic conflict check + Meeting insert and fires the
 *  owner-notification side effect. */
export interface CreateLocalBookingSideEffect {
  type: 'CREATE_LOCAL_BOOKING';
  payload: {
    start: string;
    name: string;
    email: string;
    callerPhone: string;
  };
}

export type SideEffect =
  | SaveOrderSideEffect
  | BookMeetingSideEffect
  | NotifyOwnerSideEffect
  | CreateSquareOrderSideEffect
  | CreatePosOrderSideEffect
  | CreatePaymentLinkSideEffect
  | FetchCalcomSlotsSideEffect
  | CreateCalcomBookingSideEffect
  | FetchLocalSlotsSideEffect
  | CreateLocalBookingSideEffect;
