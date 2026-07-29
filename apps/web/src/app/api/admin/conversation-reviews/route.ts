import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { runConversationReview } from '@/lib/server/services/conversationReviewService';
import { logger } from '@/lib/server/logger';

// "Run now" reviews up to 60 transcripts through the LLM — same budget
// as the cron route.
export const maxDuration = 300;

/** List recent conversation-review reports (newest first). */
export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const reports = await prisma.conversationReviewReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return apiSuccess({ reports });
}

/** Run a review on demand (same logic as the daily cron). */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const body = await req.json().catch(() => ({}));
  const periodHours = Math.min(Math.max(Number(body?.periodHours) || 24, 1), 24 * 14);

  try {
    const result = await runConversationReview(periodHours);
    return apiSuccess(result);
  } catch (err) {
    logger.error('[admin/conversation-reviews] manual run failed', { err: (err as Error)?.message });
    return apiError('Review run failed', 500);
  }
}
