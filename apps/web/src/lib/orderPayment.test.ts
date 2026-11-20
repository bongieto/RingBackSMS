import { getOrderPaymentBadge } from './orderPayment';

describe('getOrderPaymentBadge', () => {
  it('marks a paid order as Paid', () => {
    expect(getOrderPaymentBadge('PAID')).toMatchObject({ label: 'Paid', tone: 'paid' });
  });

  it('marks an order whose payment link is still open as Unpaid', () => {
    const badge = getOrderPaymentBadge('PENDING');
    expect(badge).toMatchObject({ label: 'Unpaid', tone: 'unpaid' });
    expect(badge?.detail).toMatch(/has not paid yet/);
  });

  it('marks an order with no online payment as Unpaid', () => {
    expect(getOrderPaymentBadge('UNPAID')).toMatchObject({ label: 'Unpaid', tone: 'unpaid' });
  });

  it('marks an expired payment link as unpaid, not as paid', () => {
    const badge = getOrderPaymentBadge('EXPIRED');
    expect(badge?.tone).toBe('expired');
    expect(badge?.label).toMatch(/^Unpaid/);
  });

  it('marks a refunded order as Refunded', () => {
    expect(getOrderPaymentBadge('REFUNDED')).toMatchObject({ label: 'Refunded', tone: 'refunded' });
  });

  it('shows no badge when the status is missing or unknown', () => {
    expect(getOrderPaymentBadge(null)).toBeNull();
    expect(getOrderPaymentBadge(undefined)).toBeNull();
    expect(getOrderPaymentBadge('')).toBeNull();
    expect(getOrderPaymentBadge('SOMETHING_NEW')).toBeNull();
  });
});
