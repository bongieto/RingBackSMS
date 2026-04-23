/**
 * Admin-only read/mutation endpoint for the SideEffectFailure DLQ.
 *
 *   GET  /api/admin/side-effect-failures?status=open&type=SAVE_ORDER
 *        Returns up to 100 failure rows (newest first) matching filters.
 *
 *   POST /api/admin/side-effect-failures
 *        Body: { id: string, action: 'resolve' | 'retry' }
 *        'resolve' marks the row as operator-dismissed.
 *        'retry' synchronously replays via processSideEffect and flips
 *          resolvedAt on success.
 *
 * The scheduled reprocessor at /api/cron/reprocess-side-effects handles
 * the common case; this endpoint is for the Superadmin UI where an
 * operator wants to manually review or force a retry.
 */
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';
import { processSideEffect } from '@/lib/server/services/flowEngineService';
import type { SideEffect } from '@ringback/shared-types';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const url = req.nextUrl;
  const statusParam = url.searchParams.get('status');
  const typeParam = url.searchParams.get('type');
  const tenantIdParam = url.searchParams.get('tenantId');

  const where: Record<string, unknown> = {};
  if (statusParam === 'open') where.resolvedAt = null;
  if (statusParam === 'resolved') where.resolvedAt = { not: null };
  if (typeParam) where.effectType = typeParam;
  if (tenantIdParam) where.tenantId = tenantIdParam;

  const rows = await prisma.sideEffectFailure.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      tenantId: true,
      effectType: true,
      conversationId: true,
      callerPhone: true,
      error: true,
      attempts: true,
      lastAttemptAt: true,
      resolvedAt: true,
      resolvedBy: true,
      createdAt: true,
    },
  });

  return apiSuccess(rows);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  let body: { id?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 400);
  }
  const { id, action } = body;
  if (typeof id !== 'string' || !id) return apiError('Missing id', 400);
  if (action !== 'resolve' && action !== 'retry') {
    return apiError('action must be "resolve" or "retry"', 400);
  }

  const row = await prisma.sideEffectFailure.findUnique({ where: { id } });
  if (!row) return apiError('Not found', 404);
  if (row.resolvedAt) return apiError('Already resolved', 409);

  if (action === 'resolve') {
    await prisma.sideEffectFailure.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedBy: `operator:${userId}` },
    });
    return apiSuccess({ ok: true, action: 'resolve' });
  }

  // action === 'retry': synchronously replay the effect.
  const effect = {
    type: row.effectType,
    payload: row.payload,
  } as unknown as SideEffect;

  try {
    await processSideEffect(
      effect,
      row.tenantId,
      row.conversationId ?? '',
      row.callerPhone ?? '',
      {},
    );
    await prisma.sideEffectFailure.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedBy: `operator:${userId}` },
    });
    return apiSuccess({ ok: true, action: 'retry', result: 'resolved' });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.sideEffectFailure.update({
      where: { id },
      data: {
        attempts: row.attempts + 1,
        lastAttemptAt: new Date(),
        error: errMsg.slice(0, 4000),
      },
    });
    logger.warn('Manual retry failed for SideEffectFailure', {
      id, effectType: row.effectType, tenantId: row.tenantId, err: errMsg,
    });
    return apiSuccess({ ok: false, action: 'retry', result: 'still_failing', error: errMsg });
  }
}
