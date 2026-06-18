/**
 * Handoff-exemplar capture + retrieval.
 *
 * Capture: every time an operator sends an outbound SMS via the
 * dashboard, we record a HandoffExemplar pairing the operator's reply
 * with the customer message they were responding to. Auto-approved on
 * capture (status=APPROVED) so the loop actually does something
 * without a separate review workflow — reviewers can SUPPRESS bad
 * ones later.
 *
 * Retrieval: when the fallback flow runs, we fetch the tenant's most
 * recent APPROVED exemplars and rank them by Jaccard token overlap
 * against the current inbound. Top-3 (with score floor) go into the
 * prompt as few-shot examples. The ranking lives in the flow engine
 * package (pure, easy to unit-test); this file is the DB shell.
 */
import { prisma } from '../db';
import { logger } from '../logger';
import {
  rankExemplars,
  type ExemplarCandidate,
  type RankedExemplar,
} from '@ringback/flow-engine';

/** How many recent exemplars to pull from the DB before ranking. The
 *  ranker filters again by score, so this just bounds the in-memory
 *  cost per tenant per turn. */
const CANDIDATE_POOL_LIMIT = 100;

/** How many exemplars to inject into the prompt per turn. More than 3
 *  starts eating prompt budget without clear benefit. */
const PROMPT_EXEMPLAR_LIMIT = 3;

export interface RecordHandoffExemplarArgs {
  tenantId: string;
  conversationId?: string | null;
  callerPhone: string;
  /** The customer's inbound that prompted the human reply. */
  inboundMessage: string;
  /** The human operator's outbound. */
  humanReply: string;
  /** The bot's most recent prior reply, for audit / future diffing. */
  botReplyBefore?: string | null;
}

/** Record a handoff exemplar. Fire-and-forget — never throws into the
 *  caller; just logs on failure. The dashboard reply route shouldn't
 *  fail because an exemplar couldn't be persisted. */
export async function recordHandoffExemplar(
  args: RecordHandoffExemplarArgs,
): Promise<void> {
  const inbound = args.inboundMessage.trim();
  const reply = args.humanReply.trim();
  if (inbound.length === 0 || reply.length === 0) {
    // No signal to learn from.
    return;
  }
  // Very short replies ("ok", "thanks") are usually team closures, not
  // teaching moments. Skip them. Threshold is conservative.
  if (reply.length < 20) {
    return;
  }
  try {
    await prisma.handoffExemplar.create({
      data: {
        tenantId: args.tenantId,
        conversationId: args.conversationId ?? null,
        callerPhone: args.callerPhone,
        inboundMessage: inbound,
        humanReply: reply,
        botReplyBefore: args.botReplyBefore?.trim() || null,
        // Auto-APPROVED by default; reviewer can SUPPRESS individually
        // via a future dashboard action.
      },
    });
  } catch (err: any) {
    logger.warn('[handoffExemplar] failed to record', {
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      error: err?.message,
    });
  }
}

/** Fetch + rank approved exemplars for this turn. Returns the top-k
 *  ranked exemplars or an empty array. Never throws — falls back to
 *  [] on DB error so the turn still runs. */
export async function findRelevantExemplars(
  tenantId: string,
  inboundMessage: string,
): Promise<RankedExemplar[]> {
  try {
    const rows = await prisma.handoffExemplar.findMany({
      where: { tenantId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_POOL_LIMIT,
      select: { id: true, inboundMessage: true, humanReply: true },
    });
    const candidates: ExemplarCandidate[] = rows;
    return rankExemplars(inboundMessage, candidates, {
      limit: PROMPT_EXEMPLAR_LIMIT,
    });
  } catch (err: any) {
    logger.warn('[handoffExemplar] retrieval failed', {
      tenantId,
      error: err?.message,
    });
    return [];
  }
}

export interface MessageRecord {
  role?: string;
  content?: string;
  timestamp?: string;
  sender?: string;
}

/** From the persisted conversation messages, find the customer inbound
 *  this human reply was answering, and the bot's reply (if any) just
 *  before it. Returns null when there's no preceding customer message.
 *
 *  Heuristic: walk backwards from the end of `messages` looking for the
 *  most recent message authored by the customer. The "bot reply before"
 *  is the most recent assistant message authored by the bot that came
 *  AFTER that inbound (i.e. the bot's deflection in response to it). */
export function findExemplarPairFromMessages(
  messages: MessageRecord[],
): { inboundMessage: string; botReplyBefore: string | null } | null {
  // Walk newest → oldest to find the last customer inbound.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && m.content && m.content.trim().length > 0) {
      // Look at messages between this inbound and the end for the
      // bot's reply (sender='bot' or no sender — older messages may
      // lack the field).
      let botReply: string | null = null;
      for (let j = i + 1; j < messages.length; j++) {
        const later = messages[j];
        if (later.role === 'assistant' && (later.sender === 'bot' || !later.sender)) {
          botReply = later.content?.trim() ?? null;
          // Take the latest bot reply between inbound and end.
        }
      }
      return { inboundMessage: m.content.trim(), botReplyBefore: botReply };
    }
  }
  return null;
}
