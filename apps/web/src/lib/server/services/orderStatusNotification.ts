import { OrderStatus } from '@prisma/client';
import { prisma } from '../db';
import { decryptMaybePlaintext, looksEncrypted } from '../encryption';
import { sms as i18nSms } from '../i18n';
import { logger } from '../logger';
import { sendSmsWithRetry } from './twilioService';

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://ringbacksms.com').replace(/\/+$/, '');
}

export async function notifyCustomerOfOrderStatus(
  tenantId: string,
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      orderNumber: true,
      callerPhone: true,
      customerName: true,
    },
  });
  if (!order) return;
  if (!/^\+[1-9]\d{7,14}$/.test(order.callerPhone)) {
    logger.info('Order status SMS skipped for non-SMS external customer', { tenantId, orderId });
    return;
  }
  const [tenant, contact] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, config: { select: { defaultPrepTimeMinutes: true } } },
    }),
    prisma.contact.findFirst({
      where: { tenantId, phone: order.callerPhone },
      select: { preferredLanguage: true },
    }),
  ]);
  if (!tenant) return;
  const plainName = decryptMaybePlaintext(order.customerName);
  const safeName = plainName && !looksEncrypted(plainName) ? plainName : null;
  const vars = {
    firstName: safeName?.trim().split(/\s+/)[0],
    orderNumber: order.orderNumber,
    businessName: tenant.name,
    prepMins: tenant.config?.defaultPrepTimeMinutes ?? null,
    trackerUrl: `${appUrl()}/o/${order.id}`,
    receiptUrl: `${appUrl()}/r/${order.id}`,
  };
  const lang = contact?.preferredLanguage ?? null;
  const message =
    status === OrderStatus.CONFIRMED
      ? vars.prepMins
        ? i18nSms('statusConfirmedWithPrep', lang, vars)
        : i18nSms('statusConfirmed', lang, vars)
      : status === OrderStatus.PREPARING
        ? i18nSms('statusPreparing', lang, vars)
        : status === OrderStatus.READY
          ? i18nSms('statusReady', lang, vars)
          : status === OrderStatus.CANCELLED
            ? i18nSms('statusCancelled', lang, vars)
            : null;
  if (!message) return;
  await sendSmsWithRetry(tenantId, order.callerPhone, message, 2);
  logger.info('Partner order status SMS sent', { tenantId, orderId, status });
}
