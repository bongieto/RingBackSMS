import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTenantByClerkOrg } from '@/lib/server/services/tenantService';
import { createTask, listAllTasks, listOpenTasks } from '@/lib/server/services/taskService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { TaskPriority, TaskSource, TaskStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return apiError('Organization required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') as TaskStatus | null;
    const source = url.searchParams.get('source') as TaskSource | null;
    const priority = url.searchParams.get('priority') as TaskPriority | null;

    if (!status || status === 'OPEN') {
      const tasks = await listOpenTasks(tenant.id);
      return apiSuccess(tasks);
    }
    const tasks = await listAllTasks(tenant.id, {
      status: status ?? undefined,
      source: source ?? undefined,
      priority: priority ?? undefined,
    });
    return apiSuccess(tasks);
  } catch (err: any) {
    console.error('[GET /api/tasks] failed', err);
    return apiError('Failed to list tasks', 500);
  }
}

export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return apiError('Organization required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);
    const body = await req.json();
    if (!body?.title || typeof body.title !== 'string') {
      return apiError('title is required', 400);
    }
    const task = await createTask({
      tenantId: tenant.id,
      source: 'MANUAL',
      title: body.title,
      description: typeof body.description === 'string' ? body.description : undefined,
      priority: (body.priority as TaskPriority) ?? 'NORMAL',
    });
    return apiSuccess(task);
  } catch (err: any) {
    console.error('[POST /api/tasks] failed', err);
    return apiError('Failed to create task', 500);
  }
}
