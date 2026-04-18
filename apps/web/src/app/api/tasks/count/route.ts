import { auth } from '@clerk/nextjs/server';
import { getTenantByClerkOrg } from '@/lib/server/services/tenantService';
import { getOpenTaskCount } from '@/lib/server/services/taskService';
import { NotFoundError } from '@/lib/server/errors';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return apiError('Organization required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);
    const counts = await getOpenTaskCount(tenant.id);
    return apiSuccess(counts);
  } catch (err: any) {
    // Tenant doesn't exist yet (e.g. user hasn't completed onboarding for
    // this Clerk org). Return zero counts instead of a 500 so the
    // dashboard badge stays quiet.
    if (err instanceof NotFoundError) {
      return apiSuccess({ open: 0, urgent: 0 });
    }
    // Log the underlying error server-side but return a generic message
    // so we never leak Prisma/DB details (table names, query structure) to
    // unauthenticated callers.
    console.error('[GET /api/tasks/count] failed', err);
    return apiError('Failed to count tasks', 500);
  }
}
