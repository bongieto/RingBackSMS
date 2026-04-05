import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { requireAuth } from '../middleware/authMiddleware';
import {
  getTenantOrders,
  getOrderById,
  updateOrderStatus,
} from '../services/orderService';
import { sendSuccess, sendPaginated, sendError } from '../utils/response';
import { NotFoundError, ValidationError } from '../utils/errors';

const router: Router = Router();

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

// GET /orders?tenantId=&status=&page=&pageSize=
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) {
    sendError(res, 'tenantId is required', 400);
    return;
  }

  const status = req.query.status as OrderStatus | undefined;
  const page = parseInt(req.query.page as string ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize as string ?? '20', 10);

  if (status && !Object.values(OrderStatus).includes(status)) {
    sendError(res, `Invalid status: ${status}`, 400);
    return;
  }

  const { orders, total } = await getTenantOrders(tenantId, status, page, pageSize);
  sendPaginated(res, orders, total, page, pageSize);
});

// GET /orders/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) {
    sendError(res, 'tenantId is required', 400);
    return;
  }

  const order = await getOrderById(req.params.id, tenantId);
  if (!order) {
    throw new NotFoundError('Order');
  }

  sendSuccess(res, order);
});

// PATCH /orders/:id/status
router.patch('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const StatusUpdateSchema = z.object({
    status: z.nativeEnum(OrderStatus),
    tenantId: z.string().min(1),
  });

  const body = StatusUpdateSchema.parse(req.body);

  const order = await getOrderById(req.params.id, body.tenantId);
  if (!order) {
    throw new NotFoundError('Order');
  }

  const allowedTransitions = STATUS_TRANSITIONS[order.status] ?? [];
  if (!allowedTransitions.includes(body.status)) {
    throw new ValidationError(
      `Cannot transition from ${order.status} to ${body.status}`
    );
  }

  const updated = await updateOrderStatus(req.params.id, body.tenantId, body.status);
  sendSuccess(res, updated);
});

export default router;
