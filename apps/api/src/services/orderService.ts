import { PrismaClient, OrderStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

export interface CreateOrderInput {
  tenantId: string;
  conversationId: string;
  callerPhone: string;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }>;
  total: number;
  pickupTime: string | null;
  notes: string | null;
  stripePaymentId?: string;
  stripePaymentUrl?: string;
  paymentStatus?: string;
}

export async function createOrder(input: CreateOrderInput) {
  const order = await prisma.order.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      callerPhone: input.callerPhone,
      orderNumber: generateOrderNumber(),
      status: OrderStatus.CONFIRMED,
      items: input.items,
      total: input.total,
      pickupTime: input.pickupTime,
      notes: input.notes,
      ...(input.stripePaymentId && { stripePaymentId: input.stripePaymentId }),
      ...(input.stripePaymentUrl && { stripePaymentUrl: input.stripePaymentUrl }),
      ...(input.paymentStatus && { paymentStatus: input.paymentStatus }),
    },
  });

  logger.info('Order created', {
    tenantId: input.tenantId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
  });

  return order;
}

export async function updateOrderStatus(
  orderId: string,
  tenantId: string,
  status: OrderStatus,
  squareOrderId?: string,
  squarePaymentId?: string
) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(squareOrderId && { squareOrderId }),
      ...(squarePaymentId && { squarePaymentId }),
    },
  });
}

export async function getTenantOrders(
  tenantId: string,
  status?: OrderStatus,
  page = 1,
  pageSize = 20
) {
  const where = { tenantId, ...(status && { status }) };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
}

export async function getOrderById(orderId: string, tenantId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
  });
}
