import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/authMiddleware';
import { listTenants } from '../services/tenantService';
import { sendSuccess, sendPaginated } from '../utils/response';

const router: Router = Router();
const prisma = new PrismaClient();

// GET /admin/tenants
router.get('/tenants', requireAuth, async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize as string ?? '20', 10);
  const { tenants, total } = await listTenants(page, pageSize);
  sendPaginated(res, tenants, total, page, pageSize);
});

// GET /admin/stats
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  const [tenantCount, activeConversations, totalOrders] = await Promise.all([
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.conversation.count({ where: { isActive: true } }),
    prisma.order.count(),
  ]);

  sendSuccess(res, {
    tenants: tenantCount,
    activeConversations,
    totalOrders,
  });
});

export default router;
