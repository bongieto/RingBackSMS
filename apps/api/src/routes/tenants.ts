import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { requireAuth, requireOrgAuth } from '../middleware/authMiddleware';
import {
  createTenant,
  getTenantById,
  getTenantByClerkOrg,
  updateTenantConfig,
  getTenantMenuItems,
  upsertMenuItem,
} from '../services/tenantService';
import { CreateTenantRequestSchema, UpdateTenantConfigRequestSchema } from '@ringback/shared-types';
import { sendSuccess, sendCreated, sendError, sendPaginated } from '../utils/response';
import { logger } from '../utils/logger';

const router: Router = Router();
const prisma = new PrismaClient();

// GET /tenants/me — get current tenant by Clerk org
router.get('/me', requireOrgAuth, async (req: Request, res: Response) => {
  try {
    const tenant = await getTenantByClerkOrg(req.clerkOrgId!);
    sendSuccess(res, tenant);
  } catch (error) {
    sendError(res, 'Tenant not found', 404);
  }
});

// POST /tenants — create new tenant
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const body = CreateTenantRequestSchema.parse(req.body);
  const tenant = await createTenant({
    ...body,
    clerkOrgId: req.clerkOrgId,
  });
  sendCreated(res, tenant);
});

// GET /tenants/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const tenant = await getTenantById(req.params.id);
  sendSuccess(res, tenant);
});

// PATCH /tenants/:id/config
router.patch('/:id/config', requireOrgAuth, async (req: Request, res: Response) => {
  const body = UpdateTenantConfigRequestSchema.parse(req.body);
  const config = await updateTenantConfig(req.params.id, body);
  sendSuccess(res, config);
});

// GET /tenants/:id/menu
router.get('/:id/menu', requireAuth, async (req: Request, res: Response) => {
  const items = await getTenantMenuItems(req.params.id);
  sendSuccess(res, items);
});

// POST /tenants/:id/menu
router.post('/:id/menu', requireOrgAuth, async (req: Request, res: Response) => {
  const ItemSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    price: z.number().nonnegative(),
    category: z.string().optional(),
    isAvailable: z.boolean().optional(),
  });

  const body = ItemSchema.parse(req.body);
  const item = await upsertMenuItem(req.params.id, body);
  sendCreated(res, item);
});

// DELETE /tenants/:id/menu/:itemId
router.delete('/:id/menu/:itemId', requireOrgAuth, async (req: Request, res: Response) => {
  const item = await prisma.menuItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!item) {
    sendError(res, 'Menu item not found', 404);
    return;
  }

  if (item.tenantId !== req.params.id) {
    sendError(res, 'Menu item does not belong to this tenant', 403);
    return;
  }

  await prisma.menuItem.delete({ where: { id: req.params.itemId } });
  sendSuccess(res, { deleted: true });
});

// GET /tenants/:id/flows
router.get('/:id/flows', requireAuth, async (req: Request, res: Response) => {
  const flows = await prisma.flow.findMany({
    where: { tenantId: req.params.id },
    orderBy: { type: 'asc' },
  });
  sendSuccess(res, flows);
});

// PATCH /tenants/:id/flows/:flowId
router.patch('/:id/flows/:flowId', requireOrgAuth, async (req: Request, res: Response) => {
  const FlowUpdateSchema = z.object({
    isEnabled: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  });

  const body = FlowUpdateSchema.parse(req.body);
  const flow = await prisma.flow.update({
    where: { id: req.params.flowId },
    data: {
      ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
      ...(body.config !== undefined && { config: body.config as unknown as Prisma.InputJsonValue }),
    },
  });
  sendSuccess(res, flow);
});

export default router;
