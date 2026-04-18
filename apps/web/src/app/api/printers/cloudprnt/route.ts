import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { renderOrderTicket } from '@/lib/server/services/escpos';
import { logger } from '@/lib/server/logger';

/**
 * Star Micronics CloudPRNT endpoint.
 *
 * Flow (Star CloudPRNT v1 protocol):
 *   1. Printer polls GET ?token=XXX periodically (default ~10s).
 *      - If no job: 200 { jobReady: false }
 *      - If job waiting: 200 { jobReady: true, mediaTypes: ["application/vnd.star.starprnt"], jobToken: "<orderId>" }
 *   2. Printer re-GETs ?token=XXX&jobToken=<orderId> with Accept header set
 *      → we return raw ESC/POS bytes with content-type application/vnd.star.starprnt
 *   3. Printer POSTs ?token=XXX with { jobToken, code } reporting success/fail
 *      → we mark Order.printedAt on success.
 *
 * Auth: the tenant generates a cloudPrntToken in settings and configures it
 * on the printer's "Server URL" field. Token maps 1-1 to a tenant.
 *
 * NOTE: this endpoint is intentionally untested against a real printer —
 * the code is structured for easy debug once hardware is in hand. Any
 * printer errors surface via the POST status and get logged.
 */

async function resolveTenant(token: string | null) {
  if (!token || token.length < 8) return null;
  const config = await prisma.tenantConfig.findFirst({
    where: { cloudPrntToken: token },
    select: { tenantId: true },
  });
  return config?.tenantId ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const jobToken = searchParams.get('jobToken');
  const accept = req.headers.get('accept') ?? '';

  const tenantId = await resolveTenant(token);
  if (!tenantId) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  // If printer is requesting the actual job bytes, return ESC/POS directly.
  if (jobToken && accept.includes('application/vnd.star.starprnt')) {
    const order = await prisma.order.findFirst({
      where: { id: jobToken, tenantId },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        callerPhone: true,
        items: true,
        pickupTime: true,
        notes: true,
        total: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    });
    if (!order) return new Response('Not found', { status: 404 });
    const bytes = renderOrderTicket({
      businessName: order.tenant.name,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      callerPhone: order.callerPhone,
      items: Array.isArray(order.items)
        ? (order.items as unknown as Array<{
            name: string;
            quantity: number;
            selectedModifiers?: Array<{ groupName: string; modifierName: string }>;
            notes?: string | null;
          }>)
        : [],
      pickupTime: order.pickupTime,
      notes: order.notes,
      total: Number(order.total),
      createdAt: order.createdAt,
    });
    // Copy into a fresh ArrayBuffer so TypeScript's DOM lib is happy about
    // BodyInit — node's Response type expects ArrayBuffer-backed bytes.
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    return new Response(ab, {
      status: 200,
      headers: { 'Content-Type': 'application/vnd.star.starprnt' },
    });
  }

  // Poll: find oldest CONFIRMED or PENDING order not yet printed.
  const nextJob = await prisma.order.findFirst({
    where: {
      tenantId,
      printedAt: null,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!nextJob) {
    return Response.json({ jobReady: false });
  }
  return Response.json({
    jobReady: true,
    mediaTypes: ['application/vnd.star.starprnt'],
    jobToken: nextJob.id,
  });
}

/** Printer reports back after printing. Body shape per CloudPRNT spec. */
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const tenantId = await resolveTenant(token);
  if (!tenantId) return Response.json({ error: 'Invalid token' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const jobToken: string | undefined = body.jobToken;
  const code = body.code as string | number | undefined;
  if (!jobToken) return Response.json({ ok: true });

  const codeStr = code != null ? String(code) : '';
  if (codeStr === '200' || codeStr.toLowerCase() === 'success') {
    await prisma.order
      .updateMany({
        where: { id: jobToken, tenantId, printedAt: null },
        data: { printedAt: new Date() },
      })
      .catch((err) => logger.warn('cloudprnt: mark printedAt failed', { err }));
  } else {
    logger.warn('cloudprnt: print job reported failure', { tenantId, jobToken, code });
  }
  return Response.json({ ok: true });
}
