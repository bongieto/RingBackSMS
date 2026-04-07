import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTenantByClerkOrg } from '@/lib/server/services/tenantService';
import {
  completeTask,
  computeSnoozeUntil,
  dismissTask,
  reopenTask,
  snoozeTask,
  SnoozeOption,
} from '@/lib/server/services/taskService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Authentication required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);
    // Ownership check
    const existing = await prisma.task.findUnique({ where: { id: params.id } });
    if (!existing || existing.tenantId !== tenant.id) return apiError('Task not found', 404);

    const body = await req.json();
    const action = body?.action as string;

    switch (action) {
      case 'complete': {
        const t = await completeTask(params.id, userId);
        return apiSuccess(t);
      }
      case 'snooze': {
        const option = (body?.snoozeOption as SnoozeOption) ?? '1h';
        const until = body?.snoozeUntil
          ? new Date(body.snoozeUntil)
          : computeSnoozeUntil(option, tenant.config?.timezone ?? 'America/Chicago');
        const t = await snoozeTask(params.id, until);
        return apiSuccess(t);
      }
      case 'dismiss': {
        const t = await dismissTask(params.id, userId);
        return apiSuccess(t);
      }
      case 'reopen': {
        const t = await reopenTask(params.id);
        return apiSuccess(t);
      }
      default:
        return apiError('Invalid action', 400);
    }
  } catch (err: any) {
    return apiError(err.message ?? 'Failed to update task', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { orgId } = await auth();
  if (!orgId) return apiError('Authentication required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);
    const existing = await prisma.task.findUnique({ where: { id: params.id } });
    if (!existing || existing.tenantId !== tenant.id) return apiError('Task not found', 404);
    if (existing.source !== 'MANUAL') {
      return apiError('Only manual tasks can be deleted', 400);
    }
    await prisma.task.delete({ where: { id: params.id } });
    return apiSuccess({ ok: true });
  } catch (err: any) {
    return apiError(err.message ?? 'Failed to delete task', 500);
  }
}
