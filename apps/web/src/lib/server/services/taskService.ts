import { Prisma, Task, TaskPriority, TaskSource, TaskStatus, OrderStatus, MeetingStatus, HandoffStatus } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../logger';

export interface CreateTaskInput {
  tenantId: string;
  source: TaskSource;
  title: string;
  description?: string;
  priority?: TaskPriority;
  callerPhone?: string;
  missedCallId?: string;
  conversationId?: string;
  orderId?: string;
  meetingId?: string;
}

/**
 * Create a task. Idempotent on (source, sourceRefId): if an OPEN/SNOOZED task
 * already exists for the same source entity, return the existing one instead
 * of creating a duplicate. Prevents task spam from retried webhooks.
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const refField = sourceRefField(input.source);
  if (refField) {
    const refValue = input[refField];
    if (refValue) {
      const existing = await prisma.task.findFirst({
        where: {
          tenantId: input.tenantId,
          source: input.source,
          [refField]: refValue,
          status: { in: ['OPEN', 'SNOOZED'] },
        },
      });
      if (existing) return existing;
    }
  }

  const task = await prisma.task.create({
    data: {
      tenantId: input.tenantId,
      source: input.source,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 'NORMAL',
      callerPhone: input.callerPhone,
      missedCallId: input.missedCallId,
      conversationId: input.conversationId,
      orderId: input.orderId,
      meetingId: input.meetingId,
    },
  });
  logger.info('Task created', { tenantId: task.tenantId, taskId: task.id, source: task.source });
  return task;
}

export async function listOpenTasks(tenantId: string, limit = 50): Promise<Task[]> {
  return prisma.task.findMany({
    where: { tenantId, status: 'OPEN' },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });
}

export async function listAllTasks(
  tenantId: string,
  filter: { status?: TaskStatus; source?: TaskSource; priority?: TaskPriority } = {}
): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      tenantId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function getOpenTaskCount(tenantId: string): Promise<{ open: number; urgent: number }> {
  const [open, urgent] = await Promise.all([
    prisma.task.count({ where: { tenantId, status: 'OPEN' } }),
    prisma.task.count({ where: { tenantId, status: 'OPEN', priority: 'URGENT' } }),
  ]);
  return { open, urgent };
}

export async function snoozeTask(taskId: string, until: Date): Promise<Task> {
  return prisma.task.update({
    where: { id: taskId },
    data: { status: 'SNOOZED', snoozedUntil: until },
  });
}

export async function dismissTask(taskId: string, userId: string): Promise<Task> {
  return prisma.task.update({
    where: { id: taskId },
    data: { status: 'DISMISSED', completedAt: new Date(), completedBy: userId },
  });
}

export async function reopenTask(taskId: string): Promise<Task> {
  return prisma.task.update({
    where: { id: taskId },
    data: { status: 'OPEN', snoozedUntil: null },
  });
}

/**
 * Mark task DONE *and* resolve the underlying entity. The side-effect mapping:
 *   VOICEMAIL    → MissedCall.voicemailHandledAt = now
 *   CONVERSATION → Conversation.handoffStatus = AI
 *   ORDER        → Order.status = CONFIRMED (only if currently PENDING)
 *   MEETING      → Meeting.status = CONFIRMED (only if currently PENDING)
 *   RAPID_REDIAL → no side effect
 *   MANUAL       → no side effect
 */
export async function completeTask(taskId: string, userId: string): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');

  const sideEffects: string[] = [];

  switch (task.source) {
    case 'VOICEMAIL':
      if (task.missedCallId) {
        await prisma.missedCall.update({
          where: { id: task.missedCallId },
          data: { voicemailHandledAt: new Date() },
        });
        sideEffects.push(`missedCall:${task.missedCallId} voicemailHandledAt`);
      }
      break;
    case 'CONVERSATION':
      if (task.conversationId) {
        await prisma.conversation.update({
          where: { id: task.conversationId },
          data: { handoffStatus: HandoffStatus.AI },
        });
        sideEffects.push(`conversation:${task.conversationId} handoffStatus=AI`);
      }
      break;
    case 'ORDER':
      if (task.orderId) {
        const order = await prisma.order.findUnique({ where: { id: task.orderId } });
        if (order && order.status === OrderStatus.PENDING) {
          await prisma.order.update({
            where: { id: task.orderId },
            data: { status: OrderStatus.CONFIRMED },
          });
          sideEffects.push(`order:${task.orderId} status=CONFIRMED`);
        }
      }
      break;
    case 'MEETING':
      if (task.meetingId) {
        const meeting = await prisma.meeting.findUnique({ where: { id: task.meetingId } });
        if (meeting && meeting.status === MeetingStatus.PENDING) {
          await prisma.meeting.update({
            where: { id: task.meetingId },
            data: { status: MeetingStatus.CONFIRMED },
          });
          sideEffects.push(`meeting:${task.meetingId} status=CONFIRMED`);
        }
      }
      break;
    case 'RAPID_REDIAL':
    case 'MANUAL':
      break;
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { status: 'DONE', completedAt: new Date(), completedBy: userId },
  });

  logger.info('Task completed', {
    tenantId: task.tenantId,
    taskId,
    source: task.source,
    sideEffects,
    completedBy: userId,
  });

  return updated;
}

