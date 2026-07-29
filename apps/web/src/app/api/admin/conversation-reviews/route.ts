import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { TaskSource, TaskPriority } from '@prisma/client';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { runConversationReview, type ReviewFinding } from '@/lib/server/services/conversationReviewService';
import { createTask } from '@/lib/server/services/taskService';
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

/**
 * Approve or dismiss a single finding. Approving files the suggested fix
 * into the tenant's Action Items queue as a Task (any severity — the
 * auto-task path only covers high); dismissing just records the decision.
 * The status is stamped onto the finding inside the report's JSON so the
 * dashboard renders the decision durably.
 */
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const body = await req.json().catch(() => null);
  const reportId = String(body?.reportId ?? '');
  const findingIndex = Number(body?.findingIndex);
  const status = body?.status as 'approved' | 'dismissed';
  if (!reportId || !Number.isInteger(findingIndex) || !['approved', 'dismissed'].includes(status)) {
    return apiError('reportId, findingIndex, and status (approved|dismissed) are required', 400);
  }

  const report = await prisma.conversationReviewReport.findUnique({ where: { id: reportId } });
  if (!report) return apiError('Report not found', 404);
  const findings = (Array.isArray(report.findings) ? report.findings : []) as unknown as Array<
    ReviewFinding & { status?: string }
  >;
  const finding = findings[findingIndex];
  if (!finding) return apiError('Finding not found', 404);
  if (finding.status) return apiError(`Finding already ${finding.status}`, 409);

  if (status === 'approved') {
    const convo = await prisma.conversation.findUnique({
      where: { id: finding.conversationId },
      select: { tenantId: true },
    });
    if (!convo) return apiError('Conversation for finding no longer exists', 404);
    try {
      await createTask({
        tenantId: convo.tenantId,
        source: TaskSource.CONVERSATION,
        conversationId: finding.conversationId,
        priority: finding.severity === 'high' ? TaskPriority.HIGH : TaskPriority.NORMAL,
        title: `Bot issue: ${finding.category}`.slice(0, 120),
        description:
          `Approved from conversation review.\n\n` +
          `Issue: ${finding.issue}\n` +
          (finding.evidence ? `Evidence: "${finding.evidence}"\n` : '') +
          `Suggested fix: ${finding.suggestedFix}`,
      });
    } catch (err) {
      logger.error('[admin/conversation-reviews] approve → task failed', { err: (err as Error)?.message });
      return apiError('Failed to create task for approved finding', 500);
    }
  }

  findings[findingIndex] = { ...finding, status };
  await prisma.conversationReviewReport.update({
    where: { id: reportId },
    data: { findings: findings as unknown as object },
  });

  return apiSuccess({ reportId, findingIndex, status });
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
