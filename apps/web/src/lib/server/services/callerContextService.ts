import { prisma } from '../db';
import { decryptMessages } from '../encryption';
import type { Contact, MissedCall } from '@prisma/client';

export type CallerTier = 'NEW' | 'RAPID_REDIAL' | 'SAME_DAY' | 'RETURNING';

export interface LastConversationSummary {
  id: string;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
}

export interface LastOrderSummary {
  id: string;
  orderNumber: string;
  items: unknown;
  totalCents: number;
  createdAt: Date;
}

export interface CallerContext {
  contact: Contact | null;
  recentMissedCalls: MissedCall[];
  lastConversation: LastConversationSummary | null;
  lastOrder: LastOrderSummary | null;
  tier: CallerTier;
  isRapidRedial: boolean;
}

const RAPID_REDIAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const SAME_DAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RETURNING_RECENCY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Tier classification rules (evaluated in order):
 *  - RAPID_REDIAL: ≥1 prior missed call from this number in last 5 min
 *  - RETURNING:    has a lastOrder (within 90 days) OR contact.status ∈ {CUSTOMER, VIP}
 *  - SAME_DAY:     has another missed call or active conversation in the last 24h
 *  - NEW:          none of the above
 */
export function classifyCallerTier(input: {
  recentMissedCalls: MissedCall[];
  lastOrder: LastOrderSummary | null;
  contactStatus: Contact['status'] | null;
  now?: Date;
}): { tier: CallerTier; isRapidRedial: boolean } {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  const callsInRapidWindow = input.recentMissedCalls.filter(
    (mc) => nowMs - mc.occurredAt.getTime() <= RAPID_REDIAL_WINDOW_MS
  );
  const isRapidRedial = callsInRapidWindow.length >= 1;
  if (isRapidRedial) return { tier: 'RAPID_REDIAL', isRapidRedial };

  const hasRecentOrder =
    !!input.lastOrder && nowMs - input.lastOrder.createdAt.getTime() <= RETURNING_RECENCY_MS;
  const isKnownCustomer =
    input.contactStatus === 'CUSTOMER' || input.contactStatus === 'VIP';
  if (hasRecentOrder || isKnownCustomer) return { tier: 'RETURNING', isRapidRedial };

  const hasSameDayCall = input.recentMissedCalls.some(
    (mc) => nowMs - mc.occurredAt.getTime() <= SAME_DAY_WINDOW_MS
  );
  if (hasSameDayCall) return { tier: 'SAME_DAY', isRapidRedial };

  return { tier: 'NEW', isRapidRedial };
}

/**
 * Looks up everything we know about a caller for this tenant in a single helper.
 * Used by the voice webhook + inbound SMS handler to make conversations feel
 * human instead of scripted.
 */
export async function getCallerContext(
  tenantId: string,
  callerPhone: string
): Promise<CallerContext> {
  const since24h = new Date(Date.now() - SAME_DAY_WINDOW_MS);

  const [contact, recentMissedCalls, lastConversationRow, lastOrderRow] = await Promise.all([
    prisma.contact.findFirst({ where: { tenantId, phone: callerPhone } }),
    prisma.missedCall.findMany({
      where: { tenantId, callerPhone, occurredAt: { gte: since24h } },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    }),
    prisma.conversation.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, updatedAt: true, messages: true },
    }),
    prisma.order.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        items: true,
        total: true,
        createdAt: true,
      },
    }),
  ]);

  let lastConversation: LastConversationSummary | null = null;
  if (lastConversationRow) {
    let lastMessagePreview: string | null = null;
    try {
      const raw = Array.isArray(lastConversationRow.messages)
        ? (lastConversationRow.messages as unknown[])
        : [];
      const decrypted = decryptMessages(raw as any) as Array<{ content?: string }>;
      const last = decrypted[decrypted.length - 1];
      if (last && typeof last.content === 'string') {
        lastMessagePreview = last.content.slice(0, 200);
      }
    } catch {
      lastMessagePreview = null;
    }
    lastConversation = {
      id: lastConversationRow.id,
      lastMessageAt: lastConversationRow.updatedAt,
      lastMessagePreview,
    };
  }

  const lastOrder: LastOrderSummary | null = lastOrderRow
    ? {
        id: lastOrderRow.id,
        orderNumber: lastOrderRow.orderNumber,
        items: lastOrderRow.items,
        totalCents: Math.round(Number(lastOrderRow.total) * 100),
        createdAt: lastOrderRow.createdAt,
      }
    : null;

  const { tier, isRapidRedial } = classifyCallerTier({
    recentMissedCalls,
    lastOrder,
    contactStatus: contact?.status ?? null,
  });

  return {
    contact,
    recentMissedCalls,
    lastConversation,
    lastOrder,
    tier,
    isRapidRedial,
  };
}
