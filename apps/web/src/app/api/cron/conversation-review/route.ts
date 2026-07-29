import { NextRequest } from 'next/server';
import { runConversationReview } from '@/lib/server/services/conversationReviewService';
import { logger } from '@/lib/server/logger';

/**
 * Daily conversation-quality review (see vercel.json `crons` — runs at
 * 09:00 UTC, i.e. 3–4am Central, covering the previous business day).
 * Findings land in ConversationReviewReport and are browsable at
 * /admin/conversation-reviews.
 *
 * Auth: CRON_SECRET header. Vercel sends `Authorization: Bearer
 * <secret>` on cron invocations.
 */

// Reviews up to 60 transcripts through the LLM in batches — needs more
// than the default 10s. Vercel Pro allows up to 300s.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runConversationReview(24);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error('[cron/conversation-review] run failed', { err: (err as Error)?.message });
    return Response.json({ error: 'Review run failed' }, { status: 500 });
  }
}
