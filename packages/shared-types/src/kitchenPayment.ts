/**
 * Kitchen production eligibility is tenant-aware:
 * - Tenants that require online payment must have a confirmed PAID order.
 * - Tenants that do not require payment can send accepted orders directly
 *   to the kitchen regardless of the payment-status bookkeeping value.
 *
 * Returning null means no paymentStatus predicate is required.
 */
export function getKitchenPaymentStatusFilter(requirePayment: boolean): 'PAID' | null {
  return requirePayment ? 'PAID' : null;
}

export function isKitchenPaymentEligible(
  requirePayment: boolean,
  paymentStatus: string | null | undefined
): boolean {
  const requiredStatus = getKitchenPaymentStatusFilter(requirePayment);
  return requiredStatus === null || paymentStatus === requiredStatus;
}
