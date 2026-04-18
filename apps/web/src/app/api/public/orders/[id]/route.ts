import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/server/rateLimit';

/**
 * Public, link-only order-status endpoint. No auth — the unguessable
 * Order.id UUID is the access token. We rate-limit per IP and return
 * only the narrow slice the tracker page needs (status + ETA + summary).
 * Never return callerPhone, stripe ids, or anything tenant-internal.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return Response.json({ error: 'Invalid order id' }, { status: 400 });
  }
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(`order-status:${ip}`, 120, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      status: true,
      estimatedReadyTime: true,
      pickupTime: true,
    },
  });
  if (!order) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({
    status: order.status,
    estimatedReadyTime: order.estimatedReadyTime ? order.estimatedReadyTime.toISOString() : null,
    pickupTime: order.pickupTime,
  });
}
