import { prisma } from '../db';
import { logger } from '../logger';
import { decryptMessages } from '../encryption';
import { chatCompletion } from './aiClient';

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
}

export interface ReviewRunResult {
  reportId: string | null;
  conversationCount: number;
  findingCount: number;
  skipped?: string;
}

/** Max conversations per run and per LLM batch. */
const MAX_CONVERSATIONS = 60;
const BATCH_SIZE = 12;
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

/** Tolerant JSON extraction — the model occasionally wraps JSON in prose. */
function parseFindings(raw: string): Array<Omit<ReviewFinding, 'tenantName'>> {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { findings?: unknown };
    if (!Array.isArray(parsed.findings)) return [];
    return parsed.findings
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
  } catch (err) {
    logger.warn('Conversation review: failed to parse LLM findings JSON', { err: (err as Error)?.message });
    return [];
  }
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
      messages: true,
      tenant: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: MAX_CONVERSATIONS,
  });

  if (conversations.length === 0) {
    logger.info('Conversation review: no conversations in window, skipping', { periodHours });
    return { reportId: null, conversationCount: 0, findingCount: 0, skipped: 'no conversations in window' };
  }

  const transcripts: TranscriptForReview[] = [];
  for (const convo of conversations) {
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
  const allFindings: ReviewFinding[] = [];

  for (let i = 0; i < transcripts.length; i += BATCH_SIZE) {
    const batch = transcripts.slice(i, i + BATCH_SIZE);
    const userMessage = batch
      .map((t) => `=== CONVERSATION ${t.conversationId} (business: ${t.tenantName}) ===\n${t.text}`)
      .join('\n\n');
    try {
      const raw = await chatCompletion({
        systemPrompt: REVIEW_SYSTEM_PROMPT,
        userMessage,
        maxTokens: 2000,
        temperature: 0.1,
        purpose: 'conversation_review',
        riskLevel: 'low',
      });
      const parsed = parseFindings(raw);
      for (const f of parsed) {
        allFindings.push({ ...f, tenantName: tenantNameById.get(f.conversationId) ?? 'Unknown' });
      }
    } catch (err) {
      // One failed batch shouldn't kill the run — record and continue.
      logger.error('Conversation review: LLM batch failed', {
        batchStart: i,
        err: (err as Error)?.message,
      });
    }
  }

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
  const summary =
    allFindings.length === 0
      ? `Reviewed ${transcripts.length} conversations — no issues found.`
      : `Reviewed ${transcripts.length} conversations, found ${allFindings.length} issue${allFindings.length === 1 ? '' : 's'} (${bySeverity.high ?? 0} high, ${bySeverity.medium ?? 0} medium, ${bySeverity.low ?? 0} low). Top categories: ${topCategories}.`;

  const report = await prisma.conversationReviewReport.create({
    data: {
      periodStart,
      periodEnd,
      conversationCount: transcripts.length,
      findingCount: allFindings.length,
      summary,
      findings: allFindings as unknown as object,
      stats: { bySeverity, byCategory },
    },
  });

  logger.info('Conversation review complete', {
    reportId: report.id,
    conversations: transcripts.length,
    findings: allFindings.length,
  });

  return { reportId: report.id, conversationCount: transcripts.length, findingCount: allFindings.length };
}
