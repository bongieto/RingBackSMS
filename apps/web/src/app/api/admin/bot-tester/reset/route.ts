import { NextRequest } from 'next/server';
import { requireBotTesterAdmin, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { deleteCallerState } from '@/lib/server/services/stateService';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_SENTINEL =
  process.env.BOT_TESTER_SENTINEL_PHONE ?? '+19990000001';

/**
 * POST /api/admin/bot-tester/reset
 * Body: { tenantId: string, callerPhone?: string }
 *
 * Wipes the sentinel tester session: deletes all Conversation rows for
 * the sentinel phone in this tenant, clears Redis CallerState, and
 * resets Contact.preferredLanguage so language detection starts fresh.
 */
export async function POST(request: NextRequest) {
  const auth = await requireBotTesterAdmin();
  if (isNextResponse(auth)) return auth;

  let body: { tenantId?: unknown; callerPhone?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON body', 400);
  }

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
  const callerPhone =
    typeof body.callerPhone === 'string' && body.callerPhone.trim().length > 0
      ? body.callerPhone.trim()
      : DEFAULT_SENTINEL;

  if (!tenantId) return apiError('tenantId is required', 400);

  try {
    await deleteCallerState(tenantId, callerPhone);

    // Order has an FK → Conversation (Order_conversationId_fkey). Orders
    // placed by the sentinel must be deleted BEFORE the Conversation row,
    // otherwise Prisma throws a foreign-key violation. These are tester
    // orders (sentinel phone only), so hard-delete is safe.
    const deletedOrders = await prisma.order.deleteMany({
      where: { tenantId, callerPhone },
    });

    const deleted = await prisma.conversation.deleteMany({
      where: { tenantId, callerPhone },
    });

    // Clear sticky state on the sentinel contact so repros start from a
    // clean slate:
    //  - preferredLanguage → language-detection regressions re-run fresh
    //  - name → a phantom cached name ("Pepsi") kept leaking into the
    //    paymentReceivedTracker greeting ("Hi Pepsi! Payment received…")
    //    because CallerMemory.contactName is sourced from Contact.name.
    await prisma.contact
      .updateMany({
        where: { tenantId, phone: callerPhone },
        data: { preferredLanguage: null, name: null },
      })
      .catch(() => {});

    logger.info('Bot tester session reset', {
      tenantId,
      callerPhone,
      deletedConversations: deleted.count,
      deletedOrders: deletedOrders.count,
    });

    return apiSuccess({
      reset: true,
      callerPhone,
      deletedConversations: deleted.count,
      deletedOrders: deletedOrders.count,
    });
  } catch (err: any) {
    logger.error('Bot tester reset failed', { tenantId, err: err?.message });
    return apiError(`Reset failed: ${err?.message ?? 'unknown'}`, 500);
  }
}
