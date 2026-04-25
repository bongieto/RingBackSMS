import request from 'supertest';
import express from 'express';
import 'express-async-errors';

// Mock all external dependencies
jest.mock('@prisma/client', () => {
  const mockCreate = jest.fn().mockResolvedValue({ id: 'mc-1', smsSent: false });
  const mockUpdate = jest.fn().mockResolvedValue({});
  const mockFindUnique = jest.fn();

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      missedCall: { create: mockCreate, update: mockUpdate },
      tenant: { findUnique: mockFindUnique },
    })),
    __mocks: { create: mockCreate, update: mockUpdate, findUnique: mockFindUnique },
  };
});

jest.mock('../middleware/tenantResolver', () => ({
  tenantResolver: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { tenantId: string }).tenantId = 'tenant-test';
    next();
  },
}));

jest.mock('../middleware/rateLimiter', () => ({
  smsRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../middleware/usageMeter', () => ({
  checkSmsLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  incrementSmsUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/flowEngineService', () => ({
  processInboundSms: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/twilioService', () => ({
  sendSms: jest.fn().mockResolvedValue('SM123'),
}));

jest.mock('../services/billingService', () => ({
  constructStripeEvent: jest.fn(),
  handleSubscriptionUpdated: jest.fn().mockResolvedValue(undefined),
  handleSubscriptionDeleted: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/squareService', () => ({
  verifySquareWebhook: jest.fn().mockReturnValue(true),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import webhookRoutes from '../routes/webhooks';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', webhookRoutes);

describe('Webhook routes', () => {
  describe('POST /twilio/call-status', () => {
    const { __mocks } = jest.requireMock('@prisma/client') as {
      __mocks: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    };

    beforeEach(() => {
      jest.clearAllMocks();
      __mocks.findUnique.mockResolvedValue({
        id: 'tenant-test',
        plan: 'PRO',
        stripeSubscriptionId: null,
        config: { greeting: 'Hi there!', timezone: 'America/Chicago' },
      });
    });

    it('returns 200 for in-progress calls (no action)', async () => {
      const res = await request(app)
        .post('/twilio/call-status')
        .send({
          CallSid: 'CA123',
          AccountSid: 'AC123',
          From: '+12175550199',
          To: '+12175550100',
          CallStatus: 'in-progress',
          Direction: 'inbound',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    });

    it('handles missed call (no-answer status)', async () => {
      const res = await request(app)
        .post('/twilio/call-status')
        .send({
          CallSid: 'CA456',
          AccountSid: 'AC123',
          From: '+12175550199',
          To: '+12175550100',
          CallStatus: 'no-answer',
          Direction: 'inbound',
        });

      expect(res.status).toBe(200);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/twilio/call-status')
        .send({ From: '+12175550199' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /twilio/sms-reply', () => {
    it('returns TwiML 200 immediately and processes async', async () => {
      const res = await request(app)
        .post('/twilio/sms-reply')
        .send({
          MessageSid: 'SM789',
          AccountSid: 'AC123',
          From: '+12175550199',
          To: '+12175550100',
          Body: 'ORDER',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('<Response>');
    });

    it('returns 400 for invalid payload', async () => {
      const res = await request(app)
        .post('/twilio/sms-reply')
        .send({ Body: 'hello' }); // Missing required fields

      expect(res.status).toBe(400);
    });
  });

  describe('POST /square', () => {
    it('returns 200 for valid Square webhook', async () => {
      const res = await request(app)
        .post('/square')
        .set('x-square-hmacsha256-signature', 'valid-sig')
        .send({ type: 'catalog.version.updated', merchant_id: 'MERCHANT1' });

      expect(res.status).toBe(200);
    });
  });
});
