import { Router, Request, Response } from 'express';
import { requireOrgAuth } from '../middleware/authMiddleware';
import { posRegistry } from '../pos/registry';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { PrismaClient, PosProviderType } from '@prisma/client';

const router: Router = Router();
const prisma = new PrismaClient();

// ── Plan gate middleware ─────────────────────────────────────────────────────

async function requirePosAccess(req: Request, res: Response, next: Function): Promise<void> {
  const tenantId = (req.query.tenantId || req.body?.tenantId) as string;
  if (!tenantId) {
    sendError(res, 'tenantId required', 400);
    return;
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  if (!tenant) {
    sendError(res, 'Tenant not found', 404);
    return;
  }
  // POS integration is BUSINESS and SCALE only
  if (tenant.plan !== 'BUSINESS' && tenant.plan !== 'SCALE') {
    sendError(res, 'POS integration requires the Business plan or above', 403);
    return;
  }
  next();
}

// ── List available providers ─────────────────────────────────────────────────

router.get('/providers', requireOrgAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;

  const tenant = tenantId ? await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { posProvider: true, posMerchantId: true, posLocationId: true, posTokenExpiresAt: true, plan: true },
  }) : null;

  const providers = posRegistry.getAll().map((adapter) => ({
    provider: adapter.provider,
    displayName: adapter.displayName,
    authType: adapter.authType,
    connected: tenant?.posProvider === adapter.provider && !!tenant?.posMerchantId,
    merchantId: tenant?.posProvider === adapter.provider ? tenant?.posMerchantId : null,
    locationId: tenant?.posProvider === adapter.provider ? tenant?.posLocationId : null,
    tokenExpiresAt: tenant?.posProvider === adapter.provider ? tenant?.posTokenExpiresAt : null,
    planGated: tenant?.plan !== 'BUSINESS' && tenant?.plan !== 'SCALE',
  }));

  sendSuccess(res, providers);
});

// ── Generic provider routes ──────────────────────────────────────────────────

// GET /integrations/:provider/connect — returns OAuth URL
router.get('/:provider/connect', requireOrgAuth, requirePosAccess, (req: Request, res: Response) => {
  const { provider } = req.params;
  const tenantId = req.query.tenantId as string;

  try {
    const adapter = posRegistry.get(provider);
    const url = adapter.getOAuthUrl(tenantId);
    sendSuccess(res, { url, provider });
  } catch (err: any) {
    sendError(res, err.message, 400);
  }
});

// GET /integrations/:provider/callback — OAuth redirect handler (no auth - redirect from provider)
router.get('/:provider/callback', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code, state: tenantId, error, shop } = req.query;
  const dashboardUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';

  if (error || !code || !tenantId) {
    res.redirect(`${dashboardUrl}/dashboard/integrations?pos_error=access_denied&provider=${provider}`);
    return;
  }

  try {
    const adapter = posRegistry.get(provider);
    await adapter.exchangeCode(tenantId as string, code as string);
    res.redirect(`${dashboardUrl}/dashboard/integrations?pos_connected=true&provider=${provider}`);
  } catch (err) {
    logger.error('POS OAuth callback error', { err, provider, tenantId });
    res.redirect(`${dashboardUrl}/dashboard/integrations?pos_error=oauth_failed&provider=${provider}`);
  }
});

// POST /integrations/:provider/configure — for API key providers (Toast, etc)
router.post('/:provider/configure', requireOrgAuth, requirePosAccess, async (req: Request, res: Response) => {
  const { provider } = req.params;
  const tenantId = req.query.tenantId as string || req.body.tenantId;
  const credentials = req.body.credentials;

  try {
    const adapter = posRegistry.get(provider);
    // Pass credentials as JSON-encoded "code" for API key providers
    await adapter.exchangeCode(tenantId, JSON.stringify(credentials));
    sendSuccess(res, { configured: true, provider });
  } catch (err: any) {
    logger.error('POS configure error', { err, provider, tenantId });
    sendError(res, err.message, 400);
  }
});

// DELETE /integrations/:provider/disconnect
router.delete('/:provider/disconnect', requireOrgAuth, async (req: Request, res: Response) => {
  const { provider } = req.params;
  const tenantId = req.query.tenantId as string;
  const adapter = posRegistry.get(provider);
  await adapter.disconnect(tenantId);
  sendSuccess(res, { disconnected: true, provider });
});

// POST /integrations/:provider/refresh
router.post('/:provider/refresh', requireOrgAuth, async (req: Request, res: Response) => {
  const { provider } = req.params;
  const tenantId = req.query.tenantId as string;
  const adapter = posRegistry.get(provider);
  await adapter.refreshToken(tenantId);
  sendSuccess(res, { refreshed: true, provider });
});

// GET /integrations/sync-history — get sync log history
router.get('/sync-history', requireOrgAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) { sendError(res, 'tenantId required', 400); return; }

  const logs = await prisma.posSyncLog.findMany({
    where: { tenantId },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });

  sendSuccess(res, { logs });
});

// POST /integrations/:provider/sync-catalog — pull from POS
router.post('/:provider/sync-catalog', requireOrgAuth, requirePosAccess, async (req: Request, res: Response) => {
  const { provider } = req.params;
  const tenantId = req.query.tenantId as string;

  const log = await prisma.posSyncLog.create({
    data: { tenantId, provider: provider as PosProviderType, direction: 'pull', totalItems: 0 },
  });

  try {
    const adapter = posRegistry.get(provider);
    const result = await adapter.syncCatalogFromPOS(tenantId);

    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        totalItems: result.total,
        newItems: result.newItems,
        updatedItems: result.updated,
        unchangedItems: result.unchanged,
        errors: result.errors,
      },
    });

    sendSuccess(res, { synced: result.total, newItems: result.newItems, updated: result.updated, unchanged: result.unchanged, errors: result.errors, provider, logId: log.id });
  } catch (err: any) {
    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: { status: 'failed', completedAt: new Date(), errorDetail: { message: err.message } },
    });
    throw err;
  }
});

// POST /integrations/:provider/push-catalog — push to POS
router.post('/:provider/push-catalog', requireOrgAuth, requirePosAccess, async (req: Request, res: Response) => {
  const { provider } = req.params;
  const tenantId = req.query.tenantId as string;

  const log = await prisma.posSyncLog.create({
    data: { tenantId, provider: provider as PosProviderType, direction: 'push', totalItems: 0 },
  });

  try {
    const adapter = posRegistry.get(provider);
    const count = await adapter.pushCatalogToPOS(tenantId);

    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: { status: 'completed', completedAt: new Date(), totalItems: count },
    });

    sendSuccess(res, { pushed: count, provider, logId: log.id });
  } catch (err: any) {
    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: { status: 'failed', completedAt: new Date(), errorDetail: { message: err.message } },
    });
    throw err;
  }
});

// GET /integrations/:provider/status
router.get('/:provider/status', requireOrgAuth, async (req: Request, res: Response) => {
  const { provider } = req.params;
  const tenantId = req.query.tenantId as string;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { posProvider: true, posMerchantId: true, posLocationId: true, posTokenExpiresAt: true },
  });

  sendSuccess(res, {
    provider,
    connected: tenant?.posProvider === provider && !!tenant?.posMerchantId,
    merchantId: tenant?.posProvider === provider ? tenant?.posMerchantId : null,
    locationId: tenant?.posProvider === provider ? tenant?.posLocationId : null,
    tokenExpiresAt: tenant?.posProvider === provider ? tenant?.posTokenExpiresAt : null,
  });
});

export default router;
