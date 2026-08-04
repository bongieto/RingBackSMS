import { TaskSource, TaskPriority } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../logger';
import { decryptMessages } from '../encryption';
import { chatCompletion } from './aiClient';
import { createTask } from './taskService';
import {
  collectResolvedReviewFindingKeys,
  hasUnreviewedConversationMessages,
  suppressResolvedReviewFindings,
} from '../../conversationReviewState';

/**
 * Daily conversation QA reviewer.
 *
 * Pulls the review window's conversations, decrypts the transcripts,
 * and asks the LLM to grade the BOT's side of each exchange: loops,
 * dead ends, wrong-language replies, ignored questions, silent item
 * drops, robotic tone, missed handoffs. Findings are stored as a
 * ConversationReviewReport row for the /admin/conversation-reviews
 * dashboard.
 *
 * Born from a manual review session (2026-07-28) that found eight
 * classes of production failures by reading transcripts — this makes
 * that review a standing daily process instead of a one-off.
 */

export interface ReviewFinding {
  conversationId: string;
  tenantName: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  issue: string;
  /** Short verbatim quote from the transcript demonstrating the issue */
  evidence: string;
  suggestedFix: string;
  status?: 'approved' | 'dismissed';
}

export interface ReviewRunResult {
  reportId: string | null;
  conversationCount: number;
  findingCount: number;
  skipped?: string;
}

/** Max conversations per run and per LLM batch. Batch size is tuned so
 * the findings JSON stays well inside REVIEW_MAX_TOKENS — the first
 * production run used 12 convos + 2000 tokens and Claude's response
 * was truncated mid-array, silently parsing to zero findings. */
const MAX_CONVERSATIONS = 60;
// Administrative changes can move already-reviewed rows to the front of an
// updatedAt query. Fetch a wider pool before applying the message-count cursor
// so those rows cannot crowd genuinely new conversations out of the run.
const MAX_CANDIDATE_CONVERSATIONS = MAX_CONVERSATIONS * 5;
const BATCH_SIZE = 6;
const REVIEW_MAX_TOKENS = 8000;
/** Per-conversation transcript caps to keep prompts bounded. */
const MAX_MESSAGES_PER_CONVO = 30;
const MAX_CHARS_PER_MESSAGE = 300;

const REVIEW_SYSTEM_PROMPT = `You are a QA reviewer for an SMS ordering/answering bot used by small businesses. You review transcripts between customers and the bot and identify ways the BOT's responses failed or could improve.

Look specifically for these failure classes (all previously seen in production):
- REPEATED/DUPLICATE messages: the bot sending the same message multiple times in a row
- LOOPS: the customer repeats themselves because the bot's reply didn't move things forward, or the bot rejects a reasonable reply (e.g. "Yes") with the same canned message
- WRONG LANGUAGE: replying in (or about) a language the customer isn't using
- IGNORED CONTENT: items, questions, or details the customer stated that the bot silently dropped
- DEAD ENDS: telling the customer to "contact staff" when they ARE contacting the business, or ending without a next step
- MISSED HANDOFF: customer asks for a human / has an allergy or complex request and gets no escalation
- ROBOTIC/TONE-DEAF replies: e.g. answering gratitude with a consent prompt, or degenerate replies (a bare phone number)
- FACTUAL RISK: prices, hours, or policies asserted without evident grounding; contradictions within the conversation
- LOST REVENUE: any moment where a customer who was trying to pay or order gave up

Rules:
- Judge only the BOT's behavior; never blame the customer.
- Only report REAL issues visible in the transcript. If a conversation is fine, report nothing for it.
- Evidence quotes must be verbatim substrings of the transcript, under 140 chars.
- suggestedFix should be concrete and actionable (config change, knowledge-base entry, flow behavior, copy change).

Return STRICT JSON only, no prose, exactly this shape:
{"findings":[{"conversationId":"...","severity":"high|medium|low","category":"...","issue":"...","evidence":"...","suggestedFix":"..."}]}`;

