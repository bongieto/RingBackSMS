/**
 * Static price-list fallback used by admin dashboards when we don't
 * want to hit Stripe for every page view. Matches the plan catalog.
 * Keep in sync with the Stripe price IDs in billingService.ts.
 */
export const PLAN_MRR: Record<string, number> = {
  FREE: 0,
  PRO: 49,
  BUSINESS: 129,
  SCALE: 299,
};
