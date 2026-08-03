import { getKitchenPaymentStatusFilter, isKitchenPaymentEligible } from '@ringback/shared-types';

describe('kitchen payment eligibility', () => {
  test('payment-required tenants only admit PAID orders', () => {
    expect(getKitchenPaymentStatusFilter(true)).toBe('PAID');
    expect(isKitchenPaymentEligible(true, 'PAID')).toBe(true);
    expect(isKitchenPaymentEligible(true, 'PENDING')).toBe(false);
    expect(isKitchenPaymentEligible(true, 'UNPAID')).toBe(false);
    expect(isKitchenPaymentEligible(true, 'EXPIRED')).toBe(false);
    expect(isKitchenPaymentEligible(true, 'REFUNDED')).toBe(false);
    expect(isKitchenPaymentEligible(true, null)).toBe(false);
  });

  test('tenants without required payment can send accepted orders to kitchen', () => {
    expect(getKitchenPaymentStatusFilter(false)).toBeNull();
    expect(isKitchenPaymentEligible(false, 'UNPAID')).toBe(true);
    expect(isKitchenPaymentEligible(false, null)).toBe(true);
  });
});
