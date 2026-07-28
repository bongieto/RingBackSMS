import request from 'supertest';
import express from 'express';
import 'express-async-errors';

// Mock all external dependencies
jest.mock('@prisma/client', () => {
  const mockCreate = jest.fn().mockResolvedValue({ id: 'mc-1', smsSent: false });
  const mockUpdate = jest.fn().mockResolvedValue({});
  const mockFindUnique = jest.fn();
  const mockEventLogFindUnique = jest.fn().mockResolvedValue(null);
  const mockEventLogCreate = jest.fn().mockResolvedValue({});

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      missedCall: { create: mockCreate, update: mockUpdate },
      tenant: { findUnique: mockFindUnique },
      webhookEventLog: { findUnique: mockEventLogFindUnique, create: mockEventLogCreate },
    })),
    __mocks: {
      create: mockCreate,
      update: mockUpdate,
      findUnique: mockFindUnique,
      eventLogFindUnique: mockEventLogFindUnique,
      eventLogCreate: mockEventLogCreate,
    },
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

  describe('POST /stripe — idempotency dedup', () => {
    const { __mocks } = jest.requireMock('@prisma/client') as {
      __mocks: { eventLogFindUnique: jest.Mock; eventLogCreate: jest.Mock };
    };
    const billing = jest.requireMock('../services/billingService') as {
      constructStripeEvent: jest.Mock;
      handleSubscriptionUpdated: jest.Mock;
    };

    beforeEach(() => {
      jest.clearAllMocks();
      billing.constructStripeEvent.mockReturnValue({
        id: 'evt_test_123',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1' } },
      });
    });

    it('processes a first-time event and logs it', async () => {
      __mocks.eventLogFindUnique.mockResolvedValue(null);
      __mocks.eventLogCreate.mockResolvedValue({});

      const res = await request(app).post('/stripe').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(__mocks.eventLogCreate).toHaveBeenCalledWith({
        data: { id: 'evt_test_123', provider: 'stripe', eventType: 'customer.subscription.updated' },
      });
      expect(billing.handleSubscriptionUpdated).toHaveBeenCalledTimes(1);
    });

    it('skips a duplicate event without re-invoking the handler', async () => {
      __mocks.eventLogFindUnique.mockResolvedValue({ id: 'evt_test_123' });

      const res = await request(app).post('/stripe').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, duplicate: true });
      expect(__mocks.eventLogCreate).not.toHaveBeenCalled();
      expect(billing.handleSubscriptionUpdated).not.toHaveBeenCalled();
    });

    it('treats a P2002 race on insert as a duplicate', async () => {
      __mocks.eventLogFindUnique.mockResolvedValue(null);
      __mocks.eventLogCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      const res = await request(app).post('/stripe').send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, duplicate: true });
      expect(billing.handleSubscriptionUpdated).not.toHaveBeenCalled();
    });

    it('returns 500 on a non-P2002 dedup failure so Stripe retries', async () => {
      __mocks.eventLogFindUnique.mockRejectedValue(new Error('db down'));

      const res = await request(app).post('/stripe').send({});

      expect(res.status).toBe(500);
      expect(billing.handleSubscriptionUpdated).not.toHaveBeenCalled();
    });
  });
});
