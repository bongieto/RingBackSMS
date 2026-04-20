import { NextRequest, NextResponse } from 'next/server';
import { requireBotTesterAdmin, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { processInboundSms } from '@/lib/server/services/flowEngineService';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_SENTINEL =
  process.env.BOT_TESTER_SENTINEL_PHONE ?? '+19990000001';

/**
 * POST /api/admin/bot-tester/chat
 * Body: { tenantId: string, callerPhone?: string, message: string }
 *
 * Runs processInboundSms in testMode against the target tenant and
 * returns the bot reply plus the side effects that WOULD have fired.
 * Nothing is sent over Twilio; no Stripe session is created; no POS
 * order is pushed. The caller state + Conversation row ARE persisted
 * under the sentinel phone so multi-turn sessions behave like prod.
 *
 * Access: super-admin only, gated by BOT_TESTER_ADMIN_IDS env.
 */
export async function POST(request: NextRequest) {
  const auth = await requireBotTesterAdmin();
  if (isNextResponse(auth)) return auth;

  let body: { tenantId?: unknown; callerPhone?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON body', 400);
  }

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
  const message = typeof body.message === 'string' ? body.message : '';
  const callerPhone =
    typeof body.callerPhone === 'string' && body.callerPhone.trim().length > 0
      ? body.callerPhone.trim()
      : DEFAULT_SENTINEL;

  if (!tenantId) return apiError('tenantId is required', 400);
  if (!message.trim()) return apiError('message is required', 400);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) return apiError('Tenant not found', 404);

  try {
    const result = await processInboundSms(
      {
        tenantId,
        callerPhone,
        inboundMessage: message,
        // Random-ish sid so the dedup check never trips in a tester
        // session. `test-` prefix makes it obvious in logs.
        messageSid: `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
      { testMode: true },
    );

    if (!result) {
      // Shouldn't happen in testMode, but narrow the type.
      return apiError('Flow engine returned no result', 500);
    }

    return apiSuccess({
      reply: result.reply,
      sideEffects: result.sideEffects,
      flowType: result.flowType,
      flowStep: result.nextState?.flowStep ?? null,
      callerPhone,
    });
  } catch (err: any) {
    logger.error('Bot tester chat failed', {
      tenantId,
      callerPhone,
      err: err?.message,
    });
    return apiError(`Flow engine crashed: ${err?.message ?? 'unknown'}`, 500);
  }
}
