import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient, Plan, BusinessType } from '@prisma/client';
import { getAuth } from '@clerk/express';
import { requireAuth } from '../middleware/authMiddleware';
import { listTenants } from '../services/tenantService';
import { sendSuccess, sendPaginated, sendError } from '../utils/response';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

const router: Router = Router();
const prisma = new PrismaClient();

// ── Super-admin gate ──────────────────────────────────────────────────────────

function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const adminUserId = process.env.SUPER_ADMIN_USER_ID;

  if (!adminUserId) {
    sendError(res, 'Admin access not configured', 503);
    return;
  }

  if (!auth.userId || auth.userId !== adminUserId) {
    throw new ForbiddenError('Super-admin access required');
  }

  next();
}

// Apply both middlewares to all admin routes
router.use(requireAuth, requireSuperAdmin);

// ── Platform stats ────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalTenants,
    activeTenants,
    totalConversations,
    activeConversations,
    totalOrders,
    totalContacts,
    totalMeetings,
    smsSentLast30Days,
    planBreakdown,
    newTenantsLast30Days,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.conversation.count(),
    prisma.conversation.count({ where: { isActive: true } }),
    prisma.order.count(),
    prisma.contact.count(),
    prisma.meeting.count(),
    prisma.usageLog.count({
      where: { type: 'SMS_SENT', createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.tenant.groupBy({
      by: ['plan'],
      _count: { plan: true },
    }),
    prisma.tenant.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const planCounts: Record<string, number> = {};
  for (const row of planBreakdown) {
    planCounts[row.plan] = row._count.plan;
  }

  sendSuccess(res, {
    tenants: { total: totalTenants, active: activeTenants, newLast30Days: newTenantsLast30Days },
    conversations: { total: totalConversations, active: activeConversations },
    orders: totalOrders,
    contacts: totalContacts,
    meetings: totalMeetings,
    sms: { sentLast30Days: smsSentLast30Days },
    plans: planCounts,
  });
});

// ── Tenant list ───────────────────────────────────────────────────────────────

router.get('/tenants', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize as string ?? '20', 10);
  const search = req.query.search as string | undefined;
  const plan = req.query.plan as Plan | undefined;
  const isActive = req.query.isActive !== undefined
    ? req.query.isActive === 'true'
    : undefined;

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { clerkOrgId: { contains: search } },
      ],
    }),
    ...(plan && { plan }),
    ...(isActive !== undefined && { isActive }),
  };

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        businessType: true,
        plan: true,
        isActive: true,
        clerkOrgId: true,
        twilioPhoneNumber: true,
        posProvider: true,
        createdAt: true,
        _count: {
          select: {
            conversations: true,
            orders: true,
            contacts: true,
          },
        },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  sendPaginated(res, tenants, total, page, pageSize);
});

// ── Tenant detail ─────────────────────────────────────────────────────────────

router.get('/tenants/:id', async (req: Request, res: Response) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
    include: {
      config: true,
      _count: {
        select: {
          conversations: true,
          orders: true,
          contacts: true,
          meetings: true,
          missedCalls: true,
          usageLogs: true,
        },
      },
    },
  });

  if (!tenant) throw new NotFoundError('Tenant');

  // Get SMS usage in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const smsLast30Days = await prisma.usageLog.count({
    where: {
      tenantId: tenant.id,
      type: 'SMS_SENT',
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Get recent conversations
  const recentConversations = await prisma.conversation.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, callerPhone: true, flowType: true, isActive: true, createdAt: true },
  });

  // Remove sensitive encrypted fields from response
  const { squareAccessToken, squareRefreshToken, posAccessToken, posRefreshToken, twilioAuthToken, ...safeTenant } = tenant as any;

  sendSuccess(res, {
    ...safeTenant,
    smsLast30Days,
    recentConversations,
  });
});

// ── Update tenant (plan, active status) ──────────────────────────────────────

router.patch('/tenants/:id', async (req: Request, res: Response) => {
  const UpdateSchema = z.object({
    plan: z.nativeEnum(Plan).optional(),
    isActive: z.boolean().optional(),
    name: z.string().min(1).optional(),
  });

  const body = UpdateSchema.parse(req.body);

  const existing = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Tenant');

  const tenant = await prisma.tenant.update({
    where: { id: req.params.id },
    data: body,
  });

  logger.info('Admin updated tenant', {
    adminAction: true,
    tenantId: req.params.id,
    changes: body,
  });

  sendSuccess(res, tenant);
});

// ── Recent activity feed ──────────────────────────────────────────────────────

router.get('/activity', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string ?? '50', 10);

  const [recentConversations, recentOrders, recentTenants] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        tenantId: true,
        callerPhone: true,
        flowType: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.floor(limit / 2),
      select: {
        id: true,
        tenantId: true,
        orderNumber: true,
        total: true,
        status: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, plan: true, businessType: true, createdAt: true },
    }),
  ]);

  sendSuccess(res, { recentConversations, recentOrders, recentTenants });
});

export default router;
