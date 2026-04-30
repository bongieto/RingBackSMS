import { NextRequest } from 'next/server';
import { requireBotTesterAdmin, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { decryptNullable } from '@/lib/server/encryption';
import { deleteCallerState } from '@/lib/server/services/stateService';
import { processInboundSms } from '@/lib/server/services/flowEngineService';
import { logger } from '@/lib/server/logger';
import { getBotBehaviorStamp, type BotBehaviorStamp } from '@/lib/server/botBehaviorVersion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_DAYS = 14;
const REPLAY_SENTINEL =
  process.env.REPLAY_EVALUATOR_SENTINEL_PHONE ?? '+19990000998';

type ReplayRequest = {
  tenantId?: unknown;
  limit?: unknown;
  days?: unknown;
  callerPhone?: unknown;
  includeExamples?: unknown;
};

type ReplayCase = {
  turnId: string;
  callerPhone: string;
  inbound: string;
  originalReply: string;
  replayReply: string;
  originalOutcome: string;
  replayFlowType: string;
  replayFlowStep: string | null;
  labels: string[];
  score: number;
  notes: string[];
  originalBehavior: BotBehaviorStamp | null;
  replayBehavior: BotBehaviorStamp;
};

const UNSUPPORTED_CLAIM_RE =
  /\b(order|it)\s+(?:is\s+)?(?:cancelled|canceled)\b|\brefund(?:ed| processed| issued| sent)?\b|\border\b.*\b(?:ready|preparing|confirmed|out for delivery|on the way)\b/i;

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

function getOriginalIntent(decisions: Array<{ handler: string; outcome: string }>): string | null {
  const d = decisions.find((decision) => decision.handler === 'detectIntent');
  if (!d) return null;
  if (d.outcome.startsWith('intent_')) return d.outcome.slice('intent_'.length).toUpperCase();
  return d.outcome.toUpperCase();
}

function detectLabels(reply: string): string[] {
  const labels: string[] = [];
  const lower = reply.toLowerCase();
  if (reply.trim().length === 0) labels.push('empty_reply');
  if (UNSUPPORTED_CLAIM_RE.test(reply)) labels.push('possible_unsupported_claim');
  if (lower.includes("don't offer delivery") || lower.includes('do not offer delivery')) {
    labels.push('delivery_blocked');
  }
  if (lower.includes('refund') && (lower.includes("can't process") || lower.includes('call'))) {
    labels.push('refund_deflected');
  }
  if (lower.includes('allerg') && lower.includes('call')) labels.push('allergy_deflected');
  if (lower.includes('not sure') || lower.includes('clarify')) labels.push('clarification_or_deflection');
  return labels;
}

function scoreCase(args: {
  inbound: string;
  originalReply: string;
  replayReply: string;
  originalIntent: string | null;
  replayFlowType: string;
}): { score: number; labels: string[]; notes: string[] } {
  const labels = detectLabels(args.replayReply);
  const notes: string[] = [];
  let score = 0;

  if (args.originalReply.trim().length === 0 && args.replayReply.trim().length > 0) {
    score += 2;
    labels.push('empty_reply_fixed');
  }
  if (args.replayReply.trim().length === 0 && args.originalReply.trim().length > 0) {
    score -= 3;
    notes.push('Replay produced an empty reply where the original replied.');
  }
  if (UNSUPPORTED_CLAIM_RE.test(args.originalReply) && !UNSUPPORTED_CLAIM_RE.test(args.replayReply)) {
    score += 3;
    labels.push('unsupported_claim_removed');
  }
  if (!UNSUPPORTED_CLAIM_RE.test(args.originalReply) && UNSUPPORTED_CLAIM_RE.test(args.replayReply)) {
    score -= 4;
    notes.push('Replay may have introduced an unsupported order/refund/status claim.');
  }
  if (args.originalIntent && args.originalIntent !== args.replayFlowType) {
    labels.push('route_changed');
    notes.push(`Original route looked like ${args.originalIntent}; replay returned ${args.replayFlowType}.`);
  }
  if (/\b(refund|cancel|delivery|allerg|cater|substitut|swap)\b/i.test(args.inbound)) {
    labels.push('sensitive_or_policy_message');
  }
  if (labels.includes('delivery_blocked') || labels.includes('refund_deflected') || labels.includes('allergy_deflected')) {
    score += 1;
  }

  return { score, labels: Array.from(new Set(labels)), notes };
}

function getSnapshotBehavior(snapshot: unknown): BotBehaviorStamp | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const candidate = (snapshot as { _botBehavior?: unknown })._botBehavior;
  if (!candidate || typeof candidate !== 'object') return null;
  const stamp = candidate as Partial<BotBehaviorStamp>;
  if (
    typeof stamp.behaviorVersion !== 'string' ||
    typeof stamp.promptVersion !== 'string' ||
    typeof stamp.ruleVersion !== 'string'
  ) {
    return null;
  }
  return {
    behaviorVersion: stamp.behaviorVersion,
    promptVersion: stamp.promptVersion,
    ruleVersion: stamp.ruleVersion,
    tenantConfigHash:
      typeof stamp.tenantConfigHash === 'string' ? stamp.tenantConfigHash : null,
  };
}

