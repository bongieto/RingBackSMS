import { prisma } from '../db';
import { sendSms } from './twilioService';
import { logger } from '../logger';

/**
 * If the caller has a recently-completed order awaiting review and their
 * SMS is a bare 1-5 rating, persist it and thank them. Returns `true` if
 * the message was consumed as a review (so the caller-SMS handler skips
 * the AI flow).
 *
 * Conservative matcher: only bare-integer replies (with optional
 * trailing comment). "5" / "5 great!" / "5!" all count; a full sentence
 * that happens to contain a digit does not.
 */
const RATING_RE = /^\s*([1-5])(?:[\s!.,]+(.*))?$/i;

export async function tryConsumeReviewReply(
  tenantId: string,
  callerPhone: string,
  body: string,
): Promise<boolean> {
  const match = body.match(RATING_RE);
  if (!match) return false;
  const rating = parseInt(match[1], 10);
  const comment = match[2]?.trim() || null;

  // Find the most recent COMPLETED order from this caller in the last 24h
  // that doesn't already have a review.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const order = await prisma.order.findFirst({
    where: {
      tenantId,
      callerPhone,
      status: 'COMPLETED',
      createdAt: { gte: since },
      // No existing review for this order
      // (Prisma can't easily express "left join is null" here, so do a
      //  cheap separate check below.)
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderNumber: true, tenantId: true },
  });
  if (!order) return false;
  const existing = await prisma.orderReview.findUnique({ where: { orderId: order.id } });
  if (existing) return false;

  try {
    await prisma.orderReview.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        rating,
        comment,
      },
    });
    const thanks = rating >= 4
      ? `Thanks for the ${rating}-star rating! We appreciate you.`
      : `Thanks for the feedback — sorry we missed the mark. Reply back if there's anything we can do.`;
    await sendSms(tenantId, callerPhone, thanks).catch(() => {});
    logger.info('Order review saved', { orderId: order.id, rating });
    return true;
  } catch (err: any) {
    logger.warn('Failed to save review', { err: err?.message, orderId: order.id });
    return false;
  }
}
