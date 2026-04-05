import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import twilio from 'twilio';
import { logger } from '../utils/logger';
import { decryptNullable } from '../utils/encryption';

// Augment Express Request to carry tenant context
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      twilioToNumber?: string;
    }
  }
}

const prisma = new PrismaClient();

/**
 * Resolves the tenant from the Twilio `To` phone number in the webhook body,
 * then validates the Twilio signature using the tenant's sub-account auth token.
 */
export async function tenantResolver(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const toNumber: string | undefined = req.body?.To ?? req.query?.To as string | undefined;

    if (!toNumber) {
      res.status(400).send('Missing To number');
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { twilioPhoneNumber: toNumber },
      select: {
        id: true,
        isActive: true,
        twilioAuthToken: true,
        twilioSubAccountSid: true,
      },
    });

    if (!tenant || !tenant.isActive) {
      logger.warn('Tenant not found or inactive for number', { toNumber });
      res.status(404).send('Tenant not found');
      return;
    }

    // Validate Twilio signature using per-tenant auth token
    const authToken = decryptNullable(tenant.twilioAuthToken);
    if (authToken) {
      const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
      const url = `${process.env.BASE_URL}${req.originalUrl}`;

      const isValid = twilio.validateRequest(
        authToken,
        twilioSignature ?? '',
        url,
        req.body as Record<string, string>
      );

      if (!isValid) {
        logger.warn('Invalid Twilio signature', { toNumber, tenantId: tenant.id });
        res.status(403).send('Invalid signature');
        return;
      }
    }

    req.tenantId = tenant.id;
    req.twilioToNumber = toNumber;
    next();
  } catch (error) {
    logger.error('tenantResolver error', { error });
    next(error);
  }
}