async function resetReplaySession(tenantId: string, callerPhone: string): Promise<void> {
  await deleteCallerState(tenantId, callerPhone);
  await prisma.order.deleteMany({ where: { tenantId, callerPhone } });
  await prisma.meeting.deleteMany({ where: { tenantId, callerPhone } });
  await prisma.conversation.deleteMany({ where: { tenantId, callerPhone } });
  await prisma.smsSuppression.deleteMany({ where: { tenantId, callerPhone } }).catch(() => undefined);
  await prisma.contact
    .updateMany({
      where: { tenantId, phone: callerPhone },
      data: { preferredLanguage: null, name: null },
    })
    .catch(() => undefined);
  await prisma.turn.deleteMany({ where: { tenantId, callerPhone } }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const auth = await requireBotTesterAdmin();
  if (isNextResponse(auth)) return auth;

  let body: ReplayRequest;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON body', 400);
  }

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
  if (!tenantId) return apiError('tenantId is required', 400);

  const limit = asPositiveInt(body.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const days = asPositiveInt(body.days, DEFAULT_DAYS, 365);
  const includeExamples = body.includeExamples !== false;
  const replayCallerPhone =
    typeof body.callerPhone === 'string' && body.callerPhone.trim().length > 0
      ? body.callerPhone.trim()
      : REPLAY_SENTINEL;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, config: true },
  });
  if (!tenant) return apiError('Tenant not found', 404);
  const currentBehavior = getBotBehaviorStamp({ tenantConfig: tenant.config });

  const turns = await prisma.turn.findMany({
    where: {
      tenantId,
      direction: 'INBOUND',
      createdAt: { gte: since },
      inboundBodyEncrypted: { not: null },
      callerPhone: { not: replayCallerPhone },
      outcome: { notIn: ['SUPPRESSED_DUPLICATE', 'SUPPRESSED_COMPLIANCE'] },
    },
    include: { decisions: { orderBy: { sequence: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const cases: ReplayCase[] = [];
  const skipped: Array<{ turnId: string; reason: string }> = [];

  for (const turn of turns) {
    const inbound = decryptNullable(turn.inboundBodyEncrypted);
    if (!inbound?.trim()) {
      skipped.push({ turnId: turn.id, reason: 'missing_or_undecryptable_inbound' });
      continue;
    }

    const originalReply = decryptNullable(turn.replyBodyEncrypted) ?? '';
    const originalIntent = getOriginalIntent(turn.decisions);
    const originalBehavior = getSnapshotBehavior(turn.tenantConfigSnapshot);

    try {
      await resetReplaySession(tenantId, replayCallerPhone);
      const result = await processInboundSms(
        {
          tenantId,
          callerPhone: replayCallerPhone,
          inboundMessage: inbound,
          messageSid: `replay-${turn.id}-${Date.now()}`,
        },
        { testMode: true },
      );

      if (!result) {
        skipped.push({ turnId: turn.id, reason: 'processInboundSms_returned_void' });
        continue;
      }

      const scored = scoreCase({
        inbound,
        originalReply,
        replayReply: result.reply,
        originalIntent,
        replayFlowType: result.flowType,
      });

      cases.push({
        turnId: turn.id,
        callerPhone: turn.callerPhone,
        inbound,
        originalReply,
        replayReply: result.reply,
        originalOutcome: turn.outcome,
        replayFlowType: result.flowType,
        replayFlowStep: result.nextState?.flowStep ?? null,
        labels: scored.labels,
        score: scored.score,
        notes: scored.notes,
        originalBehavior,
        replayBehavior: currentBehavior,
      });
    } catch (err) {
      logger.warn('Replay evaluator case failed', {
        tenantId,
        turnId: turn.id,
        err: err instanceof Error ? err.message : String(err),
      });
      skipped.push({ turnId: turn.id, reason: err instanceof Error ? err.message : String(err) });
    } finally {
      await resetReplaySession(tenantId, replayCallerPhone).catch(() => undefined);
    }
  }

  const improved = cases.filter((c) => c.score > 0).length;
  const regressed = cases.filter((c) => c.score < 0).length;
  const neutral = cases.length - improved - regressed;
  const labelCounts = cases.reduce<Record<string, number>>((acc, c) => {
    for (const label of c.labels) acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const risky = cases
    .filter((c) => c.score < 0 || c.labels.includes('possible_unsupported_claim'))
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);

  return apiSuccess({
    tenant: { id: tenant.id, name: tenant.name },
    window: { days, since: since.toISOString(), requestedLimit: limit },
    replayCallerPhone,
    behavior: { current: currentBehavior },
    summary: {
      fetched: turns.length,
      replayed: cases.length,
      skipped: skipped.length,
      improved,
      regressed,
      neutral,
      totalScore: cases.reduce((sum, c) => sum + c.score, 0),
      labelCounts,
    },
    riskyExamples: includeExamples ? risky : undefined,
    examples: includeExamples
      ? cases
          .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
          .slice(0, 15)
      : undefined,
    skipped,
  });
}
