import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptMaybePlaintext } from '@/lib/server/encryption';
import { apiSuccess, apiError } from '@/lib/server/response';
import {
  deriveRecoveryDecision,
  applyRecoveryDisposition,
  RECOVERY_PRIORITY_ORDER,
  RECOVERY_STATE_ORDER,
  type RecoveryPriority,
} from '@ringback/shared-types';
import type { RecoveryResolutionReason } from '@prisma/client';

const LOOKBACK_DAYS = 90;
const MAX_ROWS_PER_SOURCE = 750;
const RESOLUTION_REASONS = new Set<RecoveryResolutionReason>([
  'CUSTOMER_CONTACTED',
  'ORDER_HANDLED',
  'QUESTION_ANSWERED',
  'NO_RESPONSE_NEEDED',
  'SPAM_OR_WRONG_NUMBER',
  'OTHER',
]);

type TimelineEvent = {
  id: string;
  type: 'CALL' | 'VOICEMAIL' | 'CONVERSATION' | 'TASK' | 'ORDER' | 'MEETING';
  occurredAt: string;
  title: string;
  detail: string | null;
  href: string | null;
};

function latestDate(values: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (value && (!latest || value > latest)) latest = value;
  }
  return latest;
}

function highestPriority(values: string[]): RecoveryPriority | null {
  let selected: RecoveryPriority | null = null;
  for (const value of values) {
    if (!(value in RECOVERY_PRIORITY_ORDER)) continue;
    const priority = value as RecoveryPriority;
    if (!selected || RECOVERY_PRIORITY_ORDER[priority] < RECOVERY_PRIORITY_ORDER[selected]) {
      selected = priority;
    }
  }
  return selected;
}

