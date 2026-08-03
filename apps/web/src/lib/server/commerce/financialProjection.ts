export type CanonicalFinancialStatus =
  | 'PENDING'
  | 'PAID'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export function isRecognizedRevenue(status: string): boolean {
  return status === 'PAID' || status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED';
}

export function assertMonotonicProjection(
  current: { version: number } | null,
  incomingVersion: number
): 'create' | 'update' | 'same' | 'stale' {
  if (!current) return 'create';
  if (incomingVersion < current.version) return 'stale';
  if (incomingVersion === current.version) return 'same';
  return 'update';
}
