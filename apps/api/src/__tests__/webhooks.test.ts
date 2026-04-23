import request from 'supertest';
import express from 'express';
import 'express-async-errors';

// Twilio webhook routes (voice + SMS) used to live in this Express app but
// were moved to the Next.js app under apps/web/src/app/api/webhooks/twilio/*.
// What's left on the Express side is Stripe, Square, and generic POS —
// this test file covers those.

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
  describe('POST /twilio/* (removed)', () => {
    // The old Express handlers at /twilio/call-status and /twilio/sms-reply
    // were deleted — Twilio now posts to the Next.js app. Confirm the
    // Express router returns 404 here so a stale Twilio webhook URL is
    // obvious in the logs rather than silently swallowed.
    it('returns 404 for /twilio/call-status (moved to Next.js app)', async () => {
      const res = await request(app).post('/twilio/call-status').send({});
      expect(res.status).toBe(404);
    });

    it('returns 404 for /twilio/sms-reply (moved to Next.js app)', async () => {
      const res = await request(app).post('/twilio/sms-reply').send({});
      expect(res.status).toBe(404);
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
