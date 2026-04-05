import { Router, Request, Response } from 'express';
import { requireOrgAuth } from '../middleware/authMiddleware';
import {
  getOAuthUrl,
  exchangeOAuthCode,
  disconnectSquare,
  refreshSquareToken,
  syncCatalogFromSquare,
  pushCatalogToSquare,
} from '../services/squareService';
import { sendSuccess } from '../utils/response';
import { logger } from '../utils/logger';

const router: Router = Router();

// GET /integrations/square/connect — returns OAuth URL
router.get('/square/connect', requireOrgAuth, (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) {
    res.status(400).json({ success: false, error: 'tenantId required' });
    return;
  }

  const url = getOAuthUrl(tenantId);
  sendSuccess(res, { url });
});

// GET /integrations/square/callback — OAuth redirect handler
router.get('/square/callback', async (req: Request, res: Response) => {
  const { code, state: tenantId, error } = req.query;

  if (error || !code || !tenantId) {
    res.redirect(`${process.env.BASE_URL}/settings?square_error=access_denied`);
    return;
  }

  try {
    await exchangeOAuthCode(tenantId as string, code as string);
    res.redirect(`${process.env.BASE_URL}/settings?square_connected=true`);
  } catch (err) {
    logger.error('Square OAuth callback error', { err, tenantId });
    res.redirect(`${process.env.BASE_URL}/settings?square_error=oauth_failed`);
  }
});

// DELETE /integrations/square/disconnect
router.delete('/square/disconnect', requireOrgAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  await disconnectSquare(tenantId);
  sendSuccess(res, { disconnected: true });
});

// POST /integrations/square/refresh
router.post('/square/refresh', requireOrgAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  await refreshSquareToken(tenantId);
  sendSuccess(res, { refreshed: true });
});

// POST /integrations/square/sync-catalog
router.post('/square/sync-catalog', requireOrgAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const count = await syncCatalogFromSquare(tenantId);
  sendSuccess(res, { synced: count });
});

// POST /integrations/square/push-catalog
router.post('/square/push-catalog', requireOrgAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const count = await pushCatalogToSquare(tenantId);
  sendSuccess(res, { pushed: count });
});

export default router;
