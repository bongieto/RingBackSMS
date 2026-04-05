import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/authMiddleware';
import {
  searchAvailableNumbers,
  provisionSubAccount,
  provisionPhoneNumber,
  saveTenantTwilioCredentials,
} from '../services/twilioService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

const router: Router = Router();
const prisma = new PrismaClient();

// POST /phone/search — search available phone numbers in an area code
router.post('/search', requireAuth, async (req: Request, res: Response) => {
  const SearchSchema = z.object({
    areaCode: z.string().length(3).regex(/^\d{3}$/),
    tenantId: z.string().uuid(),
  });

  const { areaCode, tenantId } = SearchSchema.parse(req.body);

  const numbers = await searchAvailableNumbers(areaCode);
  sendSuccess(res, numbers);
});

// POST /phone/provision — provision a selected phone number for the tenant
router.post('/provision', requireAuth, async (req: Request, res: Response) => {
  const ProvisionSchema = z.object({
    phoneNumber: z.string().min(1),
    tenantId: z.string().uuid(),
  });

  const { phoneNumber, tenantId } = ProvisionSchema.parse(req.body);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      twilioSubAccountSid: true,
      twilioAuthToken: true,
      twilioPhoneNumber: true,
    },
  });

  if (!tenant) {
    sendError(res, 'Tenant not found', 404);
    return;
  }

  if (tenant.twilioPhoneNumber) {
    sendError(res, 'Tenant already has a provisioned phone number', 400);
    return;
  }

  // Provision a sub-account if the tenant doesn't have one
  let subAccountSid = tenant.twilioSubAccountSid;
  let encryptedAuthToken = tenant.twilioAuthToken;

  if (!subAccountSid || !encryptedAuthToken) {
    logger.info('Provisioning Twilio sub-account', { tenantId });
    const subAccount = await provisionSubAccount(tenant.name);
    await saveTenantTwilioCredentials(tenantId, subAccount.accountSid, subAccount.authToken);
    subAccountSid = subAccount.accountSid;
    // Re-fetch to get the encrypted auth token
    const updated = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { twilioAuthToken: true },
    });
    encryptedAuthToken = updated!.twilioAuthToken;
  }

  const baseUrl = process.env.BASE_URL ?? 'https://api.ringback.com';

  const provisionedNumber = await provisionPhoneNumber(
    tenantId,
    subAccountSid,
    encryptedAuthToken!,
    phoneNumber,
    baseUrl
  );

  logger.info('Phone number provisioned for tenant', { tenantId, phoneNumber: provisionedNumber });

  sendSuccess(res, {
    phoneNumber: provisionedNumber,
    subAccountSid,
  });
});

// GET /phone/status — get current phone number status for tenant
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  const tenantId = z.string().uuid().parse(req.query.tenantId);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      twilioPhoneNumber: true,
      twilioSubAccountSid: true,
    },
  });

  if (!tenant) {
    sendError(res, 'Tenant not found', 404);
    return;
  }

  sendSuccess(res, {
    hasPhoneNumber: !!tenant.twilioPhoneNumber,
    phoneNumber: tenant.twilioPhoneNumber,
    subAccountSid: tenant.twilioSubAccountSid,
  });
});

export default router;
