import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/authMiddleware';
import { sendSuccess } from '../utils/response';

const router: Router = Router();
const prisma = new PrismaClient();

// GET /analytics/:tenantId
router.get('/:tenantId', requireAuth, async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const days = parseInt(req.query.days as string ?? '30', 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalMissedCalls,
    totalConversations,
    totalOrders,
    totalMeetings,
    recentUsage,
    orderRevenue,
  ] = await Promise.all([
    prisma.missedCall.count({ where: { tenantId, occurredAt: { gte: since } } }),
    prisma.conversation.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.order.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.meeting.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.usageLog.groupBy({
      by: ['type'],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.order.aggregate({ where: { tenantId, createdAt: { gte: since } }, _sum: { total: true } }),
  ]);

  const usageByType = Object.fromEntries(
    recentUsage.map((u) => [u.type, u._count.id])
  );
  const revenue = Number(orderRevenue._sum.total ?? 0);

  sendSuccess(res, {
    period: { days, since },
    missedCalls: totalMissedCalls,
    conversations: totalConversations,
    orders: totalOrders,
    meetings: totalMeetings,
    revenue,
    usage: usageByType,
  });
});

export default router;
