import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Plan } from '@ringback/shared-types';
import { requireOrgAuth } from '../middleware/authMiddleware';
import {
  createCheckoutSession,
  createBillingPortalSession,
  createStripeCustomer,
} from '../services/billingService';
import { sendSuccess } from '../utils/response';

const router: Router = Router();

// POST /billing/checkout
router.post('/checkout', requireOrgAuth, async (req: Request, res: Response) => {
  const Schema = z.object({
    tenantId: z.string().uuid(),
    plan: z.nativeEnum(Plan),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
  });

  const { tenantId, plan, successUrl, cancelUrl } = Schema.parse(req.body);
  const url = await createCheckoutSession(tenantId, plan, successUrl, cancelUrl);
  sendSuccess(res, { url });
});

// POST /billing/portal
router.post('/portal', requireOrgAuth, async (req: Request, res: Response) => {
  const Schema = z.object({
    tenantId: z.string().uuid(),
    returnUrl: z.string().url(),
  });

  const { tenantId, returnUrl } = Schema.parse(req.body);
  const url = await createBillingPortalSession(tenantId, returnUrl);
  sendSuccess(res, { url });
});

// POST /billing/customer
router.post('/customer', requireOrgAuth, async (req: Request, res: Response) => {
  const Schema = z.object({
    tenantId: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1),
  });

  const { tenantId, email, name } = Schema.parse(req.body);
  const customerId = await createStripeCustomer(tenantId, email, name);
  sendSuccess(res, { customerId });
});

export default router;
