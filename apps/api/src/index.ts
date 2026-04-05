import 'express-async-errors';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { clerkAuth } from './middleware/authMiddleware';
import { errorHandler } from './middleware/errorHandler';
import webhookRoutes from './routes/webhooks';
import tenantRoutes from './routes/tenants';
import conversationRoutes from './routes/conversations';
import analyticsRoutes from './routes/analytics';
import billingRoutes from './routes/billing';
import integrationRoutes from './routes/integrations';
import adminRoutes from './routes/admin';
import meetingRoutes from './routes/meetings';
import orderRoutes from './routes/orders';
import contactRoutes from './routes/contacts';
import phoneRoutes from './routes/phone';
import { logger } from './utils/logger';

const app: Application = express();
const PORT = process.env.PORT ?? 3001;

// ── Trust proxy (for Railway/cloud deployments) ───────────────────────────────
app.set('trust proxy', 1);

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://app.ringback.com', process.env.BASE_URL ?? '']
    : '*',
  credentials: true,
}));

// ── Stripe webhook needs raw body ─────────────────────────────────────────────
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// ── General body parsing ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ── Health check (no auth) ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.0.1',
  });
});

// ── Clerk auth (global) ───────────────────────────────────────────────────────
app.use(clerkAuth);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhooks', webhookRoutes);
app.use('/tenants', tenantRoutes);
app.use('/conversations', conversationRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/billing', billingRoutes);
app.use('/integrations', integrationRoutes);
app.use('/admin', adminRoutes);
app.use('/meetings', meetingRoutes);
app.use('/orders', orderRoutes);
app.use('/contacts', contactRoutes);
app.use('/phone', phoneRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`RingBack API running on port ${PORT}`, {
    env: process.env.NODE_ENV,
    port: PORT,
  });
});

// ── POS Token Refresh Job ────────────────────────────────────────────────────
import { refreshExpiringPosTokens } from './pos/tokenRefreshJob';

const THIRTY_MINUTES = 30 * 60 * 1000;
setInterval(() => {
  refreshExpiringPosTokens().catch((e: unknown) => logger.error('Token refresh job failed', { error: e }));
}, THIRTY_MINUTES);

// Run once on startup
refreshExpiringPosTokens().catch((e: unknown) => logger.error('Initial token refresh failed', { error: e }));

export default app;