/**
 * Auto-complete any open task that points at the given source entity.
 * Used by inverse hooks (e.g. order updated outside the task UI).
 */
export async function autoCompleteTasksForEntity(
  source: TaskSource,
  refField: 'orderId' | 'meetingId' | 'conversationId' | 'missedCallId',
  refId: string
): Promise<number> {
  const result = await prisma.task.updateMany({
    where: {
      source,
      [refField]: refId,
      status: { in: ['OPEN', 'SNOOZED'] },
    },
    data: { status: 'DONE', completedAt: new Date() },
  });
  if (result.count > 0) {
    logger.info('Tasks auto-completed', { source, refField, refId, count: result.count });
  }
  return result.count;
}

/**
 * Cron helper: flip SNOOZED → OPEN where snoozedUntil <= now.
 */
export async function reopenSnoozedTasks(): Promise<number> {
  const result = await prisma.task.updateMany({
    where: { status: 'SNOOZED', snoozedUntil: { lte: new Date() } },
    data: { status: 'OPEN', snoozedUntil: null },
  });
  return result.count;
}

/**
 * Hard-delete DONE/DISMISSED tasks older than `days` (default 30).
 * Kept around briefly for analytics, then pruned.
 */
export async function pruneOldTasks(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.task.deleteMany({
    where: {
      status: { in: ['DONE', 'DISMISSED'] },
      updatedAt: { lt: cutoff },
    },
  });
  return result.count;
}

export type SnoozeOption = '1h' | 'tomorrow' | 'next_week';

/**
 * Compute the snooze target time. Tomorrow/next-week land at 9am in the
 * tenant's timezone (caller passes the tz string).
 */
export function computeSnoozeUntil(option: SnoozeOption, timezone = 'America/Chicago'): Date {
  const now = new Date();
  if (option === '1h') {
    return new Date(now.getTime() + 60 * 60 * 1000);
  }
  // Compute "tomorrow 9am" / "next monday 9am" in the tenant's timezone.
  // Strategy: get current Y/M/D in that tz, advance the day, build a Date
  // at the corresponding UTC instant for 9am local.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  const weekday = get('weekday'); // Mon, Tue, etc.

  let daysToAdd = 1;
  if (option === 'next_week') {
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const todayDow = dowMap[weekday] ?? 1;
    daysToAdd = ((1 + 7 - todayDow) % 7) || 7; // next Monday (>=1 day)
  }

  // Construct target at 9am UTC then offset for the tz. Simpler: use a Date
  // built in UTC for the next-day 9am in tenant local, by computing the
  // offset of `now` in that tz.
  const target = new Date(Date.UTC(year, month - 1, day + daysToAdd, 9, 0, 0));
  // The above assumes the tz offset for that date is the same as treating
  // 9am as UTC then subtracting the tz offset. We approximate by computing
  // the offset from now:
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = now.getTime() - localNow.getTime();
  return new Date(target.getTime() + offsetMs);
}

function sourceRefField(source: TaskSource): keyof Pick<CreateTaskInput, 'missedCallId' | 'conversationId' | 'orderId' | 'meetingId'> | null {
  switch (source) {
    case 'VOICEMAIL':
    case 'RAPID_REDIAL':
      return 'missedCallId';
    case 'CONVERSATION':
      return 'conversationId';
    case 'ORDER':
      return 'orderId';
    case 'MEETING':
      return 'meetingId';
    default:
      return null;
  }
}

// Re-export types for convenience
export type { Task, TaskPriority, TaskSource, TaskStatus };
