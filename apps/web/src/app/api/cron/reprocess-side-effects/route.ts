/**
 * Periodic reprocessor for SideEffectFailure DLQ rows.
 *
 * We write a DLQ row when the in-request retry loop in processInboundSms
 * gives up on a side effect (SAVE_ORDER, CREATE_PAYMENT_LINK,
 * NOTIFY_OWNER, etc. — see sideEffectRetry.ts). This cron picks up
 * rows where resolvedAt IS NULL and below a max-attempts cap, replays
 * them against processSideEffect, and either marks them resolved or
 * bumps their attempt counter.
 *
 * Rows past MAX_ATTEMPTS are left unresolved so they show up in the
 * operator dashboard — replaying forever is how you eat a whole tenant's
 * Stripe rate limit at 3 AM.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { processSideEffect } from '@/lib/server/services/flowEngineService';
import type { SideEffect } from '@ringback/shared-types';

export const maxDuration = 60;

const MAX_ATTEMPTS = 8;         // stop trying after this many failures
const BATCH_SIZE = 25;          // don't try to drain the whole queue in one tick
const MIN_BACKOFF_MINUTES = 1;  // don't re-try more than once a minute per row

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - MIN_BACKOFF_MINUTES * 60 * 1000);

  let rows: Array<{
    id: string;
    tenantId: string;
    effectType: string;
    payload: unknown;
    conversationId: string | null;
    callerPhone: string | null;
    attempts: number;
  }> = [];

  try {
    rows = await prisma.sideEffectFailure.findMany({
      where: {
        resolvedAt: null,
        attempts: { lt: MAX_ATTEMPTS },
        lastAttemptAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        tenantId: true,
        effectType: true,
        payload: true,
        conversationId: true,
        callerPhone: true,
        attempts: true,
      },
    });
  } catch (err) {
    logger.error('reprocess-side-effects: fetch failed', { err });
    return Response.json({ error: 'Failed to fetch' }, { status: 500 });
  }

  let resolved = 0;
  let stillFailing = 0;
  let givenUp = 0;

  for (const row of rows) {
    // Reconstruct a SideEffect from the DLQ row. We kept payload as JSON
    // so the shape is whatever flow-engine emitted at the time. Trust
    // the DB schema: if it's wrong, processSideEffect will throw and
    // we'll record the new error below.
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
        where: { id: row.id },
        data: {
          resolvedAt: new Date(),
          resolvedBy: 'reprocessor',
        },
      });
      resolved += 1;
    } catch (err) {
      const nextAttempts = row.attempts + 1;
      const errMsg = err instanceof Error ? err.message : String(err);
      await prisma.sideEffectFailure
        .update({
          where: { id: row.id },
          data: {
            attempts: nextAttempts,
            lastAttemptAt: new Date(),
            error: errMsg.slice(0, 4000),
          },
        })
        .catch(() => { /* best effort */ });

      if (nextAttempts >= MAX_ATTEMPTS) {
        givenUp += 1;
        logger.warn('reprocess-side-effects: giving up on row', {
          id: row.id,
          effectType: row.effectType,
          tenantId: row.tenantId,
          attempts: nextAttempts,
        });
      } else {
        stillFailing += 1;
      }
    }
  }

  logger.info('reprocess-side-effects: batch done', {
    inspected: rows.length,
    resolved,
    stillFailing,
    givenUp,
  });

  return Response.json({
    ok: true,
    inspected: rows.length,
    resolved,
    stillFailing,
    givenUp,
  });
}