interface TranscriptForReview {
  conversationId: string;
  tenantName: string;
  text: string;
}

function renderTranscript(convoId: string, tenantName: string, messages: unknown[]): TranscriptForReview {
  const recent = messages.slice(-MAX_MESSAGES_PER_CONVO);
  const lines = recent.map((m) => {
    const msg = m as { role?: string; sender?: string; content?: string };
    const who = msg.role === 'user' || msg.sender === 'customer' ? 'CUSTOMER' : 'BOT';
    const body = (msg.content ?? '').slice(0, MAX_CHARS_PER_MESSAGE).replace(/\s+/g, ' ');
    return `${who}: ${body}`;
  });
  return {
    conversationId: convoId,
    tenantName,
    text: lines.join('\n'),
  };
}

/**
 * Tolerant JSON extraction — the model occasionally wraps JSON in prose
 * or (when max_tokens truncates) cuts off mid-array. Returns null on a
 * HARD failure (nothing salvageable) so the caller can count it as a
 * failed batch instead of silently recording zero findings.
 */
function parseFindings(raw: string): Array<Omit<ReviewFinding, 'tenantName'>> | null {
  const normalize = (items: unknown[]): Array<Omit<ReviewFinding, 'tenantName'>> =>
    items
      .filter((f): f is Record<string, string> => !!f && typeof f === 'object')
      .map((f) => ({
        conversationId: String(f.conversationId ?? ''),
        severity: (['high', 'medium', 'low'].includes(String(f.severity)) ? f.severity : 'low') as ReviewFinding['severity'],
        category: String(f.category ?? 'other').slice(0, 60),
        issue: String(f.issue ?? '').slice(0, 500),
        evidence: String(f.evidence ?? '').slice(0, 200),
        suggestedFix: String(f.suggestedFix ?? '').slice(0, 500),
      }))
      .filter((f) => f.conversationId && f.issue);

  const start = raw.indexOf('{');
  if (start === -1) return null;

  try {
    const end = raw.lastIndexOf('}');
    if (end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { findings?: unknown };
      if (Array.isArray(parsed.findings)) return normalize(parsed.findings);
    }
  } catch {
    // fall through to truncation salvage
  }

  // Truncation salvage: response was cut mid-array. Trim back to the
  // last complete finding object and close the array + envelope.
  const lastComplete = raw.lastIndexOf('},');
  if (lastComplete > start) {
    try {
      const repaired = raw.slice(start, lastComplete + 1) + ']}';
      const parsed = JSON.parse(repaired) as { findings?: unknown };
      if (Array.isArray(parsed.findings)) {
        logger.warn('Conversation review: salvaged truncated findings JSON', {
          salvaged: parsed.findings.length,
        });
        return normalize(parsed.findings);
      }
    } catch {
      // unsalvageable
    }
  }

  logger.warn('Conversation review: failed to parse LLM findings JSON', {
    tail: raw.slice(-120),
  });
  return null;
}

