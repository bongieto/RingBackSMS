export enum BusinessType {
  RESTAURANT = 'RESTAURANT',
  FOOD_TRUCK = 'FOOD_TRUCK',
  SERVICE = 'SERVICE',
  CONSULTANT = 'CONSULTANT',
  MEDICAL = 'MEDICAL',
  RETAIL = 'RETAIL',
  OTHER = 'OTHER',
}

export enum Plan {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  SCALE = 'SCALE',
  ENTERPRISE = 'ENTERPRISE',
}

export enum FlowType {
  ORDER = 'ORDER',
  MEETING = 'MEETING',
  INQUIRY = 'INQUIRY',
  CUSTOM = 'CUSTOM',
  FALLBACK = 'FALLBACK',
}

export enum Direction {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum MeetingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum UsageType {
  SMS_SENT = 'SMS_SENT',
  AI_CALL = 'AI_CALL',
  CALL_WEBHOOK = 'CALL_WEBHOOK',
  SQUARE_ORDER = 'SQUARE_ORDER',
  POS_ORDER = 'POS_ORDER',
}

// Accept both legacy non-neural and new neural voice IDs. The voice webhook
// transparently upgrades legacy IDs at runtime, so existing tenant rows keep working.
export const VOICE_TYPES = [
  'Polly.Joanna-Neural',
  'Polly.Matthew-Neural',
  'Polly.Salli-Neural',
  'Polly.Ivy-Neural',
  'Polly.Joanna',
  'Polly.Matthew',
  'Polly.Salli',
  'Polly.Ivy',
] as const;
export type VoiceType = typeof VOICE_TYPES[number];

export enum ContactStatus {
  LEAD = 'LEAD',
  CUSTOMER = 'CUSTOMER',
  VIP = 'VIP',
  INACTIVE = 'INACTIVE',
}