function groupByCallerPhone<T extends { callerPhone: string | null }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.callerPhone) continue;
    const existing = grouped.get(row.callerPhone);
    if (existing) existing.push(row);
    else grouped.set(row.callerPhone, [row]);
  }
  return grouped;
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);
  // Fast path for the sidebar badge: derive states and return counts only.
  // Skips the contact scan + name decryption, timeline building, the
  // full-payload response, and the auto-reopen persistence (the full
  // route and the reopen-snoozed cron still handle that).
  const countsOnly = req.nextUrl.searchParams.get('countsOnly') === '1';

  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const now = new Date();
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  try {
    const [missedCalls, conversations, tasks, orders, meetings, contacts, recoveryCases] =
      await Promise.all([
        prisma.missedCall.findMany({
          where: { tenantId, occurredAt: { gte: cutoff } },
          select: {
            id: true,
            callerPhone: true,
            occurredAt: true,
            smsSent: true,
            voicemailUrl: true,
            voicemailDuration: true,
            voicemailReceivedAt: true,
            voicemailTranscript: true,
            voicemailSummary: true,
            voicemailIntent: true,
            voicemailHandledAt: true,
            transcriptionStatus: true,
            firstReplyAt: true,
            ownerRespondedAt: true,
            callerTier: true,
          },
          orderBy: { occurredAt: 'desc' },
          take: MAX_ROWS_PER_SOURCE,
        }),
        prisma.conversation.findMany({
          where: { tenantId, updatedAt: { gte: cutoff } },
          select: {
            id: true,
            callerPhone: true,
            flowType: true,
            handoffStatus: true,
            isActive: true,
            lastMessagePreview: true,
            messageCount: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ROWS_PER_SOURCE,
        }),
        prisma.task.findMany({
          where: {
            tenantId,
            callerPhone: { not: null },
            status: { in: ['OPEN', 'SNOOZED'] },
          },
          select: {
            id: true,
            callerPhone: true,
            title: true,
            description: true,
            source: true,
            priority: true,
            status: true,
            snoozedUntil: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ROWS_PER_SOURCE,
        }),
        prisma.order.findMany({
          where: { tenantId, createdAt: { gte: cutoff } },
          select: {
            id: true,
            callerPhone: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            total: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ROWS_PER_SOURCE,
        }),
        prisma.meeting.findMany({
          where: { tenantId, updatedAt: { gte: cutoff } },
          select: {
            id: true,
            callerPhone: true,
            scheduledAt: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ROWS_PER_SOURCE,
        }),
        countsOnly
          ? Promise.resolve([])
          : prisma.contact.findMany({
              where: { tenantId },
              select: {
                id: true,
                phone: true,
                name: true,
                status: true,
                totalOrders: true,
                totalSpent: true,
              },
            }),
        prisma.recoveryCase.findMany({
          where: { tenantId },
          select: {
            id: true,
            callerPhone: true,
            status: true,
            resolutionReason: true,
            resolutionNote: true,
            resolvedAt: true,
            resolvedBy: true,
            snoozedUntil: true,
            lastHandledActivityAt: true,
            reopenedAt: true,
            reopenReason: true,
          },
        }),
      ]);

    const callsByPhone = groupByCallerPhone(missedCalls);
    const conversationsByPhone = groupByCallerPhone(conversations);
    const tasksByPhone = groupByCallerPhone(tasks);
    const ordersByPhone = groupByCallerPhone(orders);
    const meetingsByPhone = groupByCallerPhone(meetings);
    const phones = new Set<string>([
      ...callsByPhone.keys(),
      ...conversationsByPhone.keys(),
      ...tasksByPhone.keys(),
      ...ordersByPhone.keys(),
      ...meetingsByPhone.keys(),
    ]);

    const contactByPhone = new Map(contacts.map((contact) => [contact.phone, contact]));
    const recoveryCaseByPhone = new Map(recoveryCases.map((item) => [item.callerPhone, item]));
    const autoReopenCaseIds: string[] = [];
    const cases = Array.from(phones).map((callerPhone) => {
      const callerCalls = callsByPhone.get(callerPhone) ?? [];
      const callerConversations = conversationsByPhone.get(callerPhone) ?? [];
      const callerTasks = tasksByPhone.get(callerPhone) ?? [];
      const callerOrders = ordersByPhone.get(callerPhone) ?? [];
      const callerMeetings = meetingsByPhone.get(callerPhone) ?? [];

      const latestCall = callerCalls[0] ?? null;
      const latestConversation = callerConversations[0] ?? null;
      const latestOrder = callerOrders[0] ?? null;
      const latestMeeting = callerMeetings[0] ?? null;
      const latestVoicemail = callerCalls.find((row) => Boolean(row.voicemailUrl)) ?? null;
      const contact = contactByPhone.get(callerPhone) ?? null;
      const openTasks = callerTasks.filter((task) => task.status === 'OPEN');
      const outcomeAt = latestDate([
        latestOrder?.paymentStatus === 'PAID' ? latestOrder.updatedAt : null,
        latestMeeting?.status === 'CONFIRMED' || latestMeeting?.status === 'COMPLETED'
          ? latestMeeting.updatedAt
          : null,
      ]);

      let decision = deriveRecoveryDecision({
        now,
        latestCallAt: latestCall?.occurredAt ?? null,
        latestConversationAt: latestConversation?.updatedAt ?? null,
        latestOutcomeAt: outcomeAt,
        openTaskCount: openTasks.length,
        highestTaskPriority: highestPriority(openTasks.map((task) => task.priority)),
        handoffStatus: latestConversation?.handoffStatus ?? null,
        conversationActive: latestConversation?.isActive ?? false,
        smsSent: latestCall?.smsSent ?? false,
        callerReplied: Boolean(latestCall?.firstReplyAt),
        ownerResponded: Boolean(latestCall?.ownerRespondedAt),
        voicemailIntent: latestVoicemail?.voicemailIntent ?? null,
        voicemailDuration: latestVoicemail?.voicemailDuration ?? null,
        voicemailTranscript: latestVoicemail?.voicemailTranscript ?? null,
        transcriptionStatus: latestVoicemail?.transcriptionStatus ?? null,
        orderStatus: latestOrder?.status ?? null,
        paymentStatus: latestOrder?.paymentStatus ?? null,
        meetingStatus: latestMeeting?.status ?? null,
      });

      const events: TimelineEvent[] = [];
      if (!countsOnly) {
        for (const call of callerCalls.slice(0, 5)) {
          events.push({
            id: `call-${call.id}`,
            type: 'CALL',
            occurredAt: call.occurredAt.toISOString(),
            title: call.callerTier === 'RAPID_REDIAL' ? 'Repeat missed call' : 'Missed call',
            detail: call.smsSent ? 'Automatic recovery text sent' : 'Recovery text was not sent',
            href: null,
          });
          if (call.voicemailUrl) {
            const stalled =
              call.transcriptionStatus === 'pending' &&
              now.getTime() - call.occurredAt.getTime() > 10 * 60 * 1000;
            events.push({
              id: `voicemail-${call.id}`,
              type: 'VOICEMAIL',
              occurredAt: (call.voicemailReceivedAt ?? call.occurredAt).toISOString(),
              title:
                call.voicemailSummary ||
                (call.voicemailDuration && call.voicemailDuration <= 3
                  ? 'No usable message'
                  : 'Voicemail received'),
              detail:
                call.voicemailTranscript ||
                (stalled
                  ? 'Transcription did not complete'
                  : call.transcriptionStatus === 'pending'
                    ? 'Transcribing…'
                    : null),
              href: `/dashboard/voicemails`,
            });
          }
        }
        for (const conversation of callerConversations.slice(0, 3)) {
          events.push({
            id: `conversation-${conversation.id}`,
            type: 'CONVERSATION',
            occurredAt: conversation.updatedAt.toISOString(),
            title:
              conversation.handoffStatus === 'HUMAN'
                ? 'Human-owned SMS conversation'
                : 'SMS conversation',
            detail: conversation.lastMessagePreview,
            href: `/dashboard/conversations/${conversation.id}`,
          });
        }
        for (const task of callerTasks.slice(0, 3)) {
          events.push({
            id: `task-${task.id}`,
            type: 'TASK',
            occurredAt: task.updatedAt.toISOString(),
            title: task.title,
            detail:
              task.status === 'SNOOZED' && task.snoozedUntil
                ? `Snoozed until ${task.snoozedUntil.toISOString()}`
                : task.description,
            href: '/dashboard/tasks',
          });
        }
        for (const order of callerOrders.slice(0, 2)) {
          events.push({
            id: `order-${order.id}`,
            type: 'ORDER',
            occurredAt: order.updatedAt.toISOString(),
            title: `Order ${order.orderNumber} · ${order.status}`,
            detail: `${order.paymentStatus ?? 'UNPAID'} · $${Number(order.total).toFixed(2)}`,
            href: '/dashboard/orders',
          });
        }
        for (const meeting of callerMeetings.slice(0, 2)) {
          events.push({
            id: `meeting-${meeting.id}`,
            type: 'MEETING',
            occurredAt: meeting.updatedAt.toISOString(),
            title: `Meeting ${meeting.status.toLowerCase()}`,
            detail: meeting.scheduledAt?.toISOString() ?? null,
            href: '/dashboard/meetings',
          });
        }
        events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      }

      const lastActivityAt =
        latestDate([
          latestCall?.occurredAt,
          latestConversation?.updatedAt,
          callerTasks[0]?.updatedAt,
          latestOrder?.updatedAt,
          latestMeeting?.updatedAt,
        ]) ?? now;

      const recoveryCase = recoveryCaseByPhone.get(callerPhone) ?? null;
      const dispositionResult = applyRecoveryDisposition(
        decision,
        recoveryCase
          ? {
              status: recoveryCase.status,
              resolutionReason: recoveryCase.resolutionReason,
              snoozedUntil: recoveryCase.snoozedUntil,
              lastHandledActivityAt: recoveryCase.lastHandledActivityAt,
            }
          : null,
        lastActivityAt,
        now
      );
      decision = dispositionResult.decision;
      if (recoveryCase && dispositionResult.shouldAutoReopen) {
        autoReopenCaseIds.push(recoveryCase.id);
      }

      return {
        callerPhone,
        contact: contact
          ? {
              id: contact.id,
              name: decryptMaybePlaintext(contact.name),
              status: contact.status,
              totalOrders: contact.totalOrders,
              totalSpent: contact.totalSpent,
            }
          : null,
        state: decision.state,
        priority: decision.priority,
        nextAction: decision.nextAction,
        reason: decision.reason,
        lastActivityAt: lastActivityAt.toISOString(),
        callCount: callerCalls.length,
        callCount24h: callerCalls.filter(
          (call) => now.getTime() - call.occurredAt.getTime() <= 24 * 60 * 60 * 1000
        ).length,
        openTaskCount: openTasks.length,
        voicemail: latestVoicemail
          ? {
              id: latestVoicemail.id,
              duration: latestVoicemail.voicemailDuration,
              intent: latestVoicemail.voicemailIntent,
              summary: latestVoicemail.voicemailSummary,
              transcriptionStatus: latestVoicemail.transcriptionStatus,
            }
          : null,
        conversation: latestConversation
          ? {
              id: latestConversation.id,
              flowType: latestConversation.flowType,
              handoffStatus: latestConversation.handoffStatus,
              isActive: latestConversation.isActive,
              preview: latestConversation.lastMessagePreview,
              messageCount: latestConversation.messageCount,
            }
          : null,
        order: latestOrder
          ? {
              id: latestOrder.id,
              orderNumber: latestOrder.orderNumber,
              status: latestOrder.status,
              paymentStatus: latestOrder.paymentStatus,
              total: Number(latestOrder.total),
            }
          : null,
        meeting: latestMeeting
          ? {
              id: latestMeeting.id,
              status: latestMeeting.status,
              scheduledAt: latestMeeting.scheduledAt?.toISOString() ?? null,
            }
          : null,
        disposition: recoveryCase
          ? {
              status:
                recoveryCase.status !== 'ACTIVE' && dispositionResult.shouldAutoReopen
                  ? 'ACTIVE'
                  : recoveryCase.status,
              resolutionReason: recoveryCase.resolutionReason,
              resolutionNote: recoveryCase.resolutionNote,
              resolvedAt: recoveryCase.resolvedAt?.toISOString() ?? null,
              resolvedBy: recoveryCase.resolvedBy,
              snoozedUntil: recoveryCase.snoozedUntil?.toISOString() ?? null,
              reopenedAt: recoveryCase.reopenedAt?.toISOString() ?? null,
              reopenReason: recoveryCase.reopenReason,
            }
          : null,
        events: events.slice(0, 12),
      };
    });

    if (autoReopenCaseIds.length > 0 && !countsOnly) {
      await prisma.$transaction(async (tx) => {
        for (const id of autoReopenCaseIds) {
          const reopened = await tx.recoveryCase.updateMany({
            where: { id, status: { not: 'ACTIVE' } },
            data: {
              status: 'ACTIVE',
              snoozedUntil: null,
              reopenedAt: now,
              reopenReason: 'New caller activity or snooze expiration',
            },
          });
          if (reopened.count > 0) {
            await tx.recoveryCaseAction.create({
              data: {
                tenantId,
                recoveryCaseId: id,
                action: 'AUTO_REOPENED',
                actorId: 'system',
                note: 'New caller activity or snooze expiration',
              },
            });
          }
        }
      });
    }

    cases.sort((a, b) => {
      const stateDelta = RECOVERY_STATE_ORDER[a.state] - RECOVERY_STATE_ORDER[b.state];
      if (stateDelta !== 0) return stateDelta;
      const priorityDelta =
        RECOVERY_PRIORITY_ORDER[a.priority] - RECOVERY_PRIORITY_ORDER[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });

    const counts = {
      all: cases.length,
      active: cases.filter((item) => item.state !== 'RESOLVED' && item.state !== 'SNOOZED').length,
      needsAttention: cases.filter((item) => item.state === 'NEEDS_ATTENTION').length,
      aiHandling: cases.filter((item) => item.state === 'AI_HANDLING').length,
      waiting: cases.filter(
        (item) =>
          item.state === 'WAITING_PAYMENT' ||
          item.state === 'WAITING_CUSTOMER' ||
          item.state === 'SNOOZED'
      ).length,
      resolved: cases.filter((item) => item.state === 'RESOLVED').length,
    };

    if (countsOnly) {
      return apiSuccess({ cases: [], counts, generatedAt: now.toISOString() });
    }
    return apiSuccess({ cases, counts, generatedAt: now.toISOString() });
  } catch (error) {
    console.error('[GET /api/recovery-inbox] failed', error);
    return apiError('Failed to load recovery inbox', 500);
  }
}

async function getLatestCallerActivity(
  tenantId: string,
  callerPhone: string
): Promise<Date | null> {
  const [call, conversation, task, order, meeting] = await Promise.all([
    prisma.missedCall.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    }),
    prisma.conversation.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    prisma.task.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    prisma.order.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    prisma.meeting.findFirst({
      where: { tenantId, callerPhone },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);

  return latestDate([
    call?.occurredAt,
    conversation?.updatedAt,
    task?.updatedAt,
    order?.updatedAt,
    meeting?.updatedAt,
  ]);
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
    const callerPhone = typeof body.callerPhone === 'string' ? body.callerPhone.trim() : '';
    const action = typeof body.action === 'string' ? body.action : '';

    if (!tenantId || !callerPhone) return apiError('tenantId and callerPhone required', 400);
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    if (!['resolve', 'snooze', 'reopen'].includes(action)) {
      return apiError('Invalid recovery action', 400);
    }

    const latestActivityAt = await getLatestCallerActivity(tenantId, callerPhone);
    if (!latestActivityAt) return apiError('Recovery case not found', 404);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null;

    let reason: RecoveryResolutionReason | null = null;
    let snoozedUntil: Date | null = null;
    if (action === 'resolve') {
      if (
        typeof body.reason !== 'string' ||
        !RESOLUTION_REASONS.has(body.reason as RecoveryResolutionReason)
      ) {
        return apiError('A valid resolution reason is required', 400);
      }
      reason = body.reason as RecoveryResolutionReason;
    }
    if (action === 'snooze') {
      snoozedUntil = typeof body.snoozedUntil === 'string' ? new Date(body.snoozedUntil) : null;
      if (!snoozedUntil || Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= new Date()) {
        return apiError('A future snooze time is required', 400);
      }
      if (snoozedUntil.getTime() - Date.now() > 30 * 24 * 60 * 60 * 1000) {
        return apiError('Snooze time cannot exceed 30 days', 400);
      }
    }

    const now = new Date();
    const status = action === 'resolve' ? 'RESOLVED' : action === 'snooze' ? 'SNOOZED' : 'ACTIVE';
    const actionType =
      action === 'resolve' ? 'RESOLVED' : action === 'snooze' ? 'SNOOZED' : 'REOPENED';

    const recoveryCase = await prisma.recoveryCase.upsert({
      where: { tenantId_callerPhone: { tenantId, callerPhone } },
      create: {
        tenantId,
        callerPhone,
        status,
        resolutionReason: reason,
        resolutionNote: note,
        resolvedAt: action === 'resolve' ? now : null,
        resolvedBy: action === 'resolve' ? authResult.userId : null,
        snoozedUntil,
        lastHandledActivityAt: action === 'reopen' ? null : latestActivityAt,
        reopenedAt: action === 'reopen' ? now : null,
        reopenReason: action === 'reopen' ? 'Reopened by a team member' : null,
        actions: {
          create: {
            tenantId,
            action: actionType,
            reason,
            note,
            actorId: authResult.userId,
            snoozedUntil,
          },
        },
      },
      update: {
        status,
        resolutionReason: reason,
        resolutionNote: note,
        resolvedAt: action === 'resolve' ? now : null,
        resolvedBy: action === 'resolve' ? authResult.userId : null,
        snoozedUntil,
        lastHandledActivityAt: action === 'reopen' ? null : latestActivityAt,
        reopenedAt: action === 'reopen' ? now : null,
        reopenReason: action === 'reopen' ? 'Reopened by a team member' : null,
        actions: {
          create: {
            tenantId,
            action: actionType,
            reason,
            note,
            actorId: authResult.userId,
            snoozedUntil,
          },
        },
      },
      select: {
        id: true,
        status: true,
        resolutionReason: true,
        resolutionNote: true,
        resolvedAt: true,
        snoozedUntil: true,
      },
    });

    return apiSuccess(recoveryCase);
  } catch (error) {
    console.error('[PATCH /api/recovery-inbox] failed', error);
    return apiError('Failed to update recovery case', 500);
  }
}
