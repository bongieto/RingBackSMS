/**
 * Turn lifecycle wrapper.
 *
 * Design notes:
 * - SINGLE write at the end, not create-then-update. The create-first
 *   pattern doubles DB round-trips on the hot path and gives us
 *   effectively nothing: an in-flight Turn has no decisions yet, so a
 *   crashed handler still lands a row via our `catch` branch. The only
 *   scenario we lose is a process-level crash (SIGKILL, OOM) — and those
 *   are loud enough in Sentry that a missing Turn row is not the
 *   signal that would diagnose them.
 *
 * - Single Prisma nested-write (`turn.create({ data: { ..., decisions: {
 *   create: [...] } } })`) so Turn + Decisions land atomically. No
 *   partial-Turn rows.
 *
 * - Gating via `TURN_RECORD_ENABLED`. When off, this is a near-passthrough:
 *   the handler runs, no ALS scope is opened (so `recordDecision` no-ops),
 *   no DB write occurs. Lets us ship the code and deploy dark.
 *
 * - Persist failures are swallowed. This is an observation layer — a
 *   crashed Turn.create() must NEVER bubble up and fail the user's SMS.
 *   We log the persist error at ERROR level and move on.
 *
 * - Sentry integration: `setTag('turnId', ...)` + `setContext('turn',
 *   {...})` inside the ALS scope so any thrown exception surfaces with
 *   the turn correlation.
 */
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/nextjs';
import type { TurnOutcome, TurnDirection } from '@ringback/shared-types';
import { turnStorage, type TurnContextData } from './TurnContext';
import { logger } from '@/lib/server/logger';
import { prisma } from '@/lib/server/db';
import { encryptNullable } from '@/lib/server/encryption';
import { Prisma } from '@prisma/client';

export interface TurnInput {
  tenantId: string;
  callerPhone: string;
  direction?: TurnDirection;
  inboundMessageSid?: string | null;
  inboundBody: string;
  inboundReceivedAt: Date;
  /**
   * Optional snapshot of Tenant.config at turn start. When the host has
   * already fetched the tenant, pass it here. Otherwise leave undefined
   * and call `setTurnSnapshots` from inside the handler once you have it.
   */
  tenantConfigSnapshot?: unknown;
  /** Caller-scoped snapshot (suppression, preferredLanguage, flowStep…). */
  contactStateSnapshot?: unknown;
}

export interface TurnResult {
  outcome: TurnOutcome;
  outcomeReason?: string;
  replyBody?: string;
  replyMessageSid?: string | null;
}

function recordEnabled(): boolean {
  return process.env.TURN_RECORD_ENABLED === '1';
}

export async function withTurn<T extends TurnResult>(
  input: TurnInput,
  handler: () => Promise<T>,
): Promise<T> {
  // Feature flag off → passthrough, no ALS, no DB write.
  if (!recordEnabled()) {
    return handler();
  }

  const turnId = randomUUID();
  const startedAt = Date.now();
  const ctx: TurnContextData = {
    turnId,
    tenantId: input.tenantId,
    callerPhone: input.callerPhone,
    startedAt,
    decisions: [],
    llmCalled: false,
    llmLatencyMs: 0,
    tenantConfigSnapshot: input.tenantConfigSnapshot,
    contactStateSnapshot: input.contactStateSnapshot,
  };

  // Tag ambient Sentry scope so thrown errors surface the turn. These
  // calls are cheap (Sentry stores them on the current hub) and safe if
  // Sentry is not initialized.
  try {
    Sentry.setTag('turnId', turnId);
    Sentry.setContext('turn', {
      turnId,
      tenantId: input.tenantId,
      callerPhone: input.callerPhone,
    });
  } catch {
    /* ignore — Sentry optional */
  }

  try {
    const result = await turnStorage.run(ctx, handler);
    await persistTurn(ctx, input, result).catch((err) => {
      logger.error('[turn] persistTurn failed', {
        turnId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
    logReceipt(ctx, input, result);
    return result;
  } catch (err) {
    const errorResult = {
      outcome: 'ERROR_HANDLER_THREW' as TurnOutcome,
      outcomeReason: err instanceof Error ? err.message : String(err),
    } as T;
    await persistTurn(ctx, input, errorResult).catch((e) => {
      logger.error('[turn] persistTurn failed (in catch)', {
        turnId,
        err: e instanceof Error ? e.message : String(e),
      });
    });
    logReceipt(ctx, input, errorResult);
    throw err;
  }
}

async function persistTurn(
  ctx: TurnContextData,
  input: TurnInput,
  result: TurnResult,
): Promise<void> {
  const durationMs = Date.now() - ctx.startedAt;

  // Encrypt at-rest; same scheme as Conversation.messages.
  const inboundBodyEncrypted = encryptNullable(input.inboundBody);
  const replyBodyEncrypted = encryptNullable(result.replyBody ?? null);

  await prisma.turn.create({
    data: {
      id: ctx.turnId,
      tenantId: input.tenantId,
      callerPhone: input.callerPhone,
      direction: input.direction ?? 'INBOUND',
      inboundMessageSid: input.inboundMessageSid ?? null,
      inboundBodyEncrypted,
      inboundReceivedAt: input.inboundReceivedAt,
      // Prefer lazily-populated snapshot from inside the handler (via
      // setTurnSnapshots) over whatever was passed at start. `{}` is the
      // safe default for an unknown tenant config — the column is NOT NULL.
      tenantConfigSnapshot: (ctx.tenantConfigSnapshot ??
        input.tenantConfigSnapshot ??
        {}) as Prisma.InputJsonValue,
      contactStateSnapshot:
        ctx.contactStateSnapshot == null && input.contactStateSnapshot == null
          ? Prisma.JsonNull
          : ((ctx.contactStateSnapshot ??
              input.contactStateSnapshot) as Prisma.InputJsonValue),
      outcome: result.outcome,
      outcomeReason: result.outcomeReason ?? null,
      replyBodyEncrypted,
      replyMessageSid: result.replyMessageSid ?? null,
      durationMs,
      llmCalled: ctx.llmCalled,
      llmLatencyMs: ctx.llmCalled ? ctx.llmLatencyMs : null,
      decisions: {
        create: ctx.decisions.map((d, i) => ({
          sequence: i,
          handler: d.handler,
          phase: d.phase,
          outcome: d.outcome,
          reason: d.reason ?? null,
          evidence:
            d.evidence == null
              ? Prisma.JsonNull
              : (d.evidence as Prisma.InputJsonValue),
          durationMs: d.durationMs,
        })),
      },
    },
  });
}

function logReceipt(
  ctx: TurnContextData,
  input: TurnInput,
  result: TurnResult,
): void {
  logger.info('turn_receipt', {
    turnId: ctx.turnId,
    tenantId: input.tenantId,
    callerPhone: input.callerPhone,
    outcome: result.outcome,
    outcomeReason: result.outcomeReason,
    inboundLen: input.inboundBody.length,
    replyLen: result.replyBody?.length ?? 0,
    durationMs: Date.now() - ctx.startedAt,
    llmCalled: ctx.llmCalled,
    llmLatencyMs: ctx.llmCalled ? ctx.llmLatencyMs : undefined,
    decisionCount: ctx.decisions.length,
    handlerPath: ctx.decisions.map((d) => `${d.handler}:${d.outcome}`).join('>'),
  });
}