export async function runConversationReview(periodHours = 24): Promise<ReviewRunResult> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodHours * 60 * 60 * 1000);

  const conversations = await prisma.conversation.findMany({
    where: {
      updatedAt: { gte: periodStart, lte: periodEnd },
      // 1-message rows are consent greetings / noise with nothing to review
      messageCount: { gte: 2 },
    },
    select: {
      id: true,
      tenantId: true,
      messages: true,
      messageCount: true,
      reviewedMessageCount: true,
      tenant: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: MAX_CANDIDATE_CONVERSATIONS,
  });

  // Only transcript growth makes a conversation reviewable. updatedAt also
  // changes when a task is completed or a handoff is cleared, so comparing it
  // to reviewedAt re-flagged already-fixed conversations on the next run.
  const unreviewed = conversations.filter(
    (c) => hasUnreviewedConversationMessages(c.messageCount, c.reviewedMessageCount),
  ).slice(0, MAX_CONVERSATIONS);

  if (unreviewed.length === 0) {
    logger.info('Conversation review: no new conversation activity since last review, skipping', {
      periodHours,
      inWindow: conversations.length,
    });
    return {
      reportId: null,
      conversationCount: 0,
      findingCount: 0,
      skipped: 'no new conversation activity since last review',
    };
  }

  const transcripts: TranscriptForReview[] = [];
  for (const convo of unreviewed) {
    try {
      const messages = decryptMessages(convo.messages);
      if (Array.isArray(messages) && messages.length >= 2) {
        transcripts.push(renderTranscript(convo.id, convo.tenant?.name ?? 'Unknown', messages));
      }
    } catch (err) {
      logger.warn('Conversation review: failed to decrypt transcript, skipping convo', {
        conversationId: convo.id,
        err: (err as Error)?.message,
      });
    }
  }

  const tenantNameById = new Map(transcripts.map((t) => [t.conversationId, t.tenantName]));
  const tenantIdByConvo = new Map(unreviewed.map((c) => [c.id, c.tenantId]));
  const allFindings: ReviewFinding[] = [];
  let batchCount = 0;
  let batchFailures = 0;
  // Conversations covered by a SUCCESSFUL batch get their reviewedAt
  // stamped; failed-batch conversations stay eligible for the next run.
  const reviewedConvoIds: string[] = [];

  for (let i = 0; i < transcripts.length; i += BATCH_SIZE) {
    const batch = transcripts.slice(i, i + BATCH_SIZE);
    batchCount += 1;
    const userMessage = batch
      .map((t) => `=== CONVERSATION ${t.conversationId} (business: ${t.tenantName}) ===\n${t.text}`)
      .join('\n\n');
    try {
      const raw = await chatCompletion({
        systemPrompt: REVIEW_SYSTEM_PROMPT,
        userMessage,
        maxTokens: REVIEW_MAX_TOKENS,
        temperature: 0.1,
        purpose: 'conversation_review',
        riskLevel: 'low',
        // Offline batch job — a multi-transcript review takes far longer
        // than the customer-facing 8s default. First production run
        // aborted at 8s and stored a false "no issues" report.
        timeoutMs: 120_000,
      });
      const parsed = parseFindings(raw);
      if (parsed === null) {
        // Unparseable response = this batch reviewed nothing. Count it
        // as failed so an all-failures run throws instead of storing a
        // clean-looking report.
        batchFailures += 1;
        continue;
      }
      for (const f of parsed) {
        allFindings.push({ ...f, tenantName: tenantNameById.get(f.conversationId) ?? 'Unknown' });
      }
      reviewedConvoIds.push(...batch.map((t) => t.conversationId));
    } catch (err) {
      // One failed batch shouldn't kill the run — record and continue.
      batchFailures += 1;
      logger.error('Conversation review: LLM batch failed', {
        batchStart: i,
        err: (err as Error)?.message,
      });
    }
  }

  // If EVERY batch failed, we reviewed nothing — storing a report here
  // would masquerade as "N conversations reviewed, no issues found",
  // which is exactly what the first production run did during an
  // Anthropic 529 surge. Fail loudly instead; the operator can re-run.
  if (batchCount > 0 && batchFailures === batchCount) {
    throw new Error(`Conversation review failed: all ${batchCount} LLM batches errored`);
  }

  // Decisions belong to the specific transcript evidence, not just the report
  // that first contained them. Suppress model restatements of the same evidence
  // while allowing a genuinely new recurrence in the same category through.
  const decidedReports = await prisma.conversationReviewReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { findings: true },
  });
  const resolvedFindingKeys = collectResolvedReviewFindingKeys(decidedReports);
  const unsuppressedFindings = suppressResolvedReviewFindings(allFindings, resolvedFindingKeys);
  const suppressedResolvedFindings = allFindings.length - unsuppressedFindings.length;
  allFindings.splice(0, allFindings.length, ...unsuppressedFindings);

  // Aggregate stats
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const f of allFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, n]) => `${cat} (${n})`)
    .join(', ');
  const partialNote =
    batchFailures > 0 ? ` (${batchFailures}/${batchCount} review batches failed — partial coverage)` : '';
  const resolvedNote =
    suppressedResolvedFindings > 0
      ? ` ${suppressedResolvedFindings} previously resolved finding${suppressedResolvedFindings === 1 ? '' : 's'} omitted.`
      : '';
  const summary =
    allFindings.length === 0
      ? `Reviewed ${transcripts.length} conversations — no new issues found.${resolvedNote}${partialNote}`
      : `Reviewed ${transcripts.length} conversations, found ${allFindings.length} issue${allFindings.length === 1 ? '' : 's'} (${bySeverity.high ?? 0} high, ${bySeverity.medium ?? 0} medium, ${bySeverity.low ?? 0} low). Top categories: ${topCategories}.${resolvedNote}${partialNote}`;

  const report = await prisma.conversationReviewReport.create({
    data: {
      periodStart,
      periodEnd,
      conversationCount: transcripts.length,
      findingCount: allFindings.length,
      summary,
      findings: allFindings as unknown as object,
      stats: { bySeverity, byCategory, batchCount, batchFailures, suppressedResolvedFindings },
    },
  });

  // Stamp the exact transcript size covered by each successful batch. Grouped
  // updateMany calls avoid failing the run if a conversation is deleted, and
  // the messageCount condition prevents a message arriving mid-review from
  // being incorrectly marked as covered.
  if (reviewedConvoIds.length > 0) {
    const idsByMessageCount = new Map<number, string[]>();
    const reviewedIdSet = new Set(reviewedConvoIds);
    for (const conversation of unreviewed) {
      if (!reviewedIdSet.has(conversation.id)) continue;
      const ids = idsByMessageCount.get(conversation.messageCount) ?? [];
      ids.push(conversation.id);
      idsByMessageCount.set(conversation.messageCount, ids);
    }

    await prisma.$transaction(
      Array.from(idsByMessageCount.entries()).map(([messageCount, ids]) =>
        prisma.conversation.updateMany({
          where: { id: { in: ids }, messageCount },
          data: { reviewedAt: periodEnd, reviewedMessageCount: messageCount },
        }),
      ),
    );
  }

  // Close the loop: high-severity findings become Tasks in the tenant's
  // Action Items queue, so the operator sees them without checking the
  // review dashboard. createTask dedupes on (tenantId, CONVERSATION,
  // conversationId, OPEN/SNOOZED) — a conversation reviewed on
  // consecutive days won't spawn duplicate open tasks. Best-effort: a
  // task failure never fails the review run.
  let tasksCreated = 0;
  for (const f of allFindings) {
    if (f.severity !== 'high') continue;
    const tenantId = tenantIdByConvo.get(f.conversationId);
    if (!tenantId) continue;
    try {
      await createTask({
        tenantId,
        source: TaskSource.CONVERSATION,
        conversationId: f.conversationId,
        priority: TaskPriority.HIGH,
        title: `Bot issue: ${f.category}`.slice(0, 120),
        description:
          `Daily conversation review flagged this exchange.\n\n` +
          `Issue: ${f.issue}\n` +
          (f.evidence ? `Evidence: "${f.evidence}"\n` : '') +
          `Suggested fix: ${f.suggestedFix}`,
      });
      tasksCreated += 1;
    } catch (err) {
      logger.warn('Conversation review: failed to create task for finding', {
        conversationId: f.conversationId,
        err: (err as Error)?.message,
      });
    }
  }

  logger.info('Conversation review complete', {
    reportId: report.id,
    conversations: transcripts.length,
    findings: allFindings.length,
    tasksCreated,
    suppressedResolvedFindings,
  });

  return { reportId: report.id, conversationCount: transcripts.length, findingCount: allFindings.length };
}
